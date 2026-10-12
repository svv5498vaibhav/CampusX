import mongoSanitize from 'express-mongo-sanitize';
import { checkRequestRisk, isAnonymousZoneRequest, recordSecurityEvent } from '../services/securityService.js';
import ApiError from '../utils/ApiError.js';

export const REJECTED_REQUEST_MESSAGE = "This request contains data CampusX can't accept.";

/**
 * Refuses requests no CampusX client ever sends (services/securityService.js checkRequestRisk): keys that
 * reach an object's prototype (__proto__, constructor, prototype), NUL bytes, and JSON nested or sized far
 * beyond any real form. 400, logged once per address and reason every few minutes.
 */
export function rejectRiskyInput(req, parts) {
  const risk = checkRequestRisk(parts);
  if (!risk) return null;
  // Anonymous Zone requests are logged without the address (see services/securityService.js).
  const ip = isAnonymousZoneRequest(req) ? null : req.ip;
  recordSecurityEvent('REQUEST_REJECTED', { ip, throttleKey: `${ip ? `ip:${ip}` : 'anonymous-zone'}:${risk.reason}`, metadata: { reason: risk.reason, method: req.method } });
  return ApiError.badRequest(REJECTED_REQUEST_MESSAGE);
}

/**
 * Strips keys that start with "$" or contain "." from user input, blocking
 * MongoDB operator injection such as { "email": { "$ne": null } }.
 *
 * express-mongo-sanitize's bundled middleware reassigns req.query, which is a
 * read-only getter in Express 5, so we use its sanitize() helper directly and
 * pin the cleaned query object onto the request.
 */
export function sanitizeRequest(req, res, next) {
  const rejected = rejectRiskyInput(req, { body: req.body, query: req.query });
  if (rejected) return next(rejected);

  if (req.body) {
    mongoSanitize.sanitize(req.body);
  }

  const query = mongoSanitize.sanitize(req.query);
  Object.defineProperty(req, 'query', {
    value: query,
    writable: true,
    configurable: true,
    enumerable: true,
  });

  return next();
}
