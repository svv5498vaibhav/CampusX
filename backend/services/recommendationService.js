import mongoose from 'mongoose';
import {
  ANONYMOUS_TARGET_TYPE,
  CACHE_RULES,
  FEEDBACK_ACTIONS,
  FEEDBACK_RULES,
  INTEREST_SIGNALS,
  INTERACTION_ACTIONS,
  INTERACTION_RULES,
  LIST_TYPES,
  MATCH_RULES,
  PERSONALIZATION_MESSAGES,
  PROFILE_RULES,
  REASONS,
  RECOMMENDATION_TYPES,
  RESULT_RULES,
  TARGET_TYPES,
} from '../config/recommendationConfig.js';
import Achievement from '../models/Achievement.js';
import AnonymousPost from '../models/AnonymousPost.js';
import Community from '../models/Community.js';
import CommunityMember from '../models/CommunityMember.js';
import Opportunity from '../models/Opportunity.js';
import OpportunityApplication from '../models/OpportunityApplication.js';
import Post from '../models/Post.js';
import Project from '../models/Project.js';
import RecommendationFeedback from '../models/RecommendationFeedback.js';
import RecommendationInteraction from '../models/RecommendationInteraction.js';
import Report from '../models/Report.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { presentAchievements } from './achievementService.js';
import { findPosts as findAnonymousPostViews, readableBy } from './anonymousService.js';
import { getCache, setCache } from './cacheService.js';
import { getBranch, getInterest } from './campusOptionsService.js';
import { scopeFilter } from './communityAccess.js';
import { presentCommunities } from './communityService.js';
import { eligibleFilter, listedFor, openFilter } from './opportunityAccess.js';
import { presentOpportunities } from './opportunityService.js';
import { findPosts as findPostViews, visibleTo } from './postService.js';
import { findProjectCards, projectVisibleTo } from './projectService.js';
import { ACTIVE_STUDENT, CANDIDATES, interestOfCommunity, RECOMMENDABLE, trendingCandidates } from './recommendationCandidates.js';
import { bumpProfileVersion, getProfileVersion, loadDerivedProfile, recordSignal, skillLabel, topicTraits } from './recommendationProfileService.js';
import { applyDiversity, mixRecommendations, penaltyKey, rankCandidates } from './recommendationScoring.js';
import { sanitizeSearchResults, studentViews } from './searchService.js';
import { showcaseVisibleTo } from './showcaseAccess.js';

export { applyDiversity, applyFreshness, calculateRecommendationScore } from './recommendationScoring.js';

/*
 * Recommendations (Phase 14): a transparent, rule-based discovery engine. No machine learning, no
 * external AI, no embeddings: every item is scored by the weights in config/recommendationConfig.js and
 * students only ever see plain reasons ("Matches your React skills"), never scores.
 *
 *   student profile (account + what they do) → candidate retrieval (small indexed pools)
 *     → eligibility and visibility (inside the queries) → relevance scoring → diversity
 *     → safety filtering again on the final views → top N
 *
 * Everything is worked out from the signed-in student (`viewer`, req.user, loaded from the database):
 * never a user id, college, branch, semester or eligibility sent by the client. Ranked lists (ids and
 * reasons only) are cached per student for a few minutes (Redis when connected, memory otherwise); the
 * items themselves are always loaded fresh through each feature's own visibility rules and views, so
 * something deleted, made private, held by moderators or expired after ranking never shows up.
 *
 * The scoring sits behind calculateRecommendationScore and the candidate pools behind CANDIDATES, so a
 * future learned model can replace either without touching routes, caching or the safety filters.
 */

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const isObjectId = (id) => mongoose.isValidObjectId(id) && String(new mongoose.Types.ObjectId(String(id))) === String(id);
const lower = (text) => String(text ?? '').trim().toLowerCase();
const round = (value) => Math.round(value * 100) / 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const NOT_FOUND = 'Recommendation not found.';

// ----------------------------------------------------------------------------- the student

