import env from '../config/env.js';
import { PUBLIC_STATUSES } from '../config/moderationConfig.js';
import { BADGES, LEVELS } from '../data/gamificationOptions.js';
import { OPPORTUNITY_UPDATE_FIELDS } from '../data/notificationOptions.js';
import { LISTED_OPPORTUNITY_STATUSES } from '../data/opportunityOptions.js';
import Achievement from '../models/Achievement.js';
import AnonymousComment from '../models/AnonymousComment.js';
import AnonymousPost from '../models/AnonymousPost.js';
import Comment from '../models/Comment.js';
import Community from '../models/Community.js';
import CommunityMember from '../models/CommunityMember.js';
import Follow from '../models/Follow.js';
import Opportunity from '../models/Opportunity.js';
import OpportunityApplication from '../models/OpportunityApplication.js';
import Post from '../models/Post.js';
import Project from '../models/Project.js';
import User, { ACCOUNT_STATUSES } from '../models/User.js';
import { createKeyedQueue } from '../utils/keyedQueue.js';
import { toObjectId } from '../utils/objectId.js';
import { CAMPUS_EVENTS, campusEvents } from './campusEvents.js';
import { MANAGER_ROLES, scopeAllows } from './communityAccess.js';
import { createBulkNotifications, createNotification, logNotificationError, snippet, withdrawNotification } from './notificationService.js';
import { canView } from './opportunityAccess.js';
import { listText } from './opportunityService.js';

/*
 * Turns campus events into notifications: who should hear about what. Every handler re-reads the
 * current state from the database (a like that was already taken back notifies nobody), and handlers
 * for the same thing run one after another. Recipients always come from the database (post authors,
 * community members, students tracking an opportunity), never from a request.
 *
 * Anonymous Zone: notifications go to the anonymous post's author, looked up internally, and never
 * carry an actor, a name, a photo or any id of whoever liked or commented: only "Someone ...".
 *
 * Content that Trust & Safety holds back (restricted, pending, removed) never notifies anyone; its owner
 * hears about the moderation decision instead (onContentModerated), without scores, rules or reporters.
 *
 * Not notified, because CampusX has no such feature yet: comment replies, mentions and project comments.
 * Unfollows are never announced, and direct messages have their own unread count instead of notifications. Publishing a new opportunity isn't announced to everyone either; only students
 * tracking an opportunity hear about its changes.
 */

// Ids arrive as strings (event payloads) or ObjectIds (read from documents).
const asId = (value) => (value ? toObjectId(String(value)) : null);
const quote = (text) => `“${snippet(text)}”`;
// Seen by other students: only that content can cause likes, comments or announcements to be notified.
const isPublic = (status) => PUBLIC_STATUSES.includes(status ?? 'approved');

/** "your post “Robotics team needs…”", or "your photo post" when it has no text. */
function postLabel(post) {
  if (post.content?.trim()) return `your post ${quote(post.content)}`;
  return post.media?.some((item) => item.type === 'video') ? 'your video post' : 'your photo post';
}

// ----------------------------------------------------------------------------- posts and projects

export async function onPostLike(postId, likerId) {
  const post = await Post.findById(asId(postId)).select('author content media moderationStatus').lean();
  if (!post) return;
  const target = { recipient: post.author.toString(), type: 'POST_LIKED', dedupeKey: `post:${postId}:${likerId}` };
  const liked = await Post.exists({ _id: post._id, likes: asId(likerId) });
  // Unliked before the author saw it: take the notification back.
  if (!liked || !isPublic(post.moderationStatus)) return withdrawNotification(target);
  return createNotification({ ...target, actor: likerId, message: `{actor} liked ${postLabel(post)}.`, entityType: 'post', entityId: postId });
}

