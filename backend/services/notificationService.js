import { LISTED_OPPORTUNITY_STATUSES } from '../data/opportunityOptions.js';
import {
  EDITABLE_CATEGORY_IDS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_IDS,
  NOTIFICATION_RULES,
  NOTIFICATION_TYPES,
} from '../data/notificationOptions.js';
import Achievement from '../models/Achievement.js';
import AnonymousPost from '../models/AnonymousPost.js';
import Community from '../models/Community.js';
import Notification from '../models/Notification.js';
import NotificationPreference from '../models/NotificationPreference.js';
import Opportunity from '../models/Opportunity.js';
import Post from '../models/Post.js';
import Project from '../models/Project.js';
import User, { ACCOUNT_STATUSES } from '../models/User.js';
import { emitToUser } from '../sockets/socket.js';
import { SOCKET_EVENTS } from '../sockets/socketEvents.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import { toObjectId } from '../utils/objectId.js';
import { getStudentSummaries } from './profileService.js';

/*
 * The single place notifications are written, read and delivered. Event listeners
 * (services/notificationEvents.js) decide who should hear about what and call createNotification /
 * createBulkNotifications; the REST API only reads and updates the signed-in student's own
 * notifications. Every change is saved to MongoDB first and then pushed over Socket.IO, so a student
 * without a live connection sees the same thing on their next refresh.
 *
 * Rules applied to every notification:
 *   - nobody is notified about their own action
 *   - only active accounts receive notifications, and only for categories they haven't turned off
 *     (CampusX/system messages always arrive)
 *   - repeats follow the type's policy (data/notificationOptions.js): once, group or always
 */

export const NOTIFICATION_NOT_FOUND = 'Notification not found.';
const SOMEONE = 'A CampusX student';

const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
const isDuplicateKey = (error) => error?.code === 11000 || error?.writeErrors?.every?.((item) => (item.err?.code ?? item.code) === 11000);

/** "Text that is too long…" for quoting a post or comment. */
export function snippet(text, length = NOTIFICATION_RULES.snippetLength) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > length ? `${clean.slice(0, length - 1).trimEnd()}…` : clean;
}

// ----------------------------------------------------------------------------- reading

/** Which linked items still exist (and are still shown), as a Set of "type:id". */
async function availabilityOf(docs) {
  const idsByType = new Map();
  for (const doc of docs) {
    if (!doc.entityType || !doc.entityId) continue;
    if (!idsByType.has(doc.entityType)) idsByType.set(doc.entityType, new Set());
    idsByType.get(doc.entityType).add(doc.entityId);
  }
  const lookups = {
    post: (ids) => Post.find({ _id: { $in: ids }, moderationStatus: { $ne: 'removed' } }),
    project: (ids) => Project.find({ _id: { $in: ids } }),
    achievement: (ids) => Achievement.find({ _id: { $in: ids } }),
    community: (ids) => Community.find({ _id: { $in: ids } }),
    opportunity: (ids) => Opportunity.find({ _id: { $in: ids }, status: { $in: LISTED_OPPORTUNITY_STATUSES } }),
    'anonymous-post': (ids) => AnonymousPost.find({ _id: { $in: ids }, status: 'active' }),
  };
  const available = new Set();
  await Promise.all(
    [...idsByType].map(async ([type, idSet]) => {
      const ids = [...idSet].map(toObjectId).filter(Boolean);
      if (!lookups[type]) return [...idSet].forEach((id) => available.add(`${type}:${id}`));
      const rows = ids.length ? await lookups[type](ids).select('_id').lean() : [];
      rows.forEach((row) => available.add(`${type}:${row._id}`));
    }),
  );
  return available;
}

/**
 * What the student sees. The actor appears only as a short public summary (name and photo), with
 * their current name; a suspended or deleted actor shows as "A CampusX student". Stored dedupe keys
 * and recipient ids never leave the server.
 */
