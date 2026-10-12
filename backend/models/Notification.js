import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { NOTIFICATION_ENTITY_TYPES, NOTIFICATION_TYPE_IDS } from '../data/notificationOptions.js';

/**
 * One in-app notification for one student. Written only by services/notificationService.js, from
 * server-side events; no request can create one or pick its recipient.
 *
 *   actor      the student who did it, or null for CampusX/system messages and anything from the
 *              Anonymous Zone (an anonymous notification never stores who acted)
 *   message    may contain "{actor}", filled with the actor's current name when it is shown
 *   dedupeKey  recipient + type + subject; at most one unread notification per key (see the
 *              `policy` of each type in data/notificationOptions.js)
 *   count      how many events a grouped notification stands for
 *   eventAt    when the latest of those events happened (notifications are listed by it)
 */
const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, enum: NOTIFICATION_TYPE_IDS, required: true },
    title: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 400 },
    entityType: { type: String, enum: NOTIFICATION_ENTITY_TYPES, default: null },
    entityId: { type: String, default: null },
    // Small, display-only details (a level, a badge key). Never identities or private data.
    metadata: { type: mongoose.Schema.Types.Mixed },
    dedupeKey: { type: String },
    count: { type: Number, default: 1, min: 1 },
    eventAt: { type: Date, default: Date.now },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The notification center (all / unread) and the unread count.
notificationSchema.index({ recipient: 1, eventAt: -1, _id: -1 });
notificationSchema.index({ recipient: 1, isRead: 1, eventAt: -1 });
// One unread notification per dedupe key, even when two events arrive at once.
notificationSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { isRead: false, dedupeKey: { $type: 'string' } } });
// "Was this ever sent?" checks for once-only notifications (read ones included).
notificationSchema.index({ dedupeKey: 1, createdAt: -1 }, { partialFilterExpression: { dedupeKey: { $type: 'string' } } });

const Notification = mongoose.model('Notification', notificationSchema);
watchIndexBuild(Notification);

export default Notification;