export async function onPostComment(postId, commentId, commenterId) {
  const [post, comment] = await Promise.all([
    Post.findById(asId(postId)).select('author content media moderationStatus').lean(),
    Comment.findById(asId(commentId)).select('content moderationStatus').lean(),
  ]);
  if (!post || !comment || !isPublic(post.moderationStatus) || !isPublic(comment.moderationStatus)) return null;
  // Several comments in a row from the same student become one notification until it's read.
  return createNotification({
    recipient: post.author,
    actor: commenterId,
    type: 'POST_COMMENTED',
    message: `{actor} commented on ${postLabel(post)}: ${quote(comment.content)}`,
    groupMessage: `{actor} left {count} comments on ${postLabel(post)}. Latest: ${quote(comment.content)}`,
    entityType: 'post',
    entityId: postId,
    dedupeKey: `post:${postId}:${commenterId}`,
  });
}

export async function onProjectLike(projectId, likerId) {
  const project = await Project.findById(asId(projectId)).select('owner title').lean();
  if (!project) return;
  const target = { recipient: project.owner.toString(), type: 'PROJECT_LIKED', dedupeKey: `project:${projectId}:${likerId}` };
  if (!(await Project.exists({ _id: project._id, likes: asId(likerId) }))) return withdrawNotification(target);
  return createNotification({ ...target, actor: likerId, message: `{actor} liked your project ${quote(project.title)}.`, entityType: 'project', entityId: projectId });
}

/** Students the owner just added to a project team, while their invitation is still open. */
export async function onTeamInvites(projectId, ownerId, userIds) {
  const project = await Project.findById(asId(projectId)).select('title teamMembers').lean();
  if (!project) return;
  const invited = new Set(project.teamMembers.filter((member) => member.status === 'invited').map((member) => member.user.toString()));
  await createBulkNotifications({
    recipients: userIds.filter((id) => invited.has(String(id))),
    actor: ownerId,
    type: 'PROJECT_TEAM_INVITE',
    message: `{actor} added you to the team of ${quote(project.title)}. Open the project to accept.`,
    entityType: 'project',
    entityId: projectId,
    dedupeKey: `project:${projectId}`,
  });
}

// ----------------------------------------------------------------------------- follows

/**
 * "Aarav Mehta started following you." Re-reads the relationship: a follow taken back before the student saw
 * the notification takes it back too (never an "unfollowed you" notification). Once per follower, ever.
 */
export async function onFollowChanged(followerId, followingId) {
  const target = { recipient: String(followingId), type: 'STUDENT_FOLLOWED', dedupeKey: `follower:${followerId}` };
  const follows = await Follow.exists({ follower: asId(followerId), following: asId(followingId) });
  if (!follows) return withdrawNotification(target);
  return createNotification({ ...target, actor: followerId, message: '{actor} started following you.', entityType: 'student', entityId: followerId });
}

// ----------------------------------------------------------------------------- achievements

/** A moderator's review. The reviewer stays internal: the student hears it from "CampusX". */
export async function onAchievementReviewed(achievementId) {
  const achievement = await Achievement.findById(asId(achievementId)).select('owner title verificationStatus verification').lean();
  if (!achievement || !['verified', 'rejected'].includes(achievement.verificationStatus)) return;
  const verified = achievement.verificationStatus === 'verified';
  const note = achievement.verification?.note?.trim();
  await createNotification({
    recipient: achievement.owner,
    type: verified ? 'ACHIEVEMENT_VERIFIED' : 'ACHIEVEMENT_REJECTED',
    message: verified
      ? `CampusX verified your achievement ${quote(achievement.title)}. It now shows the verified badge.`
      : `CampusX couldn't verify your achievement ${quote(achievement.title)} from the proof provided.${note ? ` Note from the reviewer: ${quote(note)}` : ''} You can add new proof to ask again.`,
    entityType: 'achievement',
    entityId: achievementId,
    dedupeKey: `achievement:${achievementId}:${achievement.verification?.reviewedAt?.getTime?.() ?? 'review'}`,
  });
}

// ----------------------------------------------------------------------------- communities

const activeCommunity = (communityId) => Community.findOne({ _id: asId(communityId), status: 'active' }).select('name visibility college branch semester').lean();