async function toViews(docs, { checkAvailability = true } = {}) {
  if (!docs.length) return [];
  const [actors, available] = await Promise.all([
    getStudentSummaries(docs.map((doc) => doc.actor).filter(Boolean)),
    checkAvailability ? availabilityOf(docs) : null,
  ]);
  return docs.map((doc) => {
    const actor = doc.actor ? actors.get(doc.actor.toString()) ?? null : null;
    const name = actor ? `${actor.firstName} ${actor.lastName}`.trim() : SOMEONE;
    const entityKey = `${doc.entityType}:${doc.entityId}`;
    return {
      id: doc._id.toString(),
      type: doc.type,
      category: NOTIFICATION_TYPES[doc.type]?.category ?? 'system',
      title: doc.title,
      // A function replacement, so "$" in a name is never read as a replacement pattern.
      message: doc.message.replaceAll('{actor}', () => name),
      actor: actor ? { id: actor.id, firstName: actor.firstName, lastName: actor.lastName, avatarUrl: actor.avatarUrl } : null,
      entity: doc.entityType ? { type: doc.entityType, id: doc.entityId, available: !available || !doc.entityId || available.has(entityKey) } : null,
      metadata: doc.metadata ?? {},
      count: doc.count ?? 1,
      isRead: Boolean(doc.isRead),
      readAt: doc.readAt ?? null,
      eventAt: doc.eventAt ?? doc.createdAt,
      createdAt: doc.createdAt,
    };
  });
}

export const getUnreadCount = (userId) => Notification.countDocuments({ recipient: userId, isRead: false });

