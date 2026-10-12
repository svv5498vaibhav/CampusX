import mongoose from 'mongoose';
import { SEARCHABLE_STATUSES } from '../config/moderationConfig.js';
import {
  ANONYMOUS_TARGET_TYPE,
  CANDIDATE_LIMITS,
  CANDIDATE_WINDOWS,
  RECOMMENDATION_TYPES,
  RESULT_RULES,
  TARGET_TYPES,
  TRENDING_RULES,
} from '../config/recommendationConfig.js';
import { INTERESTS } from '../data/campusOptions.js';
import Achievement from '../models/Achievement.js';
import AnonymousPost from '../models/AnonymousPost.js';
import Community from '../models/Community.js';
import Opportunity from '../models/Opportunity.js';
import Post from '../models/Post.js';
import Project from '../models/Project.js';
import User, { ACCOUNT_STATUSES } from '../models/User.js';
import { readableBy } from './anonymousService.js';
import { scopeFilter } from './communityAccess.js';
import { ensureOfficialCommunities } from './communityService.js';
import { eligibleFilter, listedFor, openFilter } from './opportunityAccess.js';
import { visibleTo } from './postService.js';
import { projectVisibleTo } from './projectService.js';
import { exactPattern } from './searchQuery.js';
import { showcaseVisibleTo } from './showcaseAccess.js';

/*
 * Candidate retrieval (Phase 14): for each kind of recommendation, a few small indexed queries ("pools")
 * that together hold everything worth scoring: items matching the student's profile, fresh items, and
 * items from their campus and communities. Each pool is capped (CANDIDATE_LIMITS), so a request never
 * reads the whole collection. Results become plain scoring features (see services/recommendationScoring.js).
 *
 * Every pool already applies the same rules as the rest of CampusX: the feature's own visibility filter
 * (posts, projects, achievements, communities, opportunities, the Anonymous Zone), Trust & Safety
 * (SEARCHABLE: only content in good standing that isn't flagged, as in search), open and eligible
 * opportunities only, and never the student's own content.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
// Content saved before a model had a moderation status has none: it counts as approved.
export const RECOMMENDABLE = Object.freeze({ moderationStatus: { $in: [...SEARCHABLE_STATUSES, null] } });
export const ACTIVE_STUDENT = Object.freeze({ status: ACCOUNT_STATUSES.ACTIVE, onboardingCompleted: true });

const lower = (text) => String(text ?? '').trim().toLowerCase();
const daysAgo = (days, now) => new Date(now.getTime() - days * DAY_MS);
const oid = (id) => new mongoose.Types.ObjectId(String(id));
const notIn = (ids) => ({ _id: { $nin: [...(ids ?? [])].map(oid) } });
const half = (limit) => Math.ceil(limit / 2);
const regexes = (terms) => terms.map(exactPattern);
const textOf = (...parts) => lower(parts.filter(Boolean).join(' '));
const unique = (pools) => [...new Map(pools.flat().map((doc) => [doc._id.toString(), doc])).values()];
const likeCount = { $size: { $ifNull: ['$likes', []] } };

/** Runs a capped aggregation for one pool; `extra` narrows the shared match. */
const pool = (model, match, { extra, sort, limit, project }) =>
  model.aggregate([{ $match: extra ? { $and: [extra, match] } : match }, { $sort: sort }, { $limit: limit }, { $project: project }]);

const INTEREST_BY_NAME = new Map(INTERESTS.map((interest) => [interest.name.toLowerCase(), interest.id]));

/** The interest an official interest community stands for ("AI / ML" → ai-ml), or null. */
export const interestOfCommunity = (community) => (community.official && community.type === 'interest' ? (INTEREST_BY_NAME.get(lower(community.name)) ?? null) : null);

// ----------------------------------------------------------------------------- posts

const POST_FIELDS = {
  type: 1,
  content: { $substrCP: [{ $ifNull: ['$content', ''] }, 0, 600] },
  author: 1,
  audience: 1,
  community: 1,
  createdAt: 1,
  commentsCount: 1,
  likeCount,
};

