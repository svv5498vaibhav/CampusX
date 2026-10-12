/**
 * Single source for post types, visibility levels, limits and report reasons. The frontend reads
 * these through GET /api/v1/posts/options; icons and colours are its only own additions.
 */

export const POST_TYPES = Object.freeze([
  { id: 'text', label: 'Post', prompt: 'Tell your campus something…' },
  { id: 'photo', label: 'Photo', prompt: 'Share a moment from campus…' },
  { id: 'video', label: 'Video', prompt: 'What’s happening in this clip?' },
  { id: 'campus-update', label: 'Campus update', prompt: 'What’s new around campus?' },
  { id: 'achievement', label: 'Achievement', prompt: 'Share your achievement. You earned it!' },
  { id: 'project', label: 'Project', prompt: 'What did you build today?' },
  { id: 'idea', label: 'Idea', prompt: 'Have a startup idea? Pitch it here…' },
  { id: 'event', label: 'Event', prompt: 'What’s happening, where and when?' },
  { id: 'opportunity', label: 'Opportunity', prompt: 'Found a useful opportunity? Share it…' },
]);
export const POST_TYPE_IDS = Object.freeze(POST_TYPES.map((type) => type.id));

/**
 * Who can see a post. `audience` (the author's college/branch when posting) is stored on the post
 * so these rules can be enforced inside the database query.
 */
export const POST_VISIBILITY = Object.freeze([
  { id: 'campus', label: 'My campus', description: 'Students at your college' },
  { id: 'branch', label: 'My branch', description: 'Students in your branch at your college' },
  { id: 'public', label: 'All of CampusX', description: 'Every CampusX student' },
]);
export const POST_VISIBILITY_IDS = Object.freeze(POST_VISIBILITY.map((option) => option.id));
export const DEFAULT_VISIBILITY = 'campus';

// Defined with the rest of the moderation rules (Trust & Safety, Phase 13).
export { CONTENT_STATUSES as MODERATION_STATUSES } from '../config/moderationConfig.js';

/** Feed filters (GET /posts?filter=…). */
export const FEED_FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'branch', label: 'My Branch' },
  { id: 'achievement', label: 'Achievements' },
  { id: 'project', label: 'Projects' },
  { id: 'idea', label: 'Ideas' },
  { id: 'event', label: 'Events' },
  { id: 'opportunity', label: 'Opportunities' },
]);
export const FEED_FILTER_IDS = Object.freeze(FEED_FILTERS.map((filter) => filter.id));

export const REPORT_REASONS = Object.freeze([
  { id: 'spam', label: 'Spam' },
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'misinformation', label: 'Misinformation' },
  { id: 'other', label: 'Something else' },
]);
export const REPORT_REASON_IDS = Object.freeze(REPORT_REASONS.map((reason) => reason.id));

export const POST_RULES = Object.freeze({
  content: { maxLength: 3000 },
  comment: { maxLength: 1000 },
  reportDetails: { maxLength: 500 },
  // Up to 4 photos, or 1 video (not both).
  media: { maxImages: 4, maxVideos: 1 },
  pageSize: { default: 10, max: 20 },
  commentPageSize: { default: 10, max: 30 },
});

export const MEDIA_LIMIT_MESSAGE = `Add up to ${POST_RULES.media.maxImages} photos, or ${POST_RULES.media.maxVideos} video, to a post.`;
