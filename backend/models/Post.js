import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import {
  DEFAULT_VISIBILITY,
  MODERATION_STATUSES,
  POST_RULES,
  POST_TYPE_IDS,
  POST_VISIBILITY_IDS,
} from '../data/postOptions.js';
import { SEARCH_TEXT_WEIGHTS, searchTextIndex } from '../data/searchOptions.js';
import { moderationFields } from './moderationFields.js';

export const MEDIA_TYPES = Object.freeze(['image', 'video']);

// Files live on Cloudinary. publicId is kept so the file can be deleted with the post.
const mediaSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  type: { type: String, enum: MEDIA_TYPES, required: true },
  width: { type: Number },
  height: { type: Number },
});

const postSchema = new mongoose.Schema(
  {
    // Always the signed-in student (req.user), never a value sent by the client.
    // Name, photo and campus details are read from the author's profile when the post is shown.
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: POST_TYPE_IDS, default: 'text' },
    content: { type: String, trim: true, maxlength: POST_RULES.content.maxLength, default: '' },
    media: { type: [mediaSchema], default: [] },
    // "community" is set by the server for posts inside a community (members only); students pick
    // one of POST_VISIBILITY_IDS for campus posts.
    visibility: { type: String, enum: [...POST_VISIBILITY_IDS, 'community'], default: DEFAULT_VISIBILITY },
    // The community the post was shared in; null for campus feed posts.
    community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', default: null },
    // Who the post was shared with: the author's college and branch when it was posted, set by
    // the server. Visibility rules are matched against it inside the feed query.
    audience: {
      college: { type: String },
      branch: { type: String },
    },

    // Student ids. Hidden from normal queries; responses only carry counts and the viewer's own state.
    likes: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [], select: false },
    saves: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [], select: false },
    commentsCount: { type: Number, default: 0, min: 0 },
    // Reserved: copying a link happens in the browser and isn't counted yet.
    sharesCount: { type: Number, default: 0, min: 0 },

    // Set whenever the author edits the post ("Edited" label). Likes and comments don't count.
    editedAt: { type: Date, default: null },
    // Posts go live straight away; Trust & Safety (services/moderationService.js) can flag, restrict or
    // remove them (soft delete fields below).
    moderationStatus: { type: String, enum: MODERATION_STATUSES, default: 'approved' },
    ...moderationFields({ existing: ['moderationStatus'] }),
  },
  { timestamps: true },
);

postSchema.index({ createdAt: -1, _id: -1 });
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ type: 1, createdAt: -1 });
postSchema.index({ moderationStatus: 1 });
postSchema.index({ 'audience.college': 1, 'audience.branch': 1, createdAt: -1 });
postSchema.index({ community: 1, createdAt: -1 });

// Search: keyword matching on post text. Search also matches authors and types through the indexes above.
postSchema.index(...searchTextIndex(SEARCH_TEXT_WEIGHTS.post));

const Post = mongoose.model('Post', postSchema);
watchIndexBuild(Post);

export default Post;