function postFeatures(post) {
  const communityId = post.community ? post.community.toString() : null;
  return {
    id: post._id.toString(),
    type: RECOMMENDATION_TYPES.POSTS,
    targetType: TARGET_TYPES.posts,
    category: post.type,
    categoryKind: 'postType',
    keywords: new Set(),
    text: lower(post.content),
    college: post.audience?.college ?? null,
    branch: post.audience?.branch ?? null,
    communityId,
    date: post.createdAt,
    engagement: (post.likeCount ?? 0) + 2 * (post.commentsCount ?? 0),
    diversity: { type: post.type, author: post.author.toString(), community: communityId },
  };
}

/** Campus posts the student may see from the last month: by topic (text index), recent, their communities, their campus. */
export async function postCandidates(context, now) {
  const limit = CANDIDATE_LIMITS.posts;
  const match = {
    $and: [await visibleTo(context.viewer), RECOMMENDABLE, { author: { $ne: context.userId } }, { createdAt: { $gte: daysAgo(CANDIDATE_WINDOWS.posts, now) } }, notIn(context.hidden.post)],
  };
  const recent = { createdAt: -1, _id: -1 };
  const memberIds = [...context.memberships.keys()].map(oid);
  const pools = await Promise.all([
    context.textTerms.length ? pool(Post, match, { extra: { $text: { $search: context.textTerms.join(' ') } }, sort: recent, limit, project: POST_FIELDS }) : [],
    pool(Post, match, { sort: recent, limit, project: POST_FIELDS }),
    memberIds.length ? pool(Post, match, { extra: { community: { $in: memberIds } }, sort: recent, limit: half(limit), project: POST_FIELDS }) : [],
    context.college ? pool(Post, match, { extra: { 'audience.college': context.college }, sort: recent, limit: half(limit), project: POST_FIELDS }) : [],
  ]);
  return unique(pools).map(postFeatures);
}

// ----------------------------------------------------------------------------- projects

const PROJECT_FIELDS = {
  title: 1,
  shortDescription: 1,
  category: 1,
  techStack: 1,
  owner: 1,
  audience: 1,
  status: 1,
  createdAt: 1,
  views: 1,
  likeCount,
  imageCount: { $size: { $ifNull: ['$images', []] } },
  hasLinks: { $gt: [{ $strLenCP: { $concat: [{ $ifNull: ['$githubUrl', ''] }, { $ifNull: ['$liveUrl', ''] }, { $ifNull: ['$demoUrl', ''] }] } }, 0] },
};

function projectFeatures(project) {
  return {
    id: project._id.toString(),
    type: RECOMMENDATION_TYPES.PROJECTS,
    targetType: TARGET_TYPES.projects,
    category: project.category,
    categoryKind: 'projectCategory',
    keywords: new Set((project.techStack ?? []).map(lower)),
    text: textOf(project.title, project.shortDescription),
    college: project.audience?.college ?? null,
    date: project.createdAt,
    engagement: 2 * (project.likeCount ?? 0) + (project.views ?? 0) / 10,
    quality: project.imageCount > 0 || project.hasLinks || project.status === 'completed',
    diversity: { category: project.category, owner: project.owner.toString() },
  };
}

/** Projects the student may see (not their own or their team's): by tech and category, recent, their campus. */
export async function projectCandidates(context) {
  const limit = CANDIDATE_LIMITS.projects;
  const match = {
    $and: [
      projectVisibleTo(context.viewer),
      RECOMMENDABLE,
      { status: { $ne: 'archived' } },
      { owner: { $ne: context.userId } },
      { 'teamMembers.user': { $ne: context.userId } },
      notIn(context.hidden.project),
    ],
  };
  const recent = { createdAt: -1, _id: -1 };
  const fits = [
    ...(context.keywords.length ? [{ techStack: { $in: regexes(context.keywords) } }] : []),
    ...(context.projectCategories.length ? [{ category: { $in: context.projectCategories } }] : []),
  ];
  const pools = await Promise.all([
    fits.length ? pool(Project, match, { extra: { $or: fits }, sort: recent, limit, project: PROJECT_FIELDS }) : [],
    pool(Project, match, { sort: recent, limit, project: PROJECT_FIELDS }),
    context.college ? pool(Project, match, { extra: { 'audience.college': context.college }, sort: recent, limit: half(limit), project: PROJECT_FIELDS }) : [],
  ]);
  return unique(pools).map(projectFeatures);
}

// ----------------------------------------------------------------------------- achievements