/** Owners hear about new members; joins in a row become one notification until it's read. */
export async function onMemberJoined(communityId, userId) {
  const [community, member] = await Promise.all([
    activeCommunity(communityId),
    CommunityMember.exists({ community: asId(communityId), user: asId(userId), status: 'active' }),
  ]);
  if (!community || !member) return;
  const owners = await CommunityMember.find({ community: community._id, status: 'active', role: 'owner' }).select('user').lean();
  await createBulkNotifications({
    recipients: owners.map((owner) => owner.user),
    actor: userId,
    type: 'COMMUNITY_JOINED',
    message: `{actor} joined ${community.name}.`,
    groupMessage: `{count} students joined ${community.name}, most recently {actor}.`,
    entityType: 'community',
    entityId: communityId,
    dedupeKey: `community:${communityId}:joined`,
  });
}

/**
 * A post by a community's owner or moderator is its announcement: every active member hears about it,
 * if their own profile still fits the community's college/branch/class scope. Posts in a row become
 * one notification per member until it's read.
 */
export async function onCommunityPost(postId) {
  const post = await Post.findById(asId(postId)).select('author community content media moderationStatus').lean();
  if (!post?.community || !isPublic(post.moderationStatus)) return;
  const [community, authorMembership] = await Promise.all([
    activeCommunity(post.community),
    CommunityMember.findOne({ community: post.community, user: post.author, status: 'active' }).select('role').lean(),
  ]);
  if (!community || !MANAGER_ROLES.includes(authorMembership?.role)) return;

  const text = post.content?.trim() ? quote(post.content) : 'a new photo or video';
  const cursor = CommunityMember.find({ community: community._id, status: 'active', user: { $ne: post.author } }).select('user').lean().cursor({ batchSize: 500 });
  let batch = [];
  const flush = async () => {
    const students = await User.find({ _id: { $in: batch }, status: ACCOUNT_STATUSES.ACTIVE }).select('college branch semester').lean();
    await createBulkNotifications({
      recipients: students.filter((student) => scopeAllows(community, student)).map((student) => student._id),
      actor: post.author,
      type: 'COMMUNITY_ANNOUNCEMENT',
      message: `{actor} posted in ${community.name}: ${text}`,
      groupMessage: `{count} new posts from the ${community.name} team. Latest from {actor}: ${text}`,
      entityType: 'post',
      entityId: postId,
      dedupeKey: `community:${community._id}:announcements`,
    });
    batch = [];
  };
  for await (const row of cursor) {
    batch.push(row.user);
    if (batch.length >= 500) await flush();
  }
  if (batch.length) await flush();
}

const ROLE_MESSAGES = {
  owner: (name) => `{actor} made you an owner of ${name}.`,
  moderator: (name) => `{actor} made you a moderator of ${name}.`,
  member: (name) => `{actor} changed your role in ${name} to member.`,
};

export async function onRoleChanged(communityId, userId, role, actorId) {
  if (String(userId) === String(actorId)) return; // stepping down yourself
  const community = await activeCommunity(communityId);
  if (!community || !ROLE_MESSAGES[role]) return;
  await createNotification({ recipient: userId, actor: actorId, type: 'COMMUNITY_ACTIVITY', message: ROLE_MESSAGES[role](community.name), entityType: 'community', entityId: communityId, metadata: { role } });
}

/** Removed by the community's moderators (who did it isn't shown). */
export async function onMemberRemoved(communityId, userId) {
  const community = await Community.findById(asId(communityId)).select('name').lean();
  if (!community) return;
  await createNotification({ recipient: userId, type: 'COMMUNITY_ACTIVITY', message: `You were removed from ${community.name} by its moderators.`, entityType: 'community', entityId: communityId });
}

// ----------------------------------------------------------------------------- opportunities

/**
 * Students tracking an opportunity (not withdrawn or rejected) who may still see it. With
 * `listedOnly: false` the college audience is the only check, so they also hear that it was archived.
 */
