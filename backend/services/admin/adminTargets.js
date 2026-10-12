import Achievement from '../../models/Achievement.js';
import AnonymousComment from '../../models/AnonymousComment.js';
import AnonymousPost from '../../models/AnonymousPost.js';
import Comment from '../../models/Comment.js';
import Community from '../../models/Community.js';
import Opportunity from '../../models/Opportunity.js';
import Post from '../../models/Post.js';
import Project from '../../models/Project.js';
import User from '../../models/User.js';
import { toObjectId } from '../../utils/objectId.js';
import { peopleById, truncate } from './adminAccess.js';

/*
 * What staff see of the thing a case or report is about: a title, the text (an excerpt in lists, the
 * full text on detail pages), its status, media links, the student it belongs to and a link to open it
 * in CampusX. One loader per kind, a page at a time (one query per kind on the page).
 *
 * Anonymous posts and comments never carry an author here: `author` is "anonymous". Their `author` field
 * is never selected. The audited reveal (services/anonymousModeration.js) is the only way to learn it.
 */

const EXCERPT = 180;
const DETAIL_TEXT = 6000;
const MAX_MEDIA = 8;

const media = (items = [], kind = (item) => item.type ?? 'image') => items.slice(0, MAX_MEDIA).map((item) => ({ url: item.url, type: kind(item) }));

export const TARGET_LOADERS = Object.freeze({
  post: {
    model: Post,
    select: 'author content type visibility community media moderationStatus commentsCount createdAt editedAt',
    owner: (doc) => doc.author,
    view: (doc) => ({ title: null, text: doc.content, status: doc.moderationStatus ?? 'approved', media: media(doc.media), link: `/post/${doc._id}`, extra: { postType: doc.type, visibility: doc.visibility, inCommunity: Boolean(doc.community), comments: doc.commentsCount ?? 0 } }),
  },
  comment: {
    model: Comment,
    select: 'author content post moderationStatus createdAt',
    owner: (doc) => doc.author,
    view: (doc) => ({ title: null, text: doc.content, status: doc.moderationStatus ?? 'approved', media: [], link: `/post/${doc.post}`, extra: { postId: doc.post.toString() } }),
  },
  project: {
    model: Project,
    select: 'owner title shortDescription description githubUrl liveUrl demoUrl images status visibility moderationStatus views createdAt',
    owner: (doc) => doc.owner,
    view: (doc, { detail }) => ({ title: doc.title, text: detail ? `${doc.shortDescription}\n\n${doc.description}` : doc.shortDescription, status: doc.moderationStatus ?? 'approved', media: media(doc.images, () => 'image'), link: `/projects/${doc._id}`, extra: { projectStatus: doc.status, visibility: doc.visibility, views: doc.views ?? 0, links: [doc.githubUrl, doc.liveUrl, doc.demoUrl].filter(Boolean) } }),
  },
  achievement: {
    model: Achievement,
    select: 'owner title description type organization eventName date certificateUrl proof verificationStatus visibility moderationStatus createdAt',
    owner: (doc) => doc.owner,
    view: (doc) => ({ title: doc.title, text: doc.description, status: doc.moderationStatus ?? 'approved', media: media(doc.proof, (item) => item.kind), link: `/achievements/${doc._id}`, extra: { achievementType: doc.type, organization: doc.organization, verificationStatus: doc.verificationStatus, certificateUrl: doc.certificateUrl ?? null, visibility: doc.visibility } }),
  },
  community: {
    model: Community,
    select: 'name description type visibility official createdBy memberCount status rules tags moderationStatus createdAt',
    owner: (doc) => doc.createdBy,
    view: (doc, { detail }) => ({ title: doc.name, text: detail ? [doc.description, ...(doc.rules ?? []).map((rule) => `• ${rule}`)].filter(Boolean).join('\n') : doc.description, status: doc.moderationStatus ?? 'approved', media: [], link: `/communities/${doc._id}`, extra: { communityType: doc.type, visibility: doc.visibility, official: Boolean(doc.official), members: doc.memberCount ?? 0, communityStatus: doc.status, tags: doc.tags ?? [] } }),
  },
  opportunity: {
    model: Opportunity,
    select: 'title shortDescription description organizer type mode status applicationUrl registrationUrl createdBy views createdAt',
    owner: (doc) => doc.createdBy,
    view: (doc, { detail }) => ({ title: doc.title, text: detail ? `${doc.shortDescription}\n\n${doc.description}` : doc.shortDescription, status: doc.status, media: [], link: `/opportunities/${doc._id}`, extra: { organizer: doc.organizer, opportunityType: doc.type, mode: doc.mode, views: doc.views ?? 0, links: [doc.applicationUrl, doc.registrationUrl].filter(Boolean) } }),
  },
  user: {
    model: User,
    select: 'firstName lastName status role createdAt',
    owner: (doc) => doc._id,
    view: (doc) => ({ title: `${doc.firstName} ${doc.lastName}`.trim(), text: '', status: doc.status, media: [], link: `/admin/users/${doc._id}`, extra: { role: doc.role } }),
  },
  anonymousPost: {
    model: AnonymousPost,
    // Never `author`.
    select: 'title content category media status moderationStatus reportsCount commentsCount createdAt editedAt',
    anonymous: true,
    view: (doc) => ({ title: doc.title, text: doc.content, status: doc.moderationStatus ?? 'approved', media: media(doc.media, () => 'image'), link: `/anonymous/${doc._id}`, extra: { category: doc.category, postStatus: doc.status, comments: doc.commentsCount ?? 0 } }),
  },
  anonymousComment: {
    model: AnonymousComment,
    // Never `author`.
    select: 'content post status moderationStatus reportsCount createdAt',
    anonymous: true,
    view: (doc) => ({ title: null, text: doc.content, status: doc.moderationStatus ?? 'approved', media: [], link: `/anonymous/${doc.post}`, extra: { postId: doc.post.toString(), commentStatus: doc.status } }),
  },
});