const ACHIEVEMENT_FIELDS = { title: 1, type: 1, organization: 1, eventName: 1, skills: 1, date: 1, verificationStatus: 1, owner: 1, audience: 1, createdAt: 1 };

function achievementFeatures(achievement) {
  return {
    id: achievement._id.toString(),
    type: RECOMMENDATION_TYPES.ACHIEVEMENTS,
    targetType: TARGET_TYPES.achievements,
    category: achievement.type,
    categoryKind: 'achievementType',
    keywords: new Set((achievement.skills ?? []).map(lower)),
    text: textOf(achievement.title, achievement.eventName, achievement.organization),
    college: achievement.audience?.college ?? null,
    date: achievement.date ?? achievement.createdAt,
    engagement: 0,
    quality: achievement.verificationStatus === 'verified',
    diversity: { type: achievement.type, owner: achievement.owner.toString() },
  };
}

/** Other students' achievements the student may see: by type, recent, their campus. Private ones never. */
export async function achievementCandidates(context, now) {
  const limit = CANDIDATE_LIMITS.achievements;
  const match = {
    $and: [showcaseVisibleTo(context.viewer), RECOMMENDABLE, { owner: { $ne: context.userId } }, { date: { $gte: daysAgo(CANDIDATE_WINDOWS.achievements, now) } }, notIn(context.hidden.achievement)],
  };
  const pools = await Promise.all([
    context.achievementTypes.length ? pool(Achievement, match, { extra: { type: { $in: context.achievementTypes } }, sort: { date: -1, _id: -1 }, limit, project: ACHIEVEMENT_FIELDS }) : [],
    pool(Achievement, match, { sort: { createdAt: -1 }, limit, project: ACHIEVEMENT_FIELDS }),
    context.college ? pool(Achievement, match, { extra: { 'audience.college': context.college }, sort: { createdAt: -1 }, limit: half(limit), project: ACHIEVEMENT_FIELDS }) : [],
  ]);
  return unique(pools).map(achievementFeatures);
}

// ----------------------------------------------------------------------------- communities

const COMMUNITY_FIELDS = {
  name: 1,
  description: { $substrCP: [{ $ifNull: ['$description', ''] }, 0, 300] },
  type: 1,
  college: 1,
  branch: 1,
  semester: 1,
  tags: 1,
  official: 1,
  memberCount: 1,
  createdAt: 1,
};

function communityFeatures(community, context) {
  const interestId = interestOfCommunity(community);
  const ownCollege = Boolean(context.college) && community.college === context.college;
  let officialFor = null;
  if (community.official && community.type === 'college' && ownCollege) officialFor = 'college';
  if (community.official && community.type === 'branch' && ownCollege && community.branch === context.branch) officialFor = 'branch';
  return {
    id: community._id.toString(),
    type: RECOMMENDATION_TYPES.COMMUNITIES,
    targetType: TARGET_TYPES.communities,
    category: community.type,
    categoryKind: 'communityType',
    keywords: new Set((community.tags ?? []).map(lower)),
    text: textOf(community.name, community.description),
    interestIds: new Set(interestId ? [interestId] : []),
    college: community.college ?? null,
    branch: community.branch ?? null,
    semester: community.semester ?? null,
    officialFor,
    date: community.createdAt,
    engagement: community.memberCount ?? 0,
    quality: Boolean(community.official),
    diversity: { type: community.type },
  };
}

/**
 * Communities the student can join (their campus scope allows it) and isn't in or banned from: their
 * official campus, branch and interest communities, ones on their campus or tagged with their topics,
 * and popular ones.
 */
export async function communityCandidates(context) {
  const limit = CANDIDATE_LIMITS.communities;
  const officialSlugs = await ensureOfficialCommunities(context.viewer);
  const match = {
    $and: [{ status: 'active' }, RECOMMENDABLE, scopeFilter(context.viewer), notIn([...context.excludedCommunities, ...context.hidden.community])],
  };
  const tags = [...new Set([...context.keywords, ...context.interests.map((interest) => lower(interest.name))])];
  const fits = [
    { slug: { $in: officialSlugs } },
    ...(context.college ? [{ college: context.college }] : []),
    ...(tags.length ? [{ tags: { $in: tags } }] : []),
  ];
  const popular = { memberCount: -1, _id: 1 };
  const pools = await Promise.all([
    pool(Community, match, { extra: { $or: fits }, sort: popular, limit, project: COMMUNITY_FIELDS }),
    pool(Community, match, { sort: popular, limit: half(limit), project: COMMUNITY_FIELDS }),
  ]);
  return unique(pools).map((community) => communityFeatures(community, context));
}

