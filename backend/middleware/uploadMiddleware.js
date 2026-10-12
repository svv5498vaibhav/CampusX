import crypto from 'node:crypto';
import mongoSanitize from 'express-mongo-sanitize';
import multer from 'multer';
import env from '../config/env.js';
import { BYTES_PER_MB, MEDIA_PRESETS } from '../config/media.js';
import { MEDIA_LIMIT_MESSAGE, POST_RULES } from '../data/postOptions.js';
import { recordRejectedUpload } from '../services/securityService.js';
import ApiError from '../utils/ApiError.js';
import { detectMediaType } from '../utils/mediaSignature.js';
import { removeTempFile } from '../utils/tempFiles.js';
import { canonicalExtension, extensionsFor, pdfHasActiveContent, uploadNameProblem } from '../utils/uploadSafety.js';
import { rejectRiskyInput } from './sanitizeMiddleware.js';

// Files land in backend/uploads temporarily; services/mediaService.js pushes
// them to Cloudinary and deletes the local copy. Disk (not memory) storage keeps
// large videos out of RAM. The temporary name is CampusX's own (time + random id + an
// extension for the declared, already allowed type): nothing from the client's file name
// ever reaches the file system.
const storage = multer.diskStorage({
  destination: env.uploadsDir,
  filename: (req, file, callback) => {
    callback(null, `${Date.now()}-${crypto.randomUUID()}.${canonicalExtension(file.mimetype)}`);
  },
});

const presetFor = (presetName) => {
  const preset = MEDIA_PRESETS[presetName];
  if (!preset) throw new Error(`Unknown media preset: "${presetName}"`);
  return preset;
};

export const FILE_NAME_MESSAGE = "This file's name or extension isn't allowed. Please rename the file and try again.";
export const ACTIVE_PDF_MESSAGE = "PDFs with scripts, attachments or launch actions can't be uploaded. Please upload a plain PDF or an image.";

/** True when the file's name passes (utils/uploadSafety.js); a refusal is logged as a security event. */
function acceptableName(req, file, extensions) {
  const problem = uploadNameProblem(file.originalname, extensions);
  if (problem) recordRejectedUpload(req, problem);
  return !problem;
}

/** Multipart text fields as plain strings only, screened and sanitised like JSON bodies; an ApiError when refused. */
function cleanMultipartFields(req) {
  const fields = Object.fromEntries(Object.entries(req.body ?? {}).filter(([, value]) => typeof value === 'string'));
  const rejected = rejectRiskyInput(req, { body: fields });
  if (rejected) return rejected;
  req.body = mongoSanitize.sanitize(fields);
  return null;
}

/**
 * Returns a multer instance configured for one media preset.
 *
 * Usage (later phases):
 *   router.patch('/me/photo', authenticate, createUploader('profilePhoto').single('photo'), controller)
 */
export function createUploader(presetName) {
  const preset = presetFor(presetName);
  const extensions = extensionsFor(preset.allowedMimeTypes);

  return multer({
    storage,
    limits: { fileSize: preset.maxFileSize },
    fileFilter: (req, file, callback) => {
      if (!preset.allowedMimeTypes.includes(file.mimetype)) {
        return callback(ApiError.badRequest(`Unsupported file type. Allowed: ${preset.allowedMimeTypes.join(', ')}`));
      }
      if (!acceptableName(req, file, extensions)) return callback(new ApiError(415, FILE_NAME_MESSAGE));
      return callback(null, true);
    },
  });
}

const IMAGE_TYPE_MESSAGE = 'Only JPG, PNG, and WEBP images are supported.';

/**
 * Accepts exactly one image in `fieldName` for an image preset and verifies it by its
 * contents (magic bytes), not just its name or declared type. Every rejection is a
 * student-friendly error, and rejected files are deleted from disk at once.
 *
 *   router.post('/avatar', uploadImage('profilePhoto', 'photo'), controller)
 */
