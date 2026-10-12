import ApiError from '../utils/ApiError.js';

/** Catches requests that matched no route and hands a 404 to the error handler. */
export function notFound(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.path}`));
}
