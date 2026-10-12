import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { POST_RULES } from '../data/postOptions.js';
import { moderationFields } from './moderationFields.js';

const commentSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    // Always the signed-in student, never a value sent by the client.
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true, minlength: 1, maxlength: POST_RULES.comment.maxLength },
    editedAt: { type: Date, default: null },
    ...moderationFields(),
  },
  { timestamps: true },
);

commentSchema.index({ post: 1, createdAt: -1, _id: -1 });
commentSchema.index({ author: 1 });

const Comment = mongoose.model('Comment', commentSchema);
watchIndexBuild(Comment);

export default Comment;
