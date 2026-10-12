import cloudinary, { isCloudinaryConfigured } from '../config/cloudinary.js';
import { MEDIA_PRESETS } from '../config/media.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import { removeTempFile } from '../utils/tempFiles.js';

const VIDEO_CHUNK_SIZE = 20 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 60_000;

const presetFor = (presetName) => {
  const preset = MEDIA_PRESETS[presetName];
  if (!preset) throw new Error(`Unknown media preset: "${presetName}"`);
  return preset;
};

function assertConfigured() {
  if (!isCloudinaryConfigured) {
    throw ApiError.serviceUnavailable('Media uploads are not configured on this server');
  }
}

// upload_large streams in chunks and only supports callbacks.
const uploadLarge = (filePath, options) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader.upload_large(filePath, options, (error, result) =>
      error ? reject(error) : resolve(result),
    );
  });

/**
 * Uploads a file that multer saved to disk, then deletes the local copy (always).
 * `folder` overrides the preset folder, e.g. to group a student's images.
 * Returns the fields models should persist (publicId is needed to delete later).
 * Cloudinary errors are re-thrown as-is; callers turn them into friendly messages.
 */
export async function uploadMedia(filePath, presetName, { folder } = {}) {
  const preset = presetFor(presetName);

  try {
    assertConfigured();

    const options = {
      folder: folder ?? preset.folder,
      resource_type: preset.resourceType,
      timeout: UPLOAD_TIMEOUT_MS,
      ...(preset.allowedFormats && { allowed_formats: preset.allowedFormats }),
    };
    const result =
      preset.resourceType === 'video'
        ? await uploadLarge(filePath, { ...options, chunk_size: VIDEO_CHUNK_SIZE })
        : await cloudinary.uploader.upload(filePath, options);

    return {
      url: result.secure_url,
      publicId: result.public_id,
      version: result.version,
      resourceType: result.resource_type,
      format: result.format,
      width: result.width,
      height: result.height,
      duration: result.duration,
      bytes: result.bytes,
    };
  } finally {
    await removeTempFile(filePath);
  }
}

/**
 * The URL to display: the preset's delivery transformation applied to the untouched original.
 * `format` adds a file extension (videos need one so browsers know what they're playing).
 * `bytes` (the uploaded size) skips the transformation for files above the preset's maxDeliveryTransformBytes.
 */
export function deliveryUrl(publicId, presetName, version, { format, bytes } = {}) {
  const preset = presetFor(presetName);
  const transform = preset.delivery && !(preset.maxDeliveryTransformBytes && bytes > preset.maxDeliveryTransformBytes);
  return cloudinary.url(publicId, {
    secure: true,
    resource_type: preset.resourceType,
    ...(version && { version }),
    ...(format && { format }),
    ...(transform && { transformation: preset.delivery }),
  });
}

/** A still frame of an uploaded video, shown before it plays (Cloudinary renders it on request). */
export function videoPosterUrl(publicId) {
  return cloudinary.url(publicId, {
    secure: true,
    resource_type: 'video',
    format: 'jpg',
    transformation: [{ width: 1280, crop: 'limit' }, { quality: 'auto' }],
  });
}

/** Removes an asset from Cloudinary. Treats "already gone" as success. */
export async function deleteMedia(publicId, resourceType = 'image') {
  assertConfigured();
  const { result } = await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    invalidate: true,
  });
  return result === 'ok' || result === 'not found';
}

// The SDK drops Cloudinary's explanation of a 401/403 ("missing permissions", wrong key), so the log
// says what to check. Names only, never values.
const CREDENTIALS_HINT =
  ' - check that CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET belong to CLOUDINARY_CLOUD_NAME and that this API key is allowed to upload and delete assets (Cloudinary Console > Settings > API Keys)';

/** Error details for the logs: message, HTTP status, and a hint when Cloudinary refused the credentials. */
const describeCloudinaryError = (error) =>
  `${error?.message ?? error}${error?.http_code ? ` (HTTP ${error.http_code})` : ''}${[401, 403].includes(error?.http_code) ? CREDENTIALS_HINT : ''}`;

/** Cloudinary details stay in the logs; students get a short, friendly message. */
export function friendlyUploadError(error, label) {
  if (error instanceof ApiError && error.statusCode === 503) {
    return ApiError.serviceUnavailable(`${label} uploads aren't available right now. Please try again later.`);
  }
  logger.error(`${label} upload to Cloudinary failed: ${describeCloudinaryError(error)}`);
  return new ApiError(502, `${label} upload failed. Please try again.`);
}

/** Best-effort removal of a file that is no longer used. Failures are logged, never shown. */
export async function discardMedia(publicId, resourceType = 'image') {
  if (!publicId) return;
  try {
    await deleteMedia(publicId, resourceType);
  } catch (error) {
    logger.warn(`Could not delete Cloudinary ${resourceType} ${publicId}; it may need manual cleanup: ${describeCloudinaryError(error)}`);
  }
}
