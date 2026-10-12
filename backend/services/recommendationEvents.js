import mongoose from 'mongoose';
import Post from '../models/Post.js';
import Project from '../models/Project.js';
import logger from '../utils/logger.js';
import { createKeyedQueue } from '../utils/keyedQueue.js';
import { CAMPUS_EVENTS, campusEvents } from './campusEvents.js';
import { markProfileStale, recordSignal, removeSignal, topicTraits } from './recommendationProfileService.js';

/*
 * Keeps each student's derived recommendation profile (Phase 14) in step with what they do, from the
 * same campus events gamification and notifications use. Like the other listeners, handlers read the
 * current state from the database (a like counts only while it is still there), so repeats and odd
 * orders are harmless, and one student's events are handled one after another.
 *
 * Recorded: likes and comments on campus posts, likes on projects. Marked for a rebuild (and re-ranked):
 * profile edits, joining or leaving a community, tracking an opportunity, the student's own projects and
 * achievements. Nothing from the Anonymous Zone is ever recorded, and a student's likes on their own
 * content teach nothing.
 */

const oid = (id) => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null);
const lower = (text) => String(text ?? '').trim().toLowerCase();
const queue = createKeyedQueue((key, error) => logger.warn(`Recommendations: updating ${key} failed: ${error?.message ?? error}`));

/** A post like/comment: what kind of post and which known topics it mentions. */
async function onPostActivity({ postId, actorId }, kind) {
  const [id, actor] = [oid(postId), oid(actorId)];
  if (!id || !actor) return;
  const filter = kind === 'post-like' ? { _id: id, likes: actor } : { _id: id };
  const post = await Post.findOne(filter).select('type content author').lean();
  if (!post || post.author.equals(actor)) {
    if (kind === 'post-like') await removeSignal(actor, { kind, ref: postId });
    return;
  }
  await recordSignal(actor, { kind, ref: postId, traits: [`postType:${post.type}`, ...topicTraits(post.content)] });
}

async function onProjectLike({ projectId, actorId }) {
  const [id, actor] = [oid(projectId), oid(actorId)];
  if (!id || !actor) return;
  const project = await Project.findOne({ _id: id, likes: actor }).select('category techStack owner').lean();
  if (!project || project.owner.equals(actor)) {
    await removeSignal(actor, { kind: 'project-like', ref: projectId });
    return;
  }
  const tech = [...new Set((project.techStack ?? []).map(lower).filter(Boolean))].slice(0, 5);
  await recordSignal(actor, { kind: 'project-like', ref: projectId, traits: [`projectCategory:${project.category}`, ...tech.map((item) => `keyword:${item}`)] });
}

const stale = (field) => (payload) => markProfileStale(payload?.[field]);

const HANDLERS = [
  [[CAMPUS_EVENTS.POST_LIKED, CAMPUS_EVENTS.POST_UNLIKED], (payload) => onPostActivity(payload, 'post-like'), 'actorId'],
  [CAMPUS_EVENTS.POST_COMMENTED, (payload) => onPostActivity(payload, 'post-comment'), 'actorId'],
  [[CAMPUS_EVENTS.PROJECT_LIKED, CAMPUS_EVENTS.PROJECT_UNLIKED], onProjectLike, 'actorId'],
  [CAMPUS_EVENTS.STUDENT_PROFILE_CHANGED, stale('userId'), 'userId'],
  [[CAMPUS_EVENTS.COMMUNITY_MEMBER_JOINED, CAMPUS_EVENTS.COMMUNITY_MEMBER_LEFT, CAMPUS_EVENTS.COMMUNITY_MEMBER_REMOVED], stale('userId'), 'userId'],
  [CAMPUS_EVENTS.OPPORTUNITY_TRACKING_CHANGED, stale('userId'), 'userId'],
  [[CAMPUS_EVENTS.PROJECT_CREATED, CAMPUS_EVENTS.PROJECT_UPDATED, CAMPUS_EVENTS.PROJECT_DELETED], stale('ownerId'), 'ownerId'],
  [[CAMPUS_EVENTS.ACHIEVEMENT_CREATED, CAMPUS_EVENTS.ACHIEVEMENT_UPDATED, CAMPUS_EVENTS.ACHIEVEMENT_DELETED], stale('ownerId'), 'ownerId'],
];

export function registerRecommendationListeners() {
  for (const [events, handler, userField] of HANDLERS) {
    for (const event of [].concat(events)) campusEvents.on(event, (payload) => queue.run(`recommendations:${payload?.[userField]}`, () => handler(payload)));
  }
}

/** Resolves once queued profile updates have finished (shutdown and tests). */
export const settled = () => queue.settled();