const keyOf = (targetType, targetId) => `${targetType}:${targetId}`;

/**
 * Previews for [{ targetType, targetId }], as Map("type:id" → preview). `detail` gives the full text.
 * A preview: { exists, targetType, targetId, title, text, status, media, link, createdAt, extra,
 * author: person | null | "anonymous" }. Missing targets come back as { exists: false }.
 */
export async function previewTargets(items, { detail = false } = {}) {
  const byType = new Map();
  for (const { targetType, targetId } of items) {
    if (!TARGET_LOADERS[targetType]) continue;
    const id = toObjectId(String(targetId));
    if (!id) continue;
    if (!byType.has(targetType)) byType.set(targetType, new Map());
    byType.get(targetType).set(id.toString(), id);
  }

  const docs = [];
  await Promise.all(
    [...byType].map(async ([targetType, ids]) => {
      const loader = TARGET_LOADERS[targetType];
      const found = await loader.model.find({ _id: { $in: [...ids.values()] } }).select(loader.select).lean();
      for (const doc of found) docs.push({ targetType, doc });
    }),
  );

  const owners = await peopleById(docs.filter(({ targetType }) => !TARGET_LOADERS[targetType].anonymous).map(({ targetType, doc }) => TARGET_LOADERS[targetType].owner(doc)));
  const previews = new Map();
  for (const { targetType, doc } of docs) {
    const loader = TARGET_LOADERS[targetType];
    const view = loader.view(doc, { detail });
    const ownerId = loader.anonymous ? null : loader.owner(doc)?.toString();
    previews.set(keyOf(targetType, doc._id), {
      exists: true,
      targetType,
      targetId: doc._id.toString(),
      ...view,
      text: detail ? String(view.text ?? '').slice(0, DETAIL_TEXT) : truncate(view.text, EXCERPT),
      media: detail ? view.media : view.media.slice(0, 1),
      createdAt: doc.createdAt ?? null,
      author: loader.anonymous ? 'anonymous' : ownerId ? (owners.get(ownerId) ?? null) : null,
    });
  }
  for (const { targetType, targetId } of items) {
    const key = keyOf(targetType, targetId);
    if (!previews.has(key)) previews.set(key, { exists: false, targetType, targetId: String(targetId), title: null, text: '', status: null, media: [], link: null, createdAt: null, author: null, extra: {} });
  }
  return previews;
}

export async function previewTarget(targetType, targetId, options) {
  const previews = await previewTargets([{ targetType, targetId }], options);
  return previews.get(keyOf(targetType, targetId)) ?? null;
}

export const previewKey = keyOf;
