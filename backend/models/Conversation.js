import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';

/**
 * A one-to-one direct message conversation. Written only by services/messageService.js.
 *
 *   participants  the two students, smallest id first
 *   pairKey       "<smaller id>:<larger id>": unique, so two students always share exactly one conversation
 *                 even when both open it at the same moment
 *   members       per-student state: the last message they've read (unread counts and "Seen" come from it)
 *   lastMessage   a short preview of the latest message, for the inbox; lastMessageAt orders the inbox and
 *                 stays null until the first message, so an opened-but-empty conversation is in nobody's inbox
 */
const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lastReadId: { type: mongoose.Schema.Types.ObjectId, default: null },
    lastReadAt: { type: Date, default: null },
  },
  { _id: false },
);

const lastMessageSchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    preview: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const conversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      validate: { validator: (value) => value.length === 2, message: 'A conversation has exactly two students.' },
    },
    pairKey: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [memberSchema], default: [] },
    lastMessage: { type: lastMessageSchema, default: null },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

conversationSchema.index({ pairKey: 1 }, { unique: true });
// A student's inbox, latest activity first (cursor pagination on lastMessageAt + _id).
conversationSchema.index({ participants: 1, lastMessageAt: -1, _id: -1 });

const Conversation = mongoose.model('Conversation', conversationSchema);
watchIndexBuild(Conversation);

export default Conversation;