async function trackersOf(opportunity, { listedOnly = true } = {}) {
  const records = await OpportunityApplication.find({ opportunity: opportunity._id, status: { $nin: ['withdrawn', 'rejected'] } }).select('user').lean();
  if (!records.length) return [];
  const students = await User.find({ _id: { $in: records.map((record) => record.user) } }).select('college branch semester role').lean();
  const inAudience = (student) => opportunity.visibility !== 'college' || (opportunity.eligibleColleges ?? []).includes(student.college);
  return students.filter((student) => (listedOnly ? canView(opportunity, student) : inAudience(student))).map((student) => student._id);
}

export async function onOpportunityUpdated(opportunityId, changed = []) {
  const fields = changed.filter((field) => OPPORTUNITY_UPDATE_FIELDS[field]);
  if (!fields.length) return;
  const opportunity = await Opportunity.findById(asId(opportunityId)).select('title status visibility eligibleColleges').lean();
  if (!opportunity || !LISTED_OPPORTUNITY_STATUSES.includes(opportunity.status)) return;
  const what = `new ${listText(fields.map((field) => OPPORTUNITY_UPDATE_FIELDS[field]))}`;
  await createBulkNotifications({
    recipients: await trackersOf(opportunity),
    type: 'OPPORTUNITY_UPDATED',
    message: `${quote(opportunity.title)} was updated: ${what}.`,
    groupMessage: `${quote(opportunity.title)} was updated {count} times. Latest: ${what}.`,
    entityType: 'opportunity',
    entityId: opportunityId,
    metadata: { fields },
    dedupeKey: `opportunity:${opportunityId}:updated`,
  });
}

export async function onOpportunityStatus(opportunityId, status, previousStatus) {
  const opportunity = await Opportunity.findById(asId(opportunityId)).select('title status visibility eligibleColleges').lean();
  if (!opportunity || opportunity.status !== status) return;
  const title = quote(opportunity.title);
  const messages = {
    closed: `Applications for ${title} are now closed.`,
    archived: `${title} was archived and is no longer listed on CampusX.`,
    // Only a reopening: a first publish has nobody tracking it yet.
    published: previousStatus === 'closed' || previousStatus === 'archived' ? `${title} is open for applications again.` : null,
  };
  if (!messages[status]) return;
  await createBulkNotifications({
    recipients: await trackersOf(opportunity, { listedOnly: status !== 'archived' }),
    type: 'OPPORTUNITY_STATUS_CHANGED',
    message: messages[status],
    entityType: 'opportunity',
    entityId: opportunityId,
    metadata: { status },
    dedupeKey: `opportunity:${opportunityId}:status`,
  });
}

// ----------------------------------------------------------------------------- rankings and gamification

export async function onLevelReached(userId, level) {
  const info = LEVELS.find((entry) => entry.level === level);
  if (!info) return;
  await createNotification({ recipient: userId, type: 'LEVEL_UP', message: `You reached Level ${level}: ${info.name}. Keep going!`, entityType: 'level', entityId: String(level), metadata: { level }, dedupeKey: `level:${level}` });
}

export async function onBadgesEarned(userId, badgeKeys) {
  for (const key of badgeKeys) {
    const badge = BADGES.find((item) => item.key === key);
    if (!badge) continue;
    await createNotification({ recipient: userId, type: 'BADGE_EARNED', message: `Congratulations! You earned ${badge.name}: ${badge.description.charAt(0).toLowerCase()}${badge.description.slice(1)}.`, entityType: 'badge', entityId: key, metadata: { badge: key, icon: badge.icon, rarity: badge.rarity }, dedupeKey: `badge:${key}` });
  }
}

/** A better ranking milestone than ever before (worked out by services/rankingService.js). */
export async function onRankMilestone({ userId, scope, tier, rank, scopeName }) {
  const where = scope === 'overall' ? 'on CampusX' : `at ${scopeName}`;
  await createNotification({
    recipient: userId,
    type: 'RANK_CHANGED',
    message: tier === 1 ? `You're #1 ${where}!` : `You're now in the top ${tier} ${where}, at #${rank}.`,
    entityType: 'ranking',
    entityId: scope,
    metadata: { scope, tier, rank },
    dedupeKey: `rank:${scope}:${scopeName}:${tier}`,
  });
}

