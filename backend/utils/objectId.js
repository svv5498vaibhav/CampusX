import mongoose from 'mongoose';

/** A 24-character hex id as an ObjectId, or null for anything else (callers treat it as "not found"). */
export const toObjectId = (value) =>
  typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? new mongoose.Types.ObjectId(value) : null;