/** Interest ids → what they look like across CampusX (and their display names). */
async function interestProfiles(ids, learned) {
  const interests = await Promise.all(ids.filter((id) => INTEREST_SIGNALS[id]).map(getInterest));
  return interests.filter(Boolean).map((interest) => ({ id: interest.id, name: interest.name, learned, ...INTEREST_SIGNALS[interest.id] }));
}

/** Words for the text-index pool: single words, long enough and not everyday words. */
function textTermsOf(keywords) {
  const words = keywords.flatMap((keyword) => keyword.split(/[^\p{L}\p{N}]+/u)).filter((word) => word.length >= MATCH_RULES.minKeywordLength && !MATCH_RULES.ambiguousWords.includes(word));
  return [...new Set(words)].slice(0, 20);
}

/** Report target types → recommendation target types (a reported student, post, ... is never recommended). */
const REPORTED_AS = Object.freeze({ post: 'post', project: 'project', community: 'community', opportunity: 'opportunity', achievement: 'achievement', user: 'student', anonymousPost: ANONYMOUS_TARGET_TYPE });

/**
 * The student, as recommendations see them: their own profile (college, branch, semester, interests,
 * skills, read from their account), what CampusX learned from their activity (the derived profile), their
 * communities and tracked opportunities, and what they asked not to see (dismissed or reported items, and
 * "Not interested" in similar things). Built once per request, only when a ranking isn't cached.
 */
