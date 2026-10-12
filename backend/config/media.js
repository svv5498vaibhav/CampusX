const MB = 1024 * 1024;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/webm'];

// Cloudinary re-checks the format on its side too (allowed_formats).
const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];

// Served versions are optimised on the fly (quality + modern format per browser).
const OPTIMISE = { quality: 'auto', fetch_format: 'auto' };

/**
 * Upload rules per media kind. The upload middleware and the media service both
 * read from here, so size limits, folders and display transformations live in one place.
 *
 * `delivery` transformations are applied when an image is served, never on upload, so the
 * original file on Cloudinary is kept intact.
 */
export const MEDIA_PRESETS = Object.freeze({
  profilePhoto: {
    label: 'Profile photo',
    folder: 'campusx/profile-photos',
    resourceType: 'image',
    allowedMimeTypes: IMAGE_TYPES,
    allowedFormats: IMAGE_FORMATS,
    maxFileSize: 5 * MB,
    // Square, centred on the most important part of the picture (usually the face).
    delivery: [{ width: 400, height: 400, crop: 'fill', gravity: 'auto' }, OPTIMISE],
  },
  coverImage: {
    label: 'Cover image',
    folder: 'campusx/cover-images',
    resourceType: 'image',
    allowedMimeTypes: IMAGE_TYPES,
    allowedFormats: IMAGE_FORMATS,
    maxFileSize: 8 * MB,
    // Wide banner for the profile header.
    delivery: [{ width: 1600, height: 480, crop: 'fill', gravity: 'auto' }, OPTIMISE],
  },
  communityIcon: {
    label: 'Community icon',
    folder: 'campusx/communities/icons',
    resourceType: 'image',
    allowedMimeTypes: IMAGE_TYPES,
    allowedFormats: IMAGE_FORMATS,
    maxFileSize: 2 * MB,
    delivery: [{ width: 256, height: 256, crop: 'fill', gravity: 'auto' }, OPTIMISE],
  },
  communityCover: {
    label: 'Community cover',
    folder: 'campusx/communities/covers',
    resourceType: 'image',
    allowedMimeTypes: IMAGE_TYPES,
    allowedFormats: IMAGE_FORMATS,
    maxFileSize: 5 * MB,
    delivery: [{ width: 1600, height: 480, crop: 'fill', gravity: 'auto' }, OPTIMISE],
  },
  projectImage: {
    label: 'Project image',
    folder: 'campusx/projects',
    resourceType: 'image',
    allowedMimeTypes: IMAGE_TYPES,
    allowedFormats: IMAGE_FORMATS,
    maxFileSize: 5 * MB,
    delivery: [{ width: 1600, crop: 'limit' }, OPTIMISE],
  },
  achievementProofImage: {
    label: 'Proof',
    folder: 'campusx/achievements/proof',
    resourceType: 'image',
    allowedMimeTypes: IMAGE_TYPES,
    allowedFormats: IMAGE_FORMATS,
    maxFileSize: 10 * MB,
    delivery: [{ width: 1600, crop: 'limit' }, OPTIMISE],
  },
  // PDFs are stored as raw files and served unchanged (Cloudinary doesn't transform them).
  achievementProofPdf: {
    label: 'Proof',
    folder: 'campusx/achievements/proof',
    resourceType: 'raw',
    allowedMimeTypes: ['application/pdf'],
    maxFileSize: 10 * MB,
  },
  opportunityImage: {
    label: 'Opportunity image',
    folder: 'campusx/opportunities/images',
    resourceType: 'image',
    allowedMimeTypes: IMAGE_TYPES,
    allowedFormats: IMAGE_FORMATS,
    maxFileSize: 5 * MB,
    delivery: [{ width: 1600, height: 640, crop: 'fill', gravity: 'auto' }, OPTIMISE],
  },
  opportunityLogo: {
    label: 'Organizer logo',
    folder: 'campusx/opportunities/logos',
    resourceType: 'image',
    allowedMimeTypes: IMAGE_TYPES,
    allowedFormats: IMAGE_FORMATS,
    maxFileSize: 2 * MB,
    // Logos are shown whole on a light tile, never cropped.
    delivery: [{ width: 256, height: 256, crop: 'pad', background: 'white' }, OPTIMISE],
  },
  // Anonymous Zone photos. Stored per post (campusx/anonymous/<postId>), never per student, so a URL
  // can't point back to the author. Served through a transformation, which drops photo metadata.
  anonymousImage: {
    label: 'Image',
    folder: 'campusx/anonymous',
    resourceType: 'image',
    allowedMimeTypes: IMAGE_TYPES,
    allowedFormats: IMAGE_FORMATS,
    maxFileSize: 5 * MB,
    delivery: [{ width: 1600, crop: 'limit' }, OPTIMISE],
  },
  postImage: {
    label: 'Photo',
    folder: 'campusx/posts/images',
    resourceType: 'image',
    allowedMimeTypes: IMAGE_TYPES,
    allowedFormats: IMAGE_FORMATS,
    maxFileSize: 5 * MB,
    // Never upscaled or cropped; large photos are limited to 1600 px wide.
    delivery: [{ width: 1600, crop: 'limit' }, OPTIMISE],
  },
  postVideo: {
    label: 'Video',
    folder: 'campusx/posts/videos',
    resourceType: 'video',
    allowedMimeTypes: VIDEO_TYPES,
    allowedFormats: ['mp4', 'webm'],
    maxFileSize: 50 * MB,
    delivery: [{ quality: 'auto' }],
  },
});

export const BYTES_PER_MB = MB;
