/**
 * Every successful response shares one envelope:
 *   { success: true, message, data, meta? }
 * `data` is always present (an empty object when there is nothing to return);
 * `meta` is reserved for pagination.
 */
export function sendSuccess(res, { statusCode = 200, message = 'OK', data = {}, meta } = {}) {
  const body = { success: true, message, data };
  if (meta !== undefined) body.meta = meta;
  return res.status(statusCode).json(body);
}