export async function buildStudentProfile(viewer, now = new Date()) {
  const [derived, branch, memberRows, tracked, feedback, reports, ignoredRows] = await Promise.all([
    loadDerivedProfile(viewer),
    viewer.branch ? getBranch(viewer.branch) : null,
    CommunityMember.find({ user: viewer._id, status: { $in: ['active', 'banned'] } }).select('community status').limit(200).lean(),
    OpportunityApplication.find({ user: viewer._id }).distinct('opportunity'),
    RecommendationFeedback.find({ user: viewer._id }).select('targetType targetId action traits createdAt').sort({ createdAt: -1 }).limit(FEEDBACK_RULES.readLimit).lean(),
    Report.find({ reporter: viewer._id }).select('targetType targetId').sort({ createdAt: -1 }).limit(FEEDBACK_RULES.readLimit).lean(),
    RecommendationInteraction.find({ user: viewer._id, impressions: { $gte: INTERACTION_RULES.ignoredAfter }, clicks: 0 }).select('targetType targetId').limit(INTERACTION_RULES.readLimit).lean(),
  ]);

  const activeIds = memberRows.filter((row) => row.status === 'active').map((row) => row.community);
  const communities = activeIds.length ? await Community.find({ _id: { $in: activeIds } }).select('name type').lean() : [];
  const memberships = new Map(communities.map((community) => [community._id.toString(), { name: community.name, type: community.type }]));

  const profileInterests = await interestProfiles(viewer.interests ?? [], false);
  const learnedInterests = await interestProfiles((derived.interests ?? []).filter((id) => !(viewer.interests ?? []).includes(id)), true);
  const interests = [...profileInterests, ...learnedInterests];

  // Skills: the student's own, then tech they've built with (projects, achievements).
  const own = [...(viewer.skills ?? []).map((skill) => ({ key: lower(skill), label: skill })), ...(derived.skills ?? []).map((key) => ({ key, label: skillLabel(key) }))];
  const byKey = new Map();
  for (const skill of own) if (skill.key && !byKey.has(skill.key)) byKey.set(skill.key, skill);
  const skills = [...byKey.values()];
  const learnedKeywords = (derived.keywords ?? []).filter((keyword) => !skills.some((skill) => skill.key === keyword));
  const keywords = [...new Set([...skills.map((skill) => skill.key), ...interests.flatMap((interest) => interest.keywords), ...learnedKeywords])].slice(0, 40);

  const learned = new Set([
    ...(derived.preferredCategories ?? []).map((id) => `postType:${id}`),
    ...(derived.preferredOpportunityTypes ?? []).map((id) => `opportunityType:${id}`),
    ...(derived.preferredCommunityTypes ?? []).map((id) => `communityType:${id}`),
    ...(derived.preferredProjectCategories ?? []).map((id) => `projectCategory:${id}`),
    ...(derived.preferredAchievementTypes ?? []).map((id) => `achievementType:${id}`),
  ]);

  const hidden = Object.fromEntries([...Object.values(TARGET_TYPES), ANONYMOUS_TARGET_TYPE].map((type) => [type, new Set()]));
  const penalties = new Set();
  const similarSince = now.getTime() - FEEDBACK_RULES.similarForDays * DAY_MS;
  for (const row of feedback) {
    hidden[row.targetType]?.add(row.targetId.toString());
    if (row.action === FEEDBACK_ACTIONS.NOT_INTERESTED && new Date(row.createdAt).getTime() >= similarSince) for (const trait of row.traits ?? []) penalties.add(trait);
  }
  for (const row of reports) hidden[REPORTED_AS[row.targetType]]?.add(row.targetId.toString());

  const counts = derived.activitySignals?.counts ?? {};
  const activity = Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const basedOn = [
    ...(profileInterests.length ? ['interests'] : []),
    ...(skills.length ? ['skills'] : []),
    ...(viewer.college ? ['campus'] : []),
    ...(memberships.size ? ['communities'] : []),
    ...(activity - (counts.communitiesJoined ?? 0) > 0 ? ['activity'] : []),
  ];

  return {
    viewer,
    userId: viewer._id,
    college: viewer.college ?? null,
    branch: viewer.branch ?? null,
    semester: viewer.semester ?? null,
    branchShort: branch?.shortName ?? branch?.name ?? null,
    interests,
    skills,
    keywords,
    textTerms: textTermsOf(keywords),
    learned,
    learnedKeywords,
    projectCategories: [...new Set([...interests.flatMap((interest) => interest.projectCategories), ...(derived.preferredProjectCategories ?? [])])],
    achievementTypes: [...new Set([...interests.flatMap((interest) => interest.achievementTypes), ...(derived.preferredAchievementTypes ?? [])])],
    opportunityTypes: [...new Set([...interests.flatMap((interest) => interest.opportunityTypes), ...(derived.preferredOpportunityTypes ?? [])])],
    memberships,
    excludedCommunities: memberRows.map((row) => row.community.toString()),
    tracked: tracked.map(String),
    hidden,
    penalties,
    ignored: new Set(ignoredRows.map((row) => `${row.targetType}:${row.targetId}`)),
    isNew: activity < PROFILE_RULES.newStudentSignals,
    basedOn,
  };
}

// ----------------------------------------------------------------------------- ranking (cached)

/** Per-request state: one clock, one cache version, and the student profile only if something needs it. */
function requestState(viewer) {
  const now = new Date();
  let context;
  let version;
  return {
    now,
    context: () => (context ??= buildStudentProfile(viewer, now)),
    version: () => (version ??= getProfileVersion(viewer._id.toString())),
  };
}

const cacheKey = async (viewer, state, name) => `${CACHE_RULES.keyPrefix}:user:${viewer._id}:${await state.version()}:${name}`;
const personalizationOf = (context) => ({ basedOn: context.basedOn, isNew: context.isNew });

/**
 * One type's ranked list for the student: ids, reasons and (server-side only) scores. Cached for
 * CACHE_RULES.ttlSeconds; a profile change, a new membership or "Not interested" starts a new version.
 */
async function rankedList(type, viewer, state) {
  const key = await cacheKey(viewer, state, type);
  const cached = await getCache(key);
  if (cached) return cached;

  const context = await state.context();
  const ranked = rankCandidates(await CANDIDATES[type](context, state.now), context, state.now);
  const picked = applyDiversity(ranked, { type, limit: RESULT_RULES.ranked });
  const value = {
    generatedAt: state.now.toISOString(),
    personalization: personalizationOf(context),
    entries: picked.map((item) => ({ id: item.id, reasons: item.reasons, score: round(item.score), profileScore: round(item.profileScore) })),
  };
  await setCache(key, value, CACHE_RULES.ttlSeconds);
  return value;
}

