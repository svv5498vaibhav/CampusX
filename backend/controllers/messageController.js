import { matchedData } from 'express-validator';
import { sendSuccess } from '../utils/apiResponse.js';
import * as messageService from '../services/messageService.js';

// Conversations are private to their two students: never cached by browsers or proxies.
const noStore = (res) => res.set('Cache-Control', 'no-store');
const queryOf = (req) => matchedData(req, { locations: ['query'] });

export async function list(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Conversations', data: await messageService.listConversations(req.user, queryOf(req)) });
}

export async function unreadCount(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Unread conversations', data: { unreadCount: await messageService.getUnreadConversationCount(req.user._id) } });
}

export async function open(req, res) {
  noStore(res);
  const { userId } = matchedData(req, { locations: ['body'] });
  const { conversation, created } = await messageService.openConversation(req.user, userId);
  return sendSuccess(res, { statusCode: created ? 201 : 200, message: created ? 'Conversation started' : 'Conversation', data: { conversation, created } });
}

export async function get(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Conversation', data: { conversation: await messageService.getConversation(req.user, req.params.conversationId) } });
}

export async function messages(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Messages', data: await messageService.listMessages(req.user, req.params.conversationId, queryOf(req)) });
}

export async function send(req, res) {
  noStore(res);
  // Only the validated text and clientId reach the service; the sender is always the signed-in student.
  const { text, clientId } = matchedData(req, { locations: ['body'] });
  const result = await messageService.sendMessage(req.user, req.params.conversationId, { text, clientId: clientId ?? null });
  return sendSuccess(res, { statusCode: result.duplicate ? 200 : 201, message: 'Message sent', data: result });
}

export async function read(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Marked as read', data: await messageService.markConversationRead(req.user, req.params.conversationId) });
}