/** A security notice: if the student didn't change it themselves, they know straight away. */
export async function onPasswordChanged(userId) {
  await createNotification({
    recipient: userId,
    type: 'SYSTEM_NOTIFICATION',
    title: 'Password changed',
    // No advice to "sign in and change it": someone who changed it without permission holds the only password.
    message: 'Your CampusX password was just changed, and your other devices were signed out. If this wasn’t you, contact CampusX support straight away.',
    // Every change gets its own notice (never merged with an earlier one).
    dedupeKey: `password-changed:${Date.now()}`,
  });
}

export async function onOnboarded(userId) {
  await createNotification({
    recipient: userId,
    type: 'SYSTEM_NOTIFICATION',
    title: 'Welcome to CampusX',
    message: 'Your campus profile is ready. Join a community, share your first post and start earning XP on Campus Rankings.',
    dedupeKey: 'welcome',
  });
}

// ----------------------------------------------------------------------------- Anonymous Zone

/** Never an actor: the anonymous author only learns that someone commented. Their own comments don't count. */
export async function onAnonymousComment(postId, commentId) {
  const [post, comment] = await Promise.all([
    AnonymousPost.findById(asId(postId)).select('+author title status moderationStatus').lean(),
    AnonymousComment.findById(asId(commentId)).select('+author status moderationStatus').lean(),
  ]);
  if (!post || !comment || post.status !== 'active' || comment.status !== 'active' || !isPublic(post.moderationStatus) || !isPublic(comment.moderationStatus) || post.author.equals(comment.author)) return;
  await createNotification({
    recipient: post.author,
    type: 'ANONYMOUS_POST_COMMENTED',
    message: `Someone commented on your anonymous post ${quote(post.title)}.`,
    groupMessage: `{count} new comments on your anonymous post ${quote(post.title)}.`,
    entityType: 'anonymous-post',
    entityId: postId,
    dedupeKey: `anonymous-post:${postId}:comments`,
  });
}

/** A new like from someone else (the service checks that). The total comes from the post itself. */
export async function onAnonymousLike(postId) {
  const id = asId(postId);
  const post = id ? await AnonymousPost.findOne({ _id: id, status: 'active' }).select('+author title moderationStatus').lean() : null;
  if (!post || !isPublic(post.moderationStatus)) return;
  const [{ likes } = { likes: 0 }] = await AnonymousPost.aggregate([{ $match: { _id: id } }, { $project: { likes: { $size: { $ifNull: ['$likes', []] } } } }]);
  await createNotification({
    recipient: post.author,
    type: 'ANONYMOUS_POST_LIKED',
    message: `Someone liked your anonymous post ${quote(post.title)}.`,
    groupMessage: `Your anonymous post ${quote(post.title)} has ${likes} like${likes === 1 ? '' : 's'} now.`,
    entityType: 'anonymous-post',
    entityId: postId,
    dedupeKey: `anonymous-post:${postId}:likes`,
  });
}

// ----------------------------------------------------------------------------- Trust & Safety

/** What a moderated item is called in a message, how to quote it, and where the notification leads. */
const MODERATED = {
  post: { model: Post, select: 'author content media', noun: 'post', text: (doc) => doc.content, entity: (id) => ['post', id] },
  comment: { model: Comment, select: 'author content post', noun: 'comment', text: (doc) => doc.content, entity: (id, doc) => ['post', doc.post.toString()] },
  anonymousPost: { model: AnonymousPost, select: '+author title', noun: 'anonymous post', text: (doc) => doc.title, entity: (id) => ['anonymous-post', id], anonymous: true },
  anonymousComment: { model: AnonymousComment, select: '+author content post', noun: 'anonymous comment', text: (doc) => doc.content, entity: (id, doc) => ['anonymous-post', doc.post.toString()], anonymous: true },
  project: { model: Project, select: 'owner title', noun: 'project', text: (doc) => doc.title, entity: (id) => ['project', id] },
  achievement: { model: Achievement, select: 'owner title', noun: 'achievement', text: (doc) => doc.title, entity: (id) => ['achievement', id] },
  community: { model: Community, select: 'createdBy name', noun: 'community', text: (doc) => doc.name, entity: (id) => ['community', id] },
};
const ownerField = { post: 'author', comment: 'author', anonymousPost: 'author', anonymousComment: 'author', project: 'owner', achievement: 'owner', community: 'createdBy' };