/** Trending on campus (cached like the lists): recent engagement, not personal fit. */
async function trendingList(viewer, state) {
  const key = await cacheKey(viewer, state, RECOMMENDATION_TYPES.CAMPUS_ACTIVITY);
  const cached = await getCache(key);
  if (cached) return cached;
  const value = { generatedAt: state.now.toISOString(), ...(await trendingCandidates(await state.context(), state.now)) };
  await setCache(key, value, CACHE_RULES.ttlSeconds);
  return value;
}

// ----------------------------------------------------------------------------- safe items

/**
 * Loads items through each feature's own views and visibility rules (never raw documents). Run on every
 * request, after the cached ranking: anything deleted, hidden, moderated, expired or no longer visible
 * since then drops out here.
 */
const HYDRATE = Object.freeze({
  [RECOMMENDATION_TYPES.POSTS]: async (ids, viewer) => findPostViews({ $and: [{ _id: { $in: ids } }, await visibleTo(viewer), RECOMMENDABLE] }, viewer),
  [ANONYMOUS_TARGET_TYPE]: async (ids, viewer) =>
    findAnonymousPostViews({ $and: [{ _id: { $in: ids } }, await readableBy(viewer), RECOMMENDABLE, { author: { $ne: viewer._id } }] }, viewer),
  [RECOMMENDATION_TYPES.PROJECTS]: (ids, viewer) =>
    findProjectCards({ $and: [{ _id: { $in: ids } }, projectVisibleTo(viewer), RECOMMENDABLE, { status: { $ne: 'archived' } }] }, viewer, { limit: ids.length }),
  [RECOMMENDATION_TYPES.COMMUNITIES]: async (ids, viewer) =>
    presentCommunities(await Community.find({ $and: [{ _id: { $in: ids } }, { status: 'active' }, RECOMMENDABLE, scopeFilter(viewer)] }).lean(), viewer),
  [RECOMMENDATION_TYPES.OPPORTUNITIES]: async (ids, viewer, now) =>
    presentOpportunities(await Opportunity.find({ $and: [{ _id: { $in: ids } }, listedFor(viewer), openFilter(now), eligibleFilter(viewer)] }).select('-description').lean(), viewer, { now }),
  [RECOMMENDATION_TYPES.ACHIEVEMENTS]: async (ids, viewer) =>
    presentAchievements(await Achievement.find({ $and: [{ _id: { $in: ids } }, showcaseVisibleTo(viewer), RECOMMENDABLE] }).select('-description -verification').lean(), viewer),
  [RECOMMENDATION_TYPES.STUDENTS]: (ids, viewer) => studentViews(ids, viewer),
});

/**
 * The last safety pass on finished views: never the student's own things, anything they dismissed or
 * reported, communities they're in (or were removed from) or can't join, or opportunities they can't
 * apply to (closed, expired, not eligible) or already track. Content that is held, removed or flagged
 * never reaches this point (RECOMMENDABLE in every query).
 */
export function filterUnsafeContent(type, views, excluded = new Set()) {
  return views.filter((view) => {
    if (!view || excluded.has(view.id) || view.isOwner || view.isYou) return false;
    switch (type) {
      case RECOMMENDATION_TYPES.PROJECTS:
        return !view.myTeamStatus;
      case RECOMMENDATION_TYPES.COMMUNITIES:
        return view.status === 'active' && !view.membership && view.canJoin;
      case RECOMMENDATION_TYPES.OPPORTUNITIES:
        return view.acceptingApplications && view.viewerEligibility?.eligible !== false && !view.tracking;
      default:
        return true;
    }
  });
}