/** Unread counts for many students in one query, as Map(userId → count). */
async function unreadCounts(userIds) {
  const rows = await Notification.aggregate([
    { $match: { recipient: { $in: userIds.map((id) => toObjectId(String(id))).filter(Boolean) }, isRead: false } },
    { $group: { _id: '$recipient', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id.toString(), row.count]));
}

/** The signed-in student's notifications, newest first: all, or unread only. */
export async function getUserNotifications(viewer, { page = 1, limit = NOTIFICATION_RULES.pageSize.default, filter = 'all' } = {}) {
  const match = { recipient: viewer._id, ...(filter === 'unread' && { isRead: false }) };
  const [rows, total, unreadCount] = await Promise.all([
    Notification.find(match).sort({ eventAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Notification.countDocuments(match),
    getUnreadCount(viewer._id),
  ]);
  return {
    notifications: await toViews(rows),
    pagination: { page, limit, total, hasMore: page * limit < total },
    unreadCount,
  };
}

// ----------------------------------------------------------------------------- delivery

/** Pushes a saved notification to the student's open tabs. Socket.IO is delivery only. */
export function emitNotification(recipientId, notification, unreadCount) {
  emitToUser(recipientId, SOCKET_EVENTS.NOTIFICATION_NEW, { notification, unreadCount });
}

/** Tells the student's other tabs about a read or delete, plus the new unread count. */
async function emitChange(recipientId, event, payload) {
  emitToUser(recipientId, event, payload);
  emitToUser(recipientId, SOCKET_EVENTS.NOTIFICATION_COUNT, { unreadCount: await getUnreadCount(recipientId) });
}

async function deliver(docs) {
  if (!docs.length) return;
  const [views, counts] = await Promise.all([toViews(docs, { checkAvailability: false }), unreadCounts(docs.map((doc) => doc.recipient))]);
  views.forEach((view, index) => {
    const recipient = docs[index].recipient.toString();
    emitNotification(recipient, view, counts.get(recipient) ?? 0);
  });
}

// ----------------------------------------------------------------------------- creating

/** Active students who want this category of notification (system messages always go through). */
async function deliverableRecipients(ids, category) {
  const unique = [...new Set(ids.map(String))].filter((id) => toObjectId(id));
  if (!unique.length) return [];
  const [active, muted] = await Promise.all([
    User.find({ _id: { $in: unique }, status: ACCOUNT_STATUSES.ACTIVE }).select('_id').lean(),
    category === 'system' ? [] : NotificationPreference.find({ user: { $in: unique }, [category]: false }).select('user').lean(),
  ]);
  const mutedIds = new Set(muted.map((row) => row.user.toString()));
  return active.map((user) => user._id.toString()).filter((id) => !mutedIds.has(id));
}

/**
 * The update for an unread notification when another event of the same kind arrives: count up, move
 * it to the top, show the latest actor and details. `{count}` in groupMessage becomes the new count.
 * Strings go in as literals, so text such as "$5" is never read as a field path.
 */
function groupPipeline(spec, now) {
  const template = spec.groupMessage ?? spec.message;
  const [before, after = ''] = template.split('{count}');
  return [
    {
      $set: {
        count: { $add: [{ $ifNull: ['$count', 1] }, 1] },
        eventAt: now,
        updatedAt: now,
        // Pipeline updates aren't cast by Mongoose: pass a real ObjectId.
        actor: spec.actor ? toObjectId(spec.actor) : null,
        title: { $literal: spec.title },
        entityType: { $literal: spec.entityType },
        entityId: { $literal: spec.entityId },
        metadata: { $literal: spec.metadata ?? {} },
      },
    },
    { $set: { message: template.includes('{count}') ? { $concat: [{ $literal: before }, { $toString: '$count' }, { $literal: after }] } : { $literal: template } } },
  ];
}

async function deliverBatch(recipientIds, spec, now) {
  const { policy } = NOTIFICATION_TYPES[spec.type];
  const keyOf = (id) => (spec.dedupeKey && policy !== 'always' ? `${id}:${spec.type}:${spec.dedupeKey}` : undefined);
  let toInsert = recipientIds;
  let grouped = [];

  if (keyOf('x') && policy === 'once') {
    // Never twice for the same key, even after it was read.
    const sent = new Set(await Notification.distinct('dedupeKey', { dedupeKey: { $in: recipientIds.map(keyOf) } }));
    toInsert = recipientIds.filter((id) => !sent.has(keyOf(id)));
  } else if (keyOf('x') && policy === 'group') {
    // Unread ones are updated in place; everyone else gets a new notification.
    const existing = await Notification.find({ dedupeKey: { $in: recipientIds.map(keyOf) }, isRead: false }).select('_id').lean();
    if (existing.length) {
      const ids = existing.map((doc) => doc._id);
      await Notification.updateMany({ _id: { $in: ids }, isRead: false }, groupPipeline(spec, now), { updatePipeline: true });
      grouped = await Notification.find({ _id: { $in: ids }, eventAt: now }).lean();
    }
    const done = new Set(grouped.map((doc) => doc.recipient.toString()));
    toInsert = recipientIds.filter((id) => !done.has(id));
  }

  const docs = toInsert.map((id) => ({
    recipient: id,
    actor: spec.actor ?? null,
    type: spec.type,
    title: spec.title,
    message: spec.message,
    entityType: spec.entityType,
    entityId: spec.entityId,
    ...(spec.metadata && { metadata: spec.metadata }),
    ...(keyOf(id) && { dedupeKey: keyOf(id) }),
    count: 1,
    eventAt: now,
  }));
  let inserted = [];
  if (docs.length) {
    try {
      inserted = (await Notification.insertMany(docs, { ordered: false })).map((doc) => doc.toObject());
    } catch (error) {
      // Another event for the same key landed at the same moment: that one stands.
      if (!isDuplicateKey(error)) throw error;
      inserted = await Notification.find({ dedupeKey: { $in: docs.map((doc) => doc.dedupeKey).filter(Boolean) }, eventAt: now, count: 1 }).lean();
    }
  }
  return [...grouped, ...inserted];
}

/**
 * Notifies several students about the same event (e.g. a community announcement). Recipients are
 * filtered by the rules above, written in batches, then delivered live.
 *
 *   { recipients, actor?, type, title?, message, groupMessage?, entityType?, entityId?, metadata?, dedupeKey? }
 *
 * `dedupeKey` names the subject (e.g. "post:<id>:<liker id>"); the recipient and type are added here.
 * `message` may contain "{actor}" (filled when shown); `groupMessage` may also contain "{count}".
 * Returns the saved notifications.
 */
export async function createBulkNotifications({ recipients, actor = null, type, title, message, groupMessage, entityType = null, entityId = null, metadata, dedupeKey }) {
  const config = NOTIFICATION_TYPES[type];
  if (!config) throw new Error(`Unknown notification type: ${type}`);
  const actorId = actor ? String(actor) : null;
  // Nobody is notified about their own action.
  const candidates = recipients.map(String).filter((id) => id !== actorId);
  const ids = await deliverableRecipients(candidates, config.category);
  const spec = { type, actor: actorId, title: title ?? config.title, message, groupMessage, entityType, entityId: entityId === null ? null : String(entityId), metadata, dedupeKey };
  const saved = [];
  const now = new Date();
  for (const batch of chunk(ids, NOTIFICATION_RULES.bulkBatchSize)) {
    const docs = await deliverBatch(batch, spec, now);
    saved.push(...docs);
    await deliver(docs);
  }
  return saved;
}

/** Notifies one student. Same fields as createBulkNotifications, with `recipient`. Returns the notification or null. */
export async function createNotification({ recipient, ...notification }) {
  const [saved] = await createBulkNotifications({ ...notification, recipients: [recipient] });
  return saved ?? null;
}

/**
 * Takes back an unread notification whose event was undone before the student saw it (e.g. a like
 * removed). Read notifications stay: they already told the student.
 */
export async function withdrawNotification({ recipient, type, dedupeKey }) {
  const doc = await Notification.findOneAndDelete({ dedupeKey: `${recipient}:${type}:${dedupeKey}`, isRead: false }).select('_id recipient').lean();
  if (doc) await emitChange(doc.recipient.toString(), SOCKET_EVENTS.NOTIFICATION_DELETED, { ids: [doc._id.toString()] });
  return Boolean(doc);
}

// ----------------------------------------------------------------------------- the student's own actions

async function loadOwn(viewer, notificationId) {
  const id = toObjectId(notificationId);
  const doc = id ? await Notification.findOne({ _id: id, recipient: viewer._id }).lean() : null;
  // Someone else's notification looks exactly like a missing one.
  if (!doc) throw ApiError.notFound(NOTIFICATION_NOT_FOUND);
  return doc;
}

export async function markAsRead(viewer, notificationId) {
  const doc = await loadOwn(viewer, notificationId);
  let current = doc;
  if (!doc.isRead) {
    const readAt = new Date();
    const updated = await Notification.findOneAndUpdate({ _id: doc._id, recipient: viewer._id, isRead: false }, { $set: { isRead: true, readAt } }, { returnDocument: 'after', lean: true });
    if (updated) {
      current = updated;
      await emitChange(viewer.id, SOCKET_EVENTS.NOTIFICATION_READ, { ids: [doc._id.toString()], readAt });
    }
  }
  const [notification] = await toViews([current]);
  return { notification, unreadCount: await getUnreadCount(viewer._id) };
}

export async function markAllAsRead(viewer) {
  const readAt = new Date();
  const { modifiedCount } = await Notification.updateMany({ recipient: viewer._id, isRead: false }, { $set: { isRead: true, readAt } });
  if (modifiedCount) await emitChange(viewer.id, SOCKET_EVENTS.NOTIFICATION_READ, { all: true, readAt });
  return { updated: modifiedCount, unreadCount: await getUnreadCount(viewer._id) };
}

export async function deleteNotification(viewer, notificationId) {
  const id = toObjectId(notificationId);
  const { deletedCount } = id ? await Notification.deleteOne({ _id: id, recipient: viewer._id }) : { deletedCount: 0 };
  if (!deletedCount) throw ApiError.notFound(NOTIFICATION_NOT_FOUND);
  await emitChange(viewer.id, SOCKET_EVENTS.NOTIFICATION_DELETED, { ids: [notificationId] });
  return { id: notificationId, unreadCount: await getUnreadCount(viewer._id) };
}

/** Clears every notification the student has already read. */
export async function deleteReadNotifications(viewer) {
  const { deletedCount } = await Notification.deleteMany({ recipient: viewer._id, isRead: true });
  if (deletedCount) await emitChange(viewer.id, SOCKET_EVENTS.NOTIFICATION_DELETED, { allRead: true });
  return { deleted: deletedCount, unreadCount: await getUnreadCount(viewer._id) };
}

// ----------------------------------------------------------------------------- preferences

const preferencesView = (doc) => Object.fromEntries(NOTIFICATION_CATEGORY_IDS.map((id) => [id, id === 'system' ? true : doc?.[id] ?? true]));

export async function getPreferences(viewer) {
  const doc = await NotificationPreference.findOne({ user: viewer._id }).lean();
  return { preferences: preferencesView(doc), categories: NOTIFICATION_CATEGORIES };
}

/** Turns categories on or off. `system` isn't editable (the validator refuses it). */
export async function updatePreferences(viewer, changes) {
  const set = Object.fromEntries(EDITABLE_CATEGORY_IDS.filter((id) => typeof changes[id] === 'boolean').map((id) => [id, changes[id]]));
  const save = () => NotificationPreference.findOneAndUpdate({ user: viewer._id }, { $set: set }, { upsert: true, returnDocument: 'after', lean: true });
  let doc;
  try {
    doc = await save();
  } catch (error) {
    // Two saves creating the record at once: the second one now finds it.
    if (error?.code !== 11000) throw error;
    doc = await save();
  }
  return { preferences: preferencesView(doc), categories: NOTIFICATION_CATEGORIES };
}

export const logNotificationError = (what, error) => logger.warn(`Notifications: ${what} failed: ${error?.message ?? error}`);