/**
 * Tells the owner what happened to their content: held for review, removed, or back on CampusX. Anonymous
 * content: the author is looked up here (the event carries no user id) and the message never says who
 * reported it or why in detail. Flagging alone is not announced.
 */
export async function onContentModerated({ targetType, targetId, previousStatus, newStatus, notify = true }) {
  const config = MODERATED[targetType];
  if (!config || !notify) return;
  const doc = await config.model.findById(asId(targetId)).select(config.select).lean();
  const recipient = doc?.[ownerField[targetType]];
  if (!recipient) return;
  const text = config.text(doc);
  const label = text?.trim() ? `your ${config.noun} ${quote(text)}` : `your ${config.noun}`;
  const [entityType, entityId] = config.entity(targetId, doc);
  const held = ['restricted', 'pending'].includes(newStatus);
  const restored = newStatus === 'approved' && ['restricted', 'pending', 'removed'].includes(previousStatus);
  if (held) {
    await createNotification({ recipient, type: 'CONTENT_RESTRICTED', message: `${label[0].toUpperCase()}${label.slice(1)} is temporarily unavailable while it is being reviewed. It may not follow the CampusX community guidelines.`, entityType, entityId });
  } else if (newStatus === 'removed') {
    await createNotification({ recipient, type: 'CONTENT_REMOVED', message: `${label[0].toUpperCase()}${label.slice(1)} was removed because it may violate the CampusX community guidelines.`, entityType: 'safety' });
  } else if (restored) {
    await createNotification({ recipient, type: 'CONTENT_RESTORED', message: `${label[0].toUpperCase()}${label.slice(1)} is back on CampusX. Thanks for your patience.`, entityType, entityId });
  }
}

