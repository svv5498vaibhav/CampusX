import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { MESSAGE_RULES } from '../data/socialOptions.js';

/**
 * One direct message. Written only by services/messageService.js, after it has checked that the sender
 * belongs to the conversation and may still message the other student.
 *
 *   clientId  an id the sender's app picks for each message; sending again with the same one (a retry after
 *             a dropped connection) returns the message already saved instead of a duplicate
 */
const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: MESSAGE_RULES.maxLength },
    clientId: { type: String, maxlength: MESSAGE_RULES.clientIdMaxLength },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

// History newest first (cursor on _id), unread counts (messages after the last one read).
messageSchema.index({ conversation: 1, _id: -1 });
// Retries of the same send.
messageSchema.index({ conversation: 1, sender: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

const Message = mongoose.model('Message', messageSchema);
watchIndexBuild(Message);

export default Message;
