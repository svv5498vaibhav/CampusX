import { MESSAGE_RULES } from '../data/socialOptions.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User, { ACCOUNT_STATUSES } from '../models/User.js';
import { emitToUser } from '../sockets/socket.js';
import { SOCKET_EVENTS } from '../sockets/socketEvents.js';
import ApiError from '../utils/ApiError.js';
import { toObjectId } from '../utils/objectId.js';
import { blockStateBetween, blockedAmong, loadActiveStudent } from './followService.js';
import { assertCanPublish, detectMaliciousLinks } from './moderationService.js';
import { getStudentSummaries } from './profileService.js';

/*
 * Direct messages between two students: the only place conversations and messages are read or written.
 * Every request acts as the signed-in student (`viewer`, req.user) and every conversation is loaded through
 * loadOwnConversation(), which only finds conversations the viewer takes part in: anyone else's conversation
 * looks exactly like a missing one (404), for reading, sending and marking as read alike.
 *
 * Rules:
 *   - two students share exactly one conversation (Conversation.pairKey is unique), even when both open it
 *     at the same moment
 *   - a new message needs the other student's account to be active and no block in either direction; the
 *     history stays readable either way
 *   - students under a Trust & Safety posting pause can't send messages (assertCanPublish), and messages with
 *     unsafe links (e.g. javascript:, links hiding their address) are refused
 *   - messages are plain text; a retried send with the same clientId returns the message already saved
 *   - messaging never follows anyone
 *
 * Messages are saved first, then delivered over Socket.IO (to both students' open tabs, each seeing the
 * conversation from their side). Without a live connection the same data comes from the REST API.
 */

export const CONVERSATION_NOT_FOUND = "We couldn't find that conversation.";
const CANT_MESSAGE = "You can't message this student.";
const UNAVAILABLE = "This student isn't available on CampusX right now, so you can't send new messages.";
const UNSAFE_LINK = "This message has a link that doesn't look safe, so it wasn't sent. Please remove it and try again.";
const UNSAFE_LINK_FLAGS = new Set(['dangerous_link', 'deceptive_link']);
// Shown for a conversation whose other student is no longer active (suspended, closed or deleted).
const UNAVAILABLE_STUDENT = { id: null, firstName: 'CampusX', lastName: 'student', avatarUrl: null, college: null, branch: null, semester: null, unavailable: true };

const { ACTIVE } = ACCOUNT_STATUSES;
const idOf = (value) => value?.toString?.() ?? String(value);
export const pairKeyOf = (a, b) => [idOf(a), idOf(b)].sort().join(':');
const otherParticipant = (conversation, userId) => conversation.participants.find((id) => !id.equals(userId));
const memberOf = (conversation, userId) => conversation.members.find((member) => member.user.equals(userId)) ?? null;

/** "Text that is too long…" for the inbox preview. */
function preview(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > MESSAGE_RULES.previewLength ? `${clean.slice(0, MESSAGE_RULES.previewLength - 1).trimEnd()}…` : clean;
}

// ----------------------------------------------------------------------------- views

/** A message as `viewerId` sees it. The clientId is only returned to its own sender. */
export function toMessageView(doc, viewerId) {
  const isMine = doc.sender.equals(viewerId);
  return {
    id: doc._id.toString(),
    conversationId: doc.conversation.toString(),
    senderId: doc.sender.toString(),
    isMine,
    text: doc.text,
    createdAt: doc.createdAt,
    ...(isMine && doc.clientId && { clientId: doc.clientId }),
  };
}

/** Unread messages from the other student in one conversation (capped: the inbox shows "99+"). */
async function unreadIn(conversation, viewerId) {
  const last = conversation.lastMessage;
  if (!last) return 0;
  // Read up to the latest message (sending one counts as reading everything before it): nothing to count.
  const mine = memberOf(conversation, viewerId);
  if (mine?.lastReadId && idOf(mine.lastReadId) >= idOf(last.id)) return 0;
  return Message.countDocuments({ conversation: conversation._id, sender: { $ne: viewerId }, ...(mine?.lastReadId && { _id: { $gt: mine.lastReadId } }) }).limit(
    MESSAGE_RULES.unreadCountCap + 1,
  );
}