export function uploadImage(presetName, fieldName) {
  const preset = presetFor(presetName);
  const extensions = extensionsFor(preset.allowedMimeTypes);
  const sizeMessage = `Please choose an image smaller than ${preset.maxFileSize / BYTES_PER_MB} MB.`;
  const fieldError = (statusCode, message) => new ApiError(statusCode, message, [{ field: fieldName, message }]);

  const parse = multer({
    storage,
    limits: { fileSize: preset.maxFileSize, files: 1, fields: 5, parts: 10 },
    fileFilter: (req, file, callback) => {
      if (!preset.allowedMimeTypes.includes(file.mimetype)) return callback(fieldError(415, IMAGE_TYPE_MESSAGE));
      if (!acceptableName(req, file, extensions)) return callback(fieldError(415, FILE_NAME_MESSAGE));
      return callback(null, true);
    },
  }).single(fieldName);

  return (req, res, next) => {
    parse(req, res, async (error) => {
      if (error instanceof multer.MulterError) {
        return next(
          error.code === 'LIMIT_FILE_SIZE'
            ? fieldError(413, sizeMessage)
            : fieldError(400, `Please upload a single image in the "${fieldName}" field.`),
        );
      }
      if (error) return next(error);
      if (!req.file) return next(fieldError(400, 'Please choose an image to upload.'));

      try {
        const detectedType = await detectMediaType(req.file.path);
        if (!detectedType || !preset.allowedMimeTypes.includes(detectedType)) {
          recordRejectedUpload(req, 'content_not_allowed');
          await removeTempFile(req.file.path);
          return next(fieldError(415, IMAGE_TYPE_MESSAGE));
        }
        req.file.detectedType = detectedType;
        return next();
      } catch (checkError) {
        await removeTempFile(req.file.path);
        return next(checkError);
      }
    });
  };
}

export const MEDIA_TOO_LARGE = 'Media file is too large.';
export const UNSUPPORTED_MEDIA = 'Unsupported media type.';

/**
 * Optional photos/video for a post, in `fieldName` (multipart). Requests without files (or sent as
 * JSON) pass straight through. Each file is checked by its contents and sized by its real kind:
 * photos (JPG, PNG, WEBP) up to the postImage limit, videos (MP4, WEBM) up to the postVideo limit.
 * Accepted files get `mediaKind` ('image' | 'video') and `detectedType`.
 *
 * Temporary files are always deleted once the response has been sent, whatever happened to the
 * request, so a failed validation or upload never leaves files behind.
 */
