import { v2 as cloudinary } from 'cloudinary';
import env from './env.js';
import logger from '../utils/logger.js';

const CREDENTIALS = {
  CLOUDINARY_CLOUD_NAME: env.cloudinary.cloudName,
  CLOUDINARY_API_KEY: env.cloudinary.apiKey,
  CLOUDINARY_API_SECRET: env.cloudinary.apiSecret,
};

const missing = Object.keys(CREDENTIALS).filter((name) => !CREDENTIALS[name]);

export const isCloudinaryConfigured = missing.length === 0;

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
}

/** Startup log line. Only variable names are ever printed, never values. */
export function logCloudinaryStatus() {
  if (isCloudinaryConfigured) {
    logger.info('Cloudinary: configured');
  } else if (missing.length < Object.keys(CREDENTIALS).length) {
    logger.warn(`Cloudinary: incomplete (missing ${missing.join(', ')}) - media uploads unavailable`);
  } else {
    logger.warn('Cloudinary: not configured - media uploads unavailable');
  }
}

export default cloudinary;
