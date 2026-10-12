import { validationResult } from 'express-validator';
import ApiError from '../utils/ApiError.js';

/**
 * Runs a list of express-validator chains and forwards a 422 with field-level
 * messages when any of them fail.
 *
 * Usage: router.post('/', validate(createPostRules), controller.create)
 */
export const validate = (rules) => async (req, res, next) => {
  await Promise.all(rules.map((rule) => rule.run(req)));

  const result = validationResult(req);
  if (result.isEmpty()) {
    return next();
  }

  const errors = result
    .array({ onlyFirstError: true })
    .map((error) => ({ field: error.path, location: error.location, message: error.msg }));

  return next(ApiError.unprocessable('Validation failed', errors));
};