/** Ids the student dismissed or reported (checked fresh on every request, whatever the cache says). */
async function excludedNow(viewer, ids) {
  if (ids.length === 0) return new Set();
  const targetIds = ids.map(oid);
  const [feedback, reports] = await Promise.all([
    RecommendationFeedback.find({ user: viewer._id, targetId: { $in: targetIds } }).select('targetId').lean(),
    Report.find({ reporter: viewer._id, targetId: { $in: targetIds } }).select('targetId').lean(),
  ]);
  return new Set([...feedback, ...reports].map((row) => row.targetId.toString()));
}

/**
 * Turns ranked entries into safe items: { ...the feature's own allow-listed view, recommendationType,
 * reasons }. `requests` is { hydrateKey: entries }; returns Map(hydrateKey → Map(id → item)).
 */
async function presentEntries(requests, viewer, now) {
  const allIds = [...new Set(Object.values(requests).flatMap((entries) => entries.map((entry) => entry.id)))];
  const excluded = await excludedNow(viewer, allIds);
  const results = new Map();
  await Promise.all(
    Object.entries(requests).map(async ([key, entries]) => {
      const ids = [...new Set(entries.map((entry) => entry.id))].filter((id) => !excluded.has(id));
      const type = key === ANONYMOUS_TARGET_TYPE ? RECOMMENDATION_TYPES.POSTS : key;
      const views = ids.length ? await HYDRATE[key](ids.map(oid), viewer, now) : [];
      const safe = sanitizeSearchResults(type, filterUnsafeContent(type, views, excluded));
      const reasons = new Map(entries.map((entry) => [entry.id, entry.reasons]));
      results.set(key, new Map(safe.map((view) => [view.id, { ...view, recommendationType: type, reasons: reasons.get(view.id) ?? [] }])));
    }),
  );
  return results;
}

const pickFrom = (presented, key, entries) => entries.map((entry) => presented.get(key)?.get(entry.id)).filter(Boolean);

function personalization(meta, items) {
  const message = meta?.isNew ? PERSONALIZATION_MESSAGES.newStudent : items.length === 0 ? PERSONALIZATION_MESSAGES.empty : null;
  return { basedOn: meta?.basedOn ?? [], isNew: Boolean(meta?.isNew), ...(message && { message }) };
}

// ----------------------------------------------------------------------------- lists

/** One type, a page at a time (pages of the ranked list). */
export async function getRecommendations(type, viewer, { page = 1, limit = RESULT_RULES.pageSize.default } = {}) {
  if (!LIST_TYPES.includes(type)) throw ApiError.notFound('Unknown recommendation type.');
  const state = requestState(viewer);
  const list = await rankedList(type, viewer, state);
  const entries = list.entries.slice((page - 1) * limit, page * limit);
  const presented = await presentEntries({ [type]: entries }, viewer, state.now);
  const recommendations = pickFrom(presented, type, entries);
  return {
    type,
    recommendations,
    pagination: { page, limit, total: list.entries.length, hasMore: page * limit < list.entries.length },
    generatedAt: list.generatedAt,
    personalization: personalization(list.personalization, recommendations),
  };
}

export const getRecommendedPosts = (viewer, options) => getRecommendations(RECOMMENDATION_TYPES.POSTS, viewer, options);
export const getRecommendedProjects = (viewer, options) => getRecommendations(RECOMMENDATION_TYPES.PROJECTS, viewer, options);
export const getRecommendedCommunities = (viewer, options) => getRecommendations(RECOMMENDATION_TYPES.COMMUNITIES, viewer, options);
export const getRecommendedOpportunities = (viewer, options) => getRecommendations(RECOMMENDATION_TYPES.OPPORTUNITIES, viewer, options);
export const getRecommendedStudents = (viewer, options) => getRecommendations(RECOMMENDATION_TYPES.STUDENTS, viewer, options);
export const getRecommendedAchievements = (viewer, options) => getRecommendations(RECOMMENDATION_TYPES.ACHIEVEMENTS, viewer, options);

