import { getDatabaseStatus } from '../config/db.js';
import ApiError from '../utils/ApiError.js';

/** Fails fast with 503 instead of letting queries wait on a database that isn't connected. */
export function requireDatabase(req, res, next) {
  if (getDatabaseStatus() !== 'connected') {
    return next(ApiError.serviceUnavailable('The database is temporarily unavailable. Please try again shortly.'));
  }
  return next();
}