// ----------------------------------------------------------------------------- opportunities

const OPPORTUNITY_FIELDS = {
  title: 1,
  shortDescription: 1,
  type: 1,
  organizer: 1,
  skills: 1,
  tags: 1,
  eligibleColleges: 1,
  eligibleBranches: 1,
  eligibleSemesters: 1,
  applicationDeadline: 1,
  publishedAt: 1,
  createdAt: 1,
  featured: 1,
  views: 1,
};

function opportunityFeatures(opportunity) {
  return {
    id: opportunity._id.toString(),
    type: RECOMMENDATION_TYPES.OPPORTUNITIES,
    targetType: TARGET_TYPES.opportunities,
    category: opportunity.type,
    categoryKind: 'opportunityType',
    keywords: new Set([...(opportunity.skills ?? []), ...(opportunity.tags ?? [])].map(lower)),
    text: textOf(opportunity.title, opportunity.shortDescription),
    colleges: opportunity.eligibleColleges ?? [],
    branches: opportunity.eligibleBranches ?? [],
    semesters: opportunity.eligibleSemesters ?? [],
    date: opportunity.publishedAt ?? opportunity.createdAt,
    deadline: opportunity.applicationDeadline ?? null,
    engagement: (opportunity.views ?? 0) / 5,
    quality: Boolean(opportunity.featured),
    diversity: { type: opportunity.type, organizer: lower(opportunity.organizer) },
  };
}

/**
 * Open opportunities the student may see and is eligible for (college, branch, semester from their own
 * profile), that they haven't added to their list: matching their skills, interests or campus, plus the
 * newest ones. Expired, closed, draft and archived opportunities never qualify.
 */
export async function opportunityCandidates(context, now) {
  const limit = CANDIDATE_LIMITS.opportunities;
  const match = {
    $and: [listedFor(context.viewer), openFilter(now), eligibleFilter(context.viewer), notIn([...context.tracked, ...context.hidden.opportunity])],
  };
  const terms = regexes(context.keywords);
  const fits = [
    ...(terms.length ? [{ skills: { $in: terms } }, { tags: { $in: terms } }] : []),
    ...(context.opportunityTypes.length ? [{ type: { $in: context.opportunityTypes } }] : []),
    ...(context.college ? [{ eligibleColleges: context.college }] : []),
    ...(context.branch ? [{ eligibleBranches: context.branch }] : []),
  ];
  const pools = await Promise.all([
    fits.length ? pool(Opportunity, match, { extra: { $or: fits }, sort: { applicationDeadline: 1, publishedAt: -1, _id: 1 }, limit, project: OPPORTUNITY_FIELDS }) : [],
    pool(Opportunity, match, { sort: { publishedAt: -1, _id: -1 }, limit: half(limit), project: OPPORTUNITY_FIELDS }),
  ]);
  return unique(pools).map(opportunityFeatures);
}

// ----------------------------------------------------------------------------- students

const STUDENT_FIELDS = { skills: 1, interests: 1, college: 1, branch: 1, semester: 1 };

function studentFeatures(student) {
  return {
    id: student._id.toString(),
    type: RECOMMENDATION_TYPES.STUDENTS,
    targetType: TARGET_TYPES.students,
    keywords: new Set((student.skills ?? []).map(lower)),
    text: '',
    interestIds: new Set(student.interests ?? []),
    interestByIdOnly: true,
    college: student.college ?? null,
    branch: student.branch ?? null,
    semester: student.semester ?? null,
    date: null,
    engagement: 0,
    diversity: { branch: student.branch ?? null },
  };
}

/**
 * Active students with the same skills or interests, or in the student's branch at their college. Only
 * public profile fields are read (skills, interests, college, branch, semester).
 */
