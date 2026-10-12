import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';

/**
 * Which notification categories a student wants (data/notificationOptions.js). Created on the first
 * change; until then every category is on. `system` can't be turned off and isn't stored.
 */
const notificationPreferenceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    likes: { type: Boolean, default: true },
    comments: { type: Boolean, default: true },
    projects: { type: Boolean, default: true },
    achievements: { type: Boolean, default: true },
    communities: { type: Boolean, default: true },
    opportunities: { type: Boolean, default: true },
    rankings: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const NotificationPreference = mongoose.model('NotificationPreference', notificationPreferenceSchema);
watchIndexBuild(NotificationPreference);

export default NotificationPreference;