/** Conversations as `viewerId` sees them: the other student's public summary, the latest message, unread. */
async function toConversationViews(docs, viewerId) {
  if (!docs.length) return [];
  const otherIds = docs.map((doc) => otherParticipant(doc, viewerId)).filter(Boolean);
  const [summaries, blocked, unread] = await Promise.all([
    getStudentSummaries(otherIds),
    blockedAmong(viewerId, otherIds),
    Promise.all(docs.map((doc) => unreadIn(doc, viewerId))),
  ]);
  return docs.map((doc, index) => {
    const otherId = otherParticipant(doc, viewerId);
    const summary = otherId ? summaries.get(otherId.toString()) : null;
    const mine = memberOf(doc, viewerId);
    const theirs = otherId ? memberOf(doc, otherId) : null;
    const isBlocked = Boolean(otherId) && blocked.has(otherId.toString());
    return {
      id: doc._id.toString(),
      participant: summary ?? UNAVAILABLE_STUDENT,
      lastMessage: doc.lastMessage
        ? { id: doc.lastMessage.id.toString(), preview: doc.lastMessage.preview, at: doc.lastMessage.at, isMine: doc.lastMessage.sender.equals(viewerId) }
        : null,
      lastMessageAt: doc.lastMessageAt ?? null,
      unreadCount: unread[index],
      lastReadId: mine?.lastReadId?.toString() ?? null,
      // "Seen": the other student has read your messages up to this one.
      otherLastReadId: theirs?.lastReadId?.toString() ?? null,
      canMessage: Boolean(summary) && !isBlocked,
      createdAt: doc.createdAt,
    };
  });
}

const toConversationView = async (doc, viewerId) => (await toConversationViews([doc], viewerId))[0];

// ----------------------------------------------------------------------------- loading

/** A conversation the viewer takes part in, or a 404 (someone else's looks exactly like a missing one). */
async function loadOwnConversation(viewer, conversationId) {
  const id = toObjectId(String(conversationId ?? ''));
  const conversation = id ? await Conversation.findOne({ _id: id, participants: viewer._id }).lean() : null;
  if (!conversation) throw ApiError.notFound(CONVERSATION_NOT_FOUND);
  return conversation;
}

export async function getConversation(viewer, conversationId) {
  return toConversationView(await loadOwnConversation(viewer, conversationId), viewer._id);
}

/** Conversations with at least one unread message from the other student (the Messages badge). */
export async function getUnreadConversationCount(userId) {
  const id = toObjectId(idOf(userId));
  if (!id) return 0;
  const [row] = await Conversation.aggregate([
    { $match: { participants: id, lastMessage: { $ne: null }, 'lastMessage.sender': { $ne: id } } },
    { $project: { last: '$lastMessage.id', me: { $arrayElemAt: [{ $filter: { input: '$members', cond: { $eq: ['$$this.user', id] } } }, 0] } } },
    { $match: { $expr: { $or: [{ $eq: [{ $ifNull: ['$me.lastReadId', null] }, null] }, { $lt: ['$me.lastReadId', '$last'] }] } } },
    { $count: 'count' },
  ]);
  return row?.count ?? 0;
}

// ----------------------------------------------------------------------------- the inbox

const parseInboxCursor = (cursor) => {
  const match = /^(\d{1,15})_([a-f\d]{24})$/i.exec(String(cursor ?? ''));
  return match ? { at: new Date(Number(match[1])), id: toObjectId(match[2]) } : null;
};