// ----------------------------------------------------------------------------- combined pages

const trendingEntries = (trending) => ({
  posts: trending.posts.map((row) => ({ id: row.id, reasons: [REASONS.trending] })),
  discussions: trending.discussions.map((row) => ({ id: row.id, reasons: [REASONS.trendingAnonymous] })),
  projects: trending.projects.map((row) => ({ id: row.id, reasons: [REASONS.trending] })),
});

/**
 * Builds "For you" (a mixed list across types) plus a few sections, and trending. Items already in
 * "For you" aren't repeated in the sections below it.
 */
async function combined(viewer, { types, sectionSize, forYouSize, trendingSize }) {
  const state = requestState(viewer);
  const [lists, trending] = await Promise.all([Promise.all(LIST_TYPES.map((type) => rankedList(type, viewer, state))), trendingList(viewer, state)]);
  const byType = Object.fromEntries(LIST_TYPES.map((type, index) => [type, lists[index].entries]));

  const forYou = mixRecommendations(
    Object.fromEntries(Object.entries(byType).map(([type, entries]) => [type, entries.filter((entry) => entry.profileScore >= MATCH_RULES.minProfileScore || lists[0].personalization?.isNew)])),
    forYouSize,
  );
  const inForYou = new Set(forYou.map((entry) => `${entry.type}:${entry.id}`));
  // Sections show what "For you" didn't, and only repeat its picks when they'd otherwise be thin (a new
  // campus with little content). A few spare entries each, in case some drop out at the safety pass.
  const sectionEntries = Object.fromEntries(
    types.map((type) => {
      const fresh = byType[type].filter((entry) => !inForYou.has(`${type}:${entry.id}`));
      const repeats = fresh.length < sectionSize ? byType[type].filter((entry) => inForYou.has(`${type}:${entry.id}`)) : [];
      return [type, [...fresh, ...repeats].slice(0, sectionSize + 4)];
    }),
  );
  const trend = trendingEntries(trending);
  trend.posts = trend.posts.slice(0, trendingSize);

  const requests = {};
  const addRequest = (key, entries) => {
    requests[key] = [...(requests[key] ?? []), ...entries];
  };
  for (const entry of forYou) addRequest(entry.type, [entry]);
  for (const [type, entries] of Object.entries(sectionEntries)) addRequest(type, entries);
  addRequest(RECOMMENDATION_TYPES.POSTS, trend.posts);
  addRequest(ANONYMOUS_TARGET_TYPE, trend.discussions);
  addRequest(RECOMMENDATION_TYPES.PROJECTS, trend.projects);
  const presented = await presentEntries(requests, viewer, state.now);

  const recommendations = forYou.map((entry) => presented.get(entry.type)?.get(entry.id)).filter(Boolean);
  const sections = Object.fromEntries(types.map((type) => [type, pickFrom(presented, type, sectionEntries[type]).slice(0, sectionSize)]));
  // Trending items carry their own reason, whatever a personal list said about the same item.
  const withReasons = (items, reasons) => items.map((item) => ({ ...item, reasons }));
  const meta = lists[0].personalization;
  return {
    recommendations,
    sections,
    trending: {
      posts: withReasons(pickFrom(presented, RECOMMENDATION_TYPES.POSTS, trend.posts), [REASONS.trending]),
      discussions: withReasons(pickFrom(presented, ANONYMOUS_TARGET_TYPE, trend.discussions), [REASONS.trendingAnonymous]),
      projects: withReasons(pickFrom(presented, RECOMMENDATION_TYPES.PROJECTS, trend.projects), [REASONS.trending]),
    },
    generatedAt: state.now.toISOString(),
    personalization: personalization(meta, [...recommendations, ...Object.values(sections).flat()]),
  };
}