export function uploadPostMedia(fieldName = 'media') {
  const kinds = { image: presetFor('postImage'), video: presetFor('postVideo') };
  const kindOf = (mimeType) => Object.keys(kinds).find((kind) => kinds[kind].allowedMimeTypes.includes(mimeType));
  const maxFiles = Math.max(POST_RULES.media.maxImages, POST_RULES.media.maxVideos);
  const extensions = extensionsFor([...kinds.image.allowedMimeTypes, ...kinds.video.allowedMimeTypes]);
  const fieldError = (statusCode, message) => new ApiError(statusCode, message, [{ field: fieldName, message }]);

  const parse = multer({
    storage,
    limits: {
      fileSize: Math.max(kinds.image.maxFileSize, kinds.video.maxFileSize),
      files: maxFiles,
      fields: 10,
      parts: 20,
    },
    fileFilter: (req, file, callback) => {
      if (!kindOf(file.mimetype)) return callback(fieldError(415, UNSUPPORTED_MEDIA));
      if (!acceptableName(req, file, extensions)) return callback(fieldError(415, FILE_NAME_MESSAGE));
      return callback(null, true);
    },
  }).array(fieldName, maxFiles);

  const multerError = (error) => {
    if (error.code === 'LIMIT_FILE_SIZE') return fieldError(413, MEDIA_TOO_LARGE);
    if (['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'].includes(error.code) && (!error.field || error.field === fieldName)) {
      return fieldError(422, MEDIA_LIMIT_MESSAGE);
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') return fieldError(400, `Please attach photos or a video in the "${fieldName}" field.`);
    return fieldError(400, 'The upload could not be read. Please try again.');
  };

  return (req, res, next) => {
    res.once('close', () => {
      for (const file of req.files ?? []) removeTempFile(file.path);
    });

    parse(req, res, async (error) => {
      if (error instanceof multer.MulterError) return next(multerError(error));
      if (error) return next(error);
      // Multipart fields skip the app-wide sanitiser (it runs before multer), and bracket names
      // like "type[$ne]" would arrive as objects. Only plain text fields are kept.
      if (req.body && req.is('multipart/form-data')) {
        const rejected = cleanMultipartFields(req);
        if (rejected) return next(rejected);
      }

      try {
        for (const file of req.files ?? []) {
          const detectedType = await detectMediaType(file.path);
          const kind = detectedType && kindOf(detectedType);
          if (!kind) {
            recordRejectedUpload(req, 'content_not_allowed');
            return next(fieldError(415, UNSUPPORTED_MEDIA));
          }
          if (file.size > kinds[kind].maxFileSize) return next(fieldError(413, MEDIA_TOO_LARGE));
          file.mediaKind = kind;
          file.detectedType = detectedType;
        }
        return next();
      } catch (checkError) {
        return next(checkError);
      }
    });
  };
}

/**
 * Several files in `fieldName` (e.g. project images, achievement proof). Each file is checked by its
 * contents and must match one of `presetNames`; it is then sized by that preset's limit. Accepted
 * files get `presetName` and `detectedType`. `messages`: { tooLarge, unsupported, tooMany, missing }.
 * With `optional`, requests without files (or sent as JSON) pass straight through, and the multipart
 * text fields (up to `maxFields`) are kept for the validators, sanitised like the rest of the API.
 * Temporary files are always deleted once the response has been sent.
 */
export function uploadFiles(fieldName, { presets: presetNames, maxFiles, messages, optional = false, maxFields = 5 }) {
  const presetOf = (mimeType) => presetNames.find((name) => presetFor(name).allowedMimeTypes.includes(mimeType));
  const extensions = extensionsFor(presetNames.flatMap((name) => presetFor(name).allowedMimeTypes));
  const fieldError = (statusCode, message) => new ApiError(statusCode, message, [{ field: fieldName, message }]);

  const parse = multer({
    storage,
    limits: {
      fileSize: Math.max(...presetNames.map((name) => presetFor(name).maxFileSize)),
      files: maxFiles,
      fields: maxFields,
      parts: maxFiles + maxFields,
    },
    fileFilter: (req, file, callback) => {
      if (!presetOf(file.mimetype)) return callback(fieldError(415, messages.unsupported));
      if (!acceptableName(req, file, extensions)) return callback(fieldError(415, FILE_NAME_MESSAGE));
      return callback(null, true);
    },
  }).array(fieldName, maxFiles);

  return (req, res, next) => {
    res.once('close', () => {
      for (const file of req.files ?? []) removeTempFile(file.path);
    });

    parse(req, res, async (error) => {
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') return next(fieldError(413, messages.tooLarge));
        if (['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'].includes(error.code) && (!error.field || error.field === fieldName)) {
          return next(fieldError(422, messages.tooMany));
        }
        if (error.code === 'LIMIT_FIELD_COUNT') return next(fieldError(400, 'The upload has too many fields.'));
        return next(fieldError(400, `Please attach files in the "${fieldName}" field.`));
      }
      if (error) return next(error);
      if (optional && req.body && req.is('multipart/form-data')) {
        // Multipart fields skip the app-wide sanitiser (it runs before multer); keep plain text only.
        const rejected = cleanMultipartFields(req);
        if (rejected) return next(rejected);
      }
      if (!req.files?.length) return optional ? next() : next(fieldError(400, messages.missing));

      try {
        for (const file of req.files) {
          const detectedType = await detectMediaType(file.path);
          const presetName = detectedType && presetOf(detectedType);
          if (!presetName) {
            recordRejectedUpload(req, 'content_not_allowed');
            return next(fieldError(415, messages.unsupported));
          }
          if (file.size > presetFor(presetName).maxFileSize) return next(fieldError(413, messages.tooLarge));
          if (detectedType === 'application/pdf' && (await pdfHasActiveContent(file.path))) {
            recordRejectedUpload(req, 'pdf_active_content');
            return next(fieldError(415, ACTIVE_PDF_MESSAGE));
          }
          file.presetName = presetName;
          file.detectedType = detectedType;
        }
        return next();
      } catch (checkError) {
        return next(checkError);
      }
    });
  };
}