/** The viewer's conversations with at least one message, latest activity first. */
export async function listConversations(viewer, { cursor, limit = MESSAGE_RULES.conversationPageSize.default } = {}) {
  const after = parseInboxCursor(cursor);
  const match = {
    participants: viewer._id,
    lastMessageAt: { $ne: null },
    ...(after && { $or: [{ lastMessageAt: { $lt: after.at } }, { lastMessageAt: after.at, _id: { $lt: after.id } }] }),
  };
  const rows = await Conversation.find(match).sort({ lastMessageAt: -1, _id: -1 }).limit(limit + 1).lean();
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const [conversations, unreadCount] = await Promise.all([toConversationViews(page, viewer._id), getUnreadConversationCount(viewer._id)]);
  return {
    conversations,
    unreadCount,
    pagination: { limit, hasMore: rows.length > limit, nextCursor: rows.length > limit ? `${last.lastMessageAt.getTime()}_${last._id}` : null },
  };
}

// ----------------------------------------------------------------------------- starting a conversation

/** Whether the viewer may send a new message to `otherId` right now; throws the reason when not. */
async function assertCanMessage(viewer, otherId) {
  const [other, blocks] = await Promise.all([User.findById(otherId).select('status').lean(), blockStateBetween(viewer._id, otherId)]);
  if (!other || other.status !== ACTIVE) throw ApiError.forbidden(UNAVAILABLE);
  if (blocks.any) throw ApiError.forbidden(CANT_MESSAGE);
}

/**
 * Opens the viewer's conversation with another student: the existing one, or a new empty one. An empty
 * conversation isn't in anyone's inbox until its first message. Returns { conversation, created }.
 */
export async function openConversation(viewer, targetId) {
  const target = await loadActiveStudent(targetId);
  if (target._id.equals(viewer._id)) throw ApiError.unprocessable("You can't message yourself.");
  if ((await blockStateBetween(viewer._id, target._id)).any) throw ApiError.forbidden(CANT_MESSAGE);

  const pairKey = pairKeyOf(viewer._id, target._id);
  let conversation = await Conversation.findOne({ pairKey }).lean();
  let created = false;
  if (!conversation) {
    const participants = [viewer._id, target._id].sort((a, b) => idOf(a).localeCompare(idOf(b)));
    try {
      conversation = (await Conversation.create({ participants, pairKey, createdBy: viewer._id, members: participants.map((user) => ({ user })) })).toObject();
      created = true;
    } catch (error) {
      // Both students opened it at the same moment: the other request created it.
      if (error?.code !== 11000) throw error;
      conversation = await Conversation.findOne({ pairKey }).lean();
    }
  }
  return { conversation: await toConversationView(conversation, viewer._id), created };
}

// ----------------------------------------------------------------------------- messages

/** One page of history, oldest first within the page. `before` is the oldest message id already shown. */
export async function listMessages(viewer, conversationId, { before, limit = MESSAGE_RULES.pageSize.default } = {}) {
  const conversation = await loadOwnConversation(viewer, conversationId);
  const beforeId = toObjectId(String(before ?? ''));
  const rows = await Message.find({ conversation: conversation._id, ...(beforeId && { _id: { $lt: beforeId } }) })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const page = rows.slice(0, limit);
  return {
    messages: page.reverse().map((doc) => toMessageView(doc, viewer._id)),
    pagination: { limit, hasMore: rows.length > limit, nextCursor: rows.length > limit ? page[0]._id.toString() : null },
  };
}

/** Delivers a saved message to both students' open tabs, each with the conversation from their own side. */
async function deliverMessage(conversationId, message) {
  const conversation = await Conversation.findById(conversationId).lean();
  if (!conversation) return;
  await Promise.all(
    conversation.participants.map(async (userId) => {
      const [view, unreadCount] = await Promise.all([toConversationView(conversation, userId), getUnreadConversationCount(userId)]);
      emitToUser(userId, SOCKET_EVENTS.MESSAGE_NEW, { conversation: view, message: toMessageView(message, userId) });
      emitToUser(userId, SOCKET_EVENTS.MESSAGE_UNREAD_COUNT, { unreadCount });
    }),
  );
}

