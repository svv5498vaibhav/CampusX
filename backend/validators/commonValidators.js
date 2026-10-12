import { param } from 'express-validator';

/** Validates a MongoDB ObjectId route param, e.g. /posts/:id. */
export const mongoIdParam = (name = 'id') =>
  param(name).isMongoId().withMessage(`"${name}" must be a valid id`);