export async function studentCandidates(context) {
  const limit = CANDIDATE_LIMITS.students;
  const base = { ...ACTIVE_STUDENT, ...notIn([context.userId, ...context.hidden.student]) };
  const find = (extra, max) => User.find({ $and: [base, extra] }).select(STUDENT_FIELDS).limit(max).lean();
  const skillKeys = context.skills.map((skill) => skill.key);
  const interestIds = context.interests.filter((interest) => !interest.learned).map((interest) => interest.id);
  const pools = await Promise.all([
    skillKeys.length ? find({ skills: { $in: regexes(skillKeys) } }, limit) : [],
    interestIds.length ? find({ interests: { $in: interestIds } }, limit) : [],
    context.college && context.branch ? find({ college: context.college, branch: context.branch }, half(limit)) : [],
  ]);
  return unique(pools).map(studentFeatures);
}

// ----------------------------------------------------------------------------- trending on campus

/** Recent engagement over age: a burst today beats a pile of old likes. */
function trendScore(row, context, now) {
  const engagement = (row.likeCount ?? 0) + TRENDING_RULES.commentWeight * (row.commentsCount ?? 0);
  if (engagement < RESULT_RULES.trending.minEngagement) return 0;
  const hours = Math.max(0, (now.getTime() - new Date(row.createdAt).getTime()) / (60 * 60 * 1000));
  const boost = context.college && row.audience?.college === context.college ? TRENDING_RULES.campusBoost : 1;
  return (engagement / (hours + 2) ** TRENDING_RULES.gravity) * boost;
}

const topTrending = (rows, context, now, max) =>
  rows
    .map((row) => ({ id: row._id.toString(), trend: trendScore(row, context, now) }))
    .filter((row) => row.trend > 0)
    .sort((a, b) => b.trend - a.trend || (a.id < b.id ? -1 : 1))
    .slice(0, max);

/**
 * Trending on campus (not personal fit): campus posts and projects with recent engagement, and Anonymous
 * Zone discussions the student may read. For anonymous posts only engagement and age are read: never the
 * author, beyond leaving out the student's own posts inside the query.
 */
export async function trendingCandidates(context, now) {
  const limit = CANDIDATE_LIMITS.trending;
  const since = daysAgo(CANDIDATE_WINDOWS.trendingPosts, now);
  const recent = { createdAt: -1, _id: -1 };
  const [posts, discussions, projects] = await Promise.all([
    pool(Post, { $and: [await visibleTo(context.viewer), RECOMMENDABLE, { author: { $ne: context.userId } }, { createdAt: { $gte: since } }, notIn(context.hidden.post)] }, {
      sort: recent,
      limit,
      project: { audience: 1, createdAt: 1, commentsCount: 1, likeCount },
    }),
    pool(AnonymousPost, { $and: [await readableBy(context.viewer), RECOMMENDABLE, { author: { $ne: context.userId } }, { createdAt: { $gte: since } }, notIn(context.hidden[ANONYMOUS_TARGET_TYPE])] }, {
      sort: recent,
      limit: half(limit),
      project: { createdAt: 1, commentsCount: 1, likeCount },
    }),
    pool(
      Project,
      {
        $and: [
          projectVisibleTo(context.viewer),
          RECOMMENDABLE,
          { status: { $ne: 'archived' } },
          { owner: { $ne: context.userId } },
          { createdAt: { $gte: daysAgo(CANDIDATE_WINDOWS.trendingProjects, now) } },
          notIn(context.hidden.project),
        ],
      },
      { sort: recent, limit: half(limit), project: { audience: 1, createdAt: 1, likeCount } },
    ),
  ]);
  const T = RESULT_RULES.trending;
  return {
    posts: topTrending(posts, context, now, T.posts),
    discussions: topTrending(discussions, context, now, T.discussions),
    projects: topTrending(projects, context, now, T.projects),
  };
}

export const CANDIDATES = Object.freeze({
  [RECOMMENDATION_TYPES.POSTS]: postCandidates,
  [RECOMMENDATION_TYPES.PROJECTS]: projectCandidates,
  [RECOMMENDATION_TYPES.COMMUNITIES]: communityCandidates,
  [RECOMMENDATION_TYPES.OPPORTUNITIES]: opportunityCandidates,
  [RECOMMENDATION_TYPES.STUDENTS]: studentCandidates,
  [RECOMMENDATION_TYPES.ACHIEVEMENTS]: achievementCandidates,
});