/** The home page: a short "Recommended for you" mix, a few opportunities, projects and communities, and trending. */
export function getPersonalizedHome(viewer) {
  const H = RESULT_RULES.home;
  return combined(viewer, {
    types: [RECOMMENDATION_TYPES.OPPORTUNITIES, RECOMMENDATION_TYPES.PROJECTS, RECOMMENDATION_TYPES.COMMUNITIES],
    sectionSize: H.section,
    forYouSize: H.forYou,
    trendingSize: H.trending,
  });
}

/** /discover: "For you", every section, and trending on campus. */
export function getCampusDiscovery(viewer) {
  return combined(viewer, { types: [...LIST_TYPES], sectionSize: RESULT_RULES.section, forYouSize: RESULT_RULES.home.forYou, trendingSize: RESULT_RULES.trending.posts });
}

// ----------------------------------------------------------------------------- feedback

const lowerList = (list, max) => [...new Set((list ?? []).map(lower).filter(Boolean))].slice(0, max);

/**
 * The item a student is acting on, if they may see it, with the plain traits used for "show fewer like
 * this" (`similar`) and for learning from what they open (`learn`). Anonymous posts never teach anything.
 */
async function resolveTarget(type, id, viewer) {
  if (!LIST_TYPES.includes(type) || !isObjectId(id)) throw ApiError.notFound(NOT_FOUND);
  const _id = oid(id);
  const one = (model, ...filters) => model.findOne({ $and: [{ _id }, ...filters] });
  switch (type) {
    case RECOMMENDATION_TYPES.POSTS: {
      const post = await one(Post, await visibleTo(viewer)).select('type content').lean();
      if (post) return { targetType: TARGET_TYPES.posts, similar: [`postType:${post.type}`], learn: [`postType:${post.type}`, ...topicTraits(post.content)] };
      const anonymous = await one(AnonymousPost, await readableBy(viewer)).select('_id').lean();
      if (anonymous) return { targetType: ANONYMOUS_TARGET_TYPE, similar: [], learn: [] };
      break;
    }
    case RECOMMENDATION_TYPES.PROJECTS: {
      const project = await one(Project, projectVisibleTo(viewer)).select('category techStack').lean();
      if (project) return { targetType: TARGET_TYPES.projects, similar: [`projectCategory:${project.category}`], learn: [`projectCategory:${project.category}`, ...lowerList(project.techStack, 5).map((tech) => `keyword:${tech}`)] };
      break;
    }
    case RECOMMENDATION_TYPES.COMMUNITIES: {
      const community = await one(Community, { status: 'active' }, scopeFilter(viewer)).select('name type tags official').lean();
      if (community) {
        const interest = interestOfCommunity(community);
        const topics = lowerList(community.tags, 3).map((tag) => `keyword:${tag}`);
        return { targetType: TARGET_TYPES.communities, similar: interest ? [`interest:${interest}`] : topics, learn: [`communityType:${community.type}`, ...topics] };
      }
      break;
    }
    case RECOMMENDATION_TYPES.OPPORTUNITIES: {
      const opportunity = await one(Opportunity, listedFor(viewer)).select('type skills tags').lean();
      if (opportunity) return { targetType: TARGET_TYPES.opportunities, similar: [`opportunityType:${opportunity.type}`], learn: [`opportunityType:${opportunity.type}`, ...lowerList([...(opportunity.skills ?? []), ...(opportunity.tags ?? [])], 5).map((word) => `keyword:${word}`)] };
      break;
    }
    case RECOMMENDATION_TYPES.ACHIEVEMENTS: {
      const achievement = await one(Achievement, showcaseVisibleTo(viewer)).select('type skills').lean();
      if (achievement) return { targetType: TARGET_TYPES.achievements, similar: [`achievementType:${achievement.type}`], learn: [`achievementType:${achievement.type}`, ...lowerList(achievement.skills, 5).map((skill) => `keyword:${skill}`)] };
      break;
    }
    case RECOMMENDATION_TYPES.STUDENTS: {
      // People are hidden one by one; nothing is learned or generalised from a person.
      const student = viewer._id.equals(_id) ? null : await one(User, ACTIVE_STUDENT).select('_id').lean();
      if (student) return { targetType: TARGET_TYPES.students, similar: [], learn: [] };
      break;
    }
    default:
      break;
  }
  throw ApiError.notFound(NOT_FOUND);
}

