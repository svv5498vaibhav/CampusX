import mongoose from 'mongoose';
import multer from 'multer';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';

// Driver/Mongoose errors that mean "the database can't be reached right now".
const DATABASE_UNAVAILABLE_ERRORS = new Set([
  'MongooseServerSelectionError',
  'MongoServerSelectionError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoNotConnectedError',
]);

// busboy's messages for multipart bodies it can't parse.
const MALFORMED_UPLOAD = /^(Malformed (part header|urlencoded form|content type)|Unexpected end of (form|file)|Multipart: Boundary not found)$/;

// Maps known library errors to ApiErrors. Returns null for unexpected errors.
function toApiError(error) {
  if (error instanceof ApiError) return error;

  // Safety net: token errors are normally handled in authMiddleware.
  if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error?.name)) {
    return ApiError.unauthorized('Your session has expired. Please log in again.');
  }

  if (DATABASE_UNAVAILABLE_ERRORS.has(error?.name) || /buffering timed out/i.test(error?.message ?? '')) {
    return ApiError.serviceUnavailable('The database is temporarily unavailable. Please try again shortly.');
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(error.errors).map(({ path, message }) => ({ field: path, message }));
    return ApiError.unprocessable('Validation failed', errors);
  }

  if (error instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for "${error.path}"`, [
      { field: error.path, message: `"${error.path}" has an invalid format` },
    ]);
  }

  if (error?.code === 11000) {
    // Report which field clashed, never the submitted value (it may be an email address).
    const field = Object.keys(error.keyPattern || error.keyValue || {})[0];
    const message = field ? `${field} is already taken` : 'A record with this value already exists';
    return ApiError.conflict(message, field ? [{ field, message }] : []);
  }

  if (error instanceof multer.MulterError) {
    const statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return new ApiError(statusCode, error.message, error.field ? [{ field: error.field, message: error.message }] : []);
  }

  // A broken multipart body (bad part headers, missing boundary, cut short). The upload parser
  // (busboy, through multer) reports these as plain errors without a system error code.
  if (!error?.code && MALFORMED_UPLOAD.test(error?.message ?? '')) {
    return ApiError.badRequest('The upload could not be read. Please try again.');
  }

  if (error?.type === 'entity.parse.failed') {
    return ApiError.badRequest('Request body contains invalid JSON');
  }

  if (error?.type === 'entity.too.large') {
    return new ApiError(413, 'Request body is too large');
  }

  // http-errors style errors (from body-parser, etc.) that are safe to expose.
  if (error?.expose && error.status >= 400 && error.status < 500) {
    return new ApiError(error.status, error.message);
  }

  return null;
}

/**
 * Central error handler. Every error leaves as { success: false, message, errors }.
 * Unexpected errors get a generic message; details are attached only outside production.
 */
// Express recognises error handlers by their four-argument signature, so `next` must stay.
export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const apiError = toApiError(error);
  const statusCode = apiError?.statusCode ?? 500;

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.path} failed:`, error);
  }

  const body = {
    success: false,
    message: apiError?.message ?? 'Something went wrong. Please try again.',
    errors: apiError?.errors ?? [],
  };

  // Debug details only for unexpected errors; deliberate ApiErrors (even 502/503) already say
  // everything the client should know.
  if (!env.isProduction && !apiError) {
    body.debug = { name: error?.name, message: error?.message, stack: error?.stack };
  }

  return res.status(statusCode).json(body);
}