/**
 * Sends a message from the viewer. Returns { message, conversation, duplicate } where `duplicate` means a
 * retry of a send that was already saved (nothing new was created or delivered).
 */
export async function sendMessage(viewer, conversationId, { text, clientId = null }) {
  const conversation = await loadOwnConversation(viewer, conversationId);
  const otherId = otherParticipant(conversation, viewer._id);

  const findRetry = () => (clientId ? Message.findOne({ conversation: conversation._id, sender: viewer._id, clientId }).lean() : null);
  const retried = await findRetry();
  if (retried) return { message: toMessageView(retried, viewer._id), conversation: await toConversationView(conversation, viewer._id), duplicate: true };

  await assertCanMessage(viewer, otherId);
  await assertCanPublish(viewer);
  if (detectMaliciousLinks(text).flags?.some((flag) => UNSAFE_LINK_FLAGS.has(flag))) throw ApiError.unprocessable(UNSAFE_LINK, [{ field: 'text', message: UNSAFE_LINK }]);

  let message;
  try {
    message = (await Message.create({ conversation: conversation._id, sender: viewer._id, text, ...(clientId && { clientId }) })).toObject();
  } catch (error) {
    // The same retry arriving twice at once: the first one saved it.
    const saved = error?.code === 11000 ? await findRetry() : null;
    if (!saved) throw error;
    return { message: toMessageView(saved, viewer._id), conversation: await toConversationView(conversation, viewer._id), duplicate: true };
  }

  // The inbox preview moves forward only (two messages saved at the same moment can't put the older one on
  // top), and the sender has read everything up to their own message.
  await Conversation.updateOne(
    { _id: conversation._id, $or: [{ lastMessage: null }, { 'lastMessage.id': { $lt: message._id } }], members: { $elemMatch: { user: viewer._id } } },
    {
      $set: {
        lastMessage: { id: message._id, sender: viewer._id, preview: preview(text), at: message.createdAt },
        lastMessageAt: message.createdAt,
        'members.$.lastReadId': message._id,
        'members.$.lastReadAt': message.createdAt,
      },
    },
  );

  await deliverMessage(conversation._id, message);
  const updated = await Conversation.findById(conversation._id).lean();
  return { message: toMessageView(message, viewer._id), conversation: await toConversationView(updated, viewer._id), duplicate: false };
}

/**
 * Marks the conversation read up to its latest message (only ever forward). The other student's open tabs
 * learn it ("Seen"), and the viewer's other tabs update their unread badge.
 */
export async function markConversationRead(viewer, conversationId) {
  const conversation = await loadOwnConversation(viewer, conversationId);
  const latest = conversation.lastMessage?.id ?? null;
  const readAt = new Date();
  let changed = false;
  if (latest) {
    const { modifiedCount } = await Conversation.updateOne(
      { _id: conversation._id, members: { $elemMatch: { user: viewer._id, $or: [{ lastReadId: null }, { lastReadId: { $lt: latest } }] } } },
      { $set: { 'members.$.lastReadId': latest, 'members.$.lastReadAt': readAt } },
    );
    changed = modifiedCount > 0;
  }
  const unreadCount = await getUnreadConversationCount(viewer._id);
  const payload = { conversationId: conversation._id.toString(), userId: viewer._id.toString(), lastReadId: latest?.toString() ?? null, lastReadAt: readAt };
  if (changed) {
    const otherId = otherParticipant(conversation, viewer._id);
    if (otherId) emitToUser(otherId, SOCKET_EVENTS.CONVERSATION_READ, payload);
    emitToUser(viewer._id, SOCKET_EVENTS.CONVERSATION_READ, payload);
    emitToUser(viewer._id, SOCKET_EVENTS.MESSAGE_UNREAD_COUNT, { unreadCount });
  }
  return { ...payload, changed, unreadCount };
}