/**
 * "Not interested" (or dismiss) on a recommendation: hidden from the student's recommendations for
 * FEEDBACK_RULES.hideForDays; "Not interested" also lowers similar items of the same kind for a while.
 */
export async function dismissRecommendation(viewer, type, id, action = FEEDBACK_ACTIONS.DISMISS) {
  const target = await resolveTarget(type, id, viewer);
  const traits = action === FEEDBACK_ACTIONS.NOT_INTERESTED ? target.similar.map((trait) => penaltyKey(type, trait)) : [];
  await RecommendationFeedback.updateOne(
    { user: viewer._id, targetType: target.targetType, targetId: oid(id) },
    { $set: { action, traits, createdAt: new Date() } },
    { upsert: true },
  );
  await bumpProfileVersion(viewer._id.toString());
  return { type, id: String(id), action };
}

// ----------------------------------------------------------------------------- interactions

/**
 * Records that recommendations were shown or opened. Impressions count at most once an hour per item;
 * an open also teaches the derived profile (traits of what was opened, never of a person or an
 * anonymous post). Malformed or unknown items are skipped quietly: this is analytics, not an action.
 */
export async function recordInteractions(viewer, { action, items }) {
  const now = new Date();
  const valid = items.filter((item) => LIST_TYPES.includes(item.type) && isObjectId(item.id)).slice(0, INTERACTION_RULES.maxBatch);
  if (valid.length === 0) return { recorded: 0 };

  // Posts can be campus or Anonymous Zone posts: the database says which.
  const postIds = valid.filter((item) => item.type === RECOMMENDATION_TYPES.POSTS).map((item) => oid(item.id));
  const campusPosts = new Set(postIds.length ? (await Post.find({ _id: { $in: postIds } }).select('_id').lean()).map((post) => post._id.toString()) : []);
  const targetTypeOf = (item) => (item.type === RECOMMENDATION_TYPES.POSTS && !campusPosts.has(item.id) ? ANONYMOUS_TARGET_TYPE : TARGET_TYPES[item.type]);

  if (action === INTERACTION_ACTIONS.CLICK) {
    const [item] = valid;
    const target = await resolveTarget(item.type, item.id, viewer).catch(() => null);
    if (!target) return { recorded: 0 };
    await RecommendationInteraction.updateOne(
      { user: viewer._id, targetType: target.targetType, targetId: oid(item.id) },
      { $inc: { clicks: 1 }, $set: { lastClickedAt: now } },
      { upsert: true },
    );
    if (target.learn.length) await recordSignal(viewer._id, { kind: 'recommendation-click', ref: item.id, traits: target.learn });
    return { recorded: 1 };
  }

  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const recent = { $gt: [{ $ifNull: ['$lastShownAt', new Date(0)] }, hourAgo] };
  await RecommendationInteraction.collection.bulkWrite(
    valid.map((item) => ({
      updateOne: {
        filter: { user: viewer._id, targetType: targetTypeOf(item), targetId: oid(item.id) },
        update: [
          {
            $set: {
              impressions: { $cond: [recent, { $ifNull: ['$impressions', 0] }, { $add: [{ $ifNull: ['$impressions', 0] }, 1] }] },
              lastShownAt: { $cond: [recent, '$lastShownAt', now] },
              clicks: { $ifNull: ['$clicks', 0] },
              lastClickedAt: { $ifNull: ['$lastClickedAt', null] },
              createdAt: { $ifNull: ['$createdAt', now] },
              updatedAt: now,
            },
          },
        ],
        upsert: true,
      },
    })),
    { ordered: false },
  );
  return { recorded: valid.length };
}