const untilText = (iso) => new Intl.DateTimeFormat('en-IN', { timeZone: env.gamificationTimezone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

/** Warnings and temporary posting restrictions (progressive enforcement or a moderator's decision). */
export async function onModerationUserAction({ userId, action, until }) {
  if (action === 'warning') {
    await createNotification({ recipient: userId, type: 'MODERATION_WARNING', message: "Some of your recent content didn't follow the CampusX community guidelines. Please keep CampusX friendly and safe for everyone.", entityType: 'safety' });
  } else if (action === 'restriction') {
    await createNotification({ recipient: userId, type: 'ACCOUNT_RESTRICTED', message: `You can't post new content until ${untilText(until)}. You can still read, like and report. Please take a moment to read the community guidelines.`, entityType: 'safety' });
  }
}

/** A moderator closed a report: the reporter hears the outcome (never anything about who was reported). */
export async function onReportReviewed({ reportId, reporterId, outcome }) {
  await createNotification({
    recipient: reporterId,
    type: 'REPORT_REVIEWED',
    message: outcome === 'resolved'
      ? 'Thanks for your report. We reviewed it and took action.'
      : "Thanks for your report. We reviewed it and found it doesn't break the CampusX community guidelines.",
    entityType: 'safety',
    dedupeKey: `report:${reportId}`,
  });
}

// ----------------------------------------------------------------------------- wiring

// Failures are logged (ids only, never names or anonymous authors) and never reach the request.
const queue = createKeyedQueue(logNotificationError);

/** Resolves once every queued notification task has finished (used by shutdown and tests). */
export const settled = () => queue.settled();

let registered = false;

export function registerNotificationListeners() {
  if (registered) return;
  registered = true;
  const on = (events, keyOf, handler) => {
    for (const event of [].concat(events)) campusEvents.on(event, (payload) => queue.run(keyOf(payload), () => handler(payload)));
  };
  const E = CAMPUS_EVENTS;
  on([E.POST_LIKED, E.POST_UNLIKED], (p) => `like:${p.postId}:${p.actorId}`, (p) => onPostLike(p.postId, p.actorId));
  on(E.POST_COMMENTED, (p) => `comment:${p.postId}:${p.actorId}`, (p) => onPostComment(p.postId, p.commentId, p.actorId));
  on(E.POST_CREATED, (p) => `announce:${p.postId}`, (p) => onCommunityPost(p.postId));
  on([E.PROJECT_LIKED, E.PROJECT_UNLIKED], (p) => `project-like:${p.projectId}:${p.actorId}`, (p) => onProjectLike(p.projectId, p.actorId));
  on(E.PROJECT_TEAM_INVITED, (p) => `team:${p.projectId}`, (p) => onTeamInvites(p.projectId, p.ownerId, p.userIds));
  on([E.STUDENT_FOLLOWED, E.STUDENT_UNFOLLOWED], (p) => `follow:${p.followerId}:${p.followingId}`, (p) => onFollowChanged(p.followerId, p.followingId));
  on(E.ACHIEVEMENT_REVIEWED, (p) => `review:${p.achievementId}`, (p) => onAchievementReviewed(p.achievementId));
  on(E.COMMUNITY_MEMBER_JOINED, (p) => `joined:${p.communityId}`, (p) => onMemberJoined(p.communityId, p.userId));
  on(E.COMMUNITY_ROLE_CHANGED, (p) => `member:${p.communityId}:${p.userId}`, (p) => onRoleChanged(p.communityId, p.userId, p.role, p.actorId));
  on(E.COMMUNITY_MEMBER_REMOVED, (p) => `member:${p.communityId}:${p.userId}`, (p) => onMemberRemoved(p.communityId, p.userId));
  on(E.OPPORTUNITY_UPDATED, (p) => `opportunity:${p.opportunityId}`, (p) => onOpportunityUpdated(p.opportunityId, p.changed));
  on(E.OPPORTUNITY_CLOSED, (p) => `opportunity:${p.opportunityId}`, (p) => onOpportunityStatus(p.opportunityId, 'closed', p.previousStatus));
  on(E.OPPORTUNITY_ARCHIVED, (p) => `opportunity:${p.opportunityId}`, (p) => onOpportunityStatus(p.opportunityId, 'archived', p.previousStatus));
  on(E.OPPORTUNITY_PUBLISHED, (p) => `opportunity:${p.opportunityId}`, (p) => onOpportunityStatus(p.opportunityId, 'published', p.previousStatus));
  on(E.GAMIFICATION_LEVEL_REACHED, (p) => `student:${p.userId}`, (p) => onLevelReached(p.userId, p.level));
  on(E.GAMIFICATION_BADGES_EARNED, (p) => `student:${p.userId}`, (p) => onBadgesEarned(p.userId, p.badges));
  on(E.GAMIFICATION_RANK_MILESTONE, (p) => `student:${p.userId}`, (p) => onRankMilestone(p));
  on(E.STUDENT_ONBOARDED, (p) => `student:${p.userId}`, (p) => onOnboarded(p.userId));
  on(E.AUTH_PASSWORD_CHANGED, (p) => `password:${p.userId}`, (p) => onPasswordChanged(p.userId));
  on(E.ANONYMOUS_POST_COMMENTED, (p) => `anonymous:${p.postId}`, (p) => onAnonymousComment(p.postId, p.commentId));
  on(E.ANONYMOUS_POST_LIKED, (p) => `anonymous:${p.postId}`, (p) => onAnonymousLike(p.postId));
  on(E.CONTENT_MODERATED, (p) => `moderation:${p.targetType}:${p.targetId}`, (p) => onContentModerated(p));
  on(E.MODERATION_USER_ACTION, (p) => `student:${p.userId}`, (p) => onModerationUserAction(p));
  on(E.REPORT_REVIEWED, (p) => `report:${p.reportId}`, (p) => onReportReviewed(p));
}
