import mongoose from 'mongoose';
import { BRANCHES, COLLEGES, INTERESTS, SKILL_SUGGESTIONS } from '../data/campusOptions.js';
import { COMMUNITY_TYPES } from '../data/communityOptions.js';
import { DEADLINE_FILTERS, OPPORTUNITY_MODES, OPPORTUNITY_TYPES } from '../data/opportunityOptions.js';
import { POST_TYPES } from '../data/postOptions.js';
import { SEARCH_RULES, SEARCH_SORTS, SEARCH_TABS, SEARCH_TYPES } from '../data/searchOptions.js';
import { SEARCHABLE_STATUSES } from '../config/moderationConfig.js';
import { ACHIEVEMENT_TYPES, PROJECT_CATEGORIES, TECH_SUGGESTIONS } from '../data/showcaseOptions.js';
import Achievement from '../models/Achievement.js';
import AnonymousPost from '../models/AnonymousPost.js';
import Community from '../models/Community.js';
import Opportunity from '../models/Opportunity.js';
import Post from '../models/Post.js';
import Project from '../models/Project.js';
import User, { ACCOUNT_STATUSES } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import { presentAchievements } from './achievementService.js';
import { findPosts as findAnonymousPostViews, readableBy } from './anonymousService.js';
import { getCache, setCache } from './cacheService.js';
import { getInterest, getOnboardingOptions } from './campusOptionsService.js';
import { scopeFilter, viewerMemberships } from './communityAccess.js';
import { ensureOfficialCommunities, presentCommunities } from './communityService.js';
import { daysFromNow, listedFor, openFilter, openTo } from './opportunityAccess.js';
import { presentOpportunities, sortStages as opportunitySortStages } from './opportunityService.js';
import { findPosts as findPostViews, visibleTo } from './postService.js';
import { toStudentSummary } from './profileService.js';
import { findProjectCards, projectVisibleTo } from './projectService.js';
import { calculateSearchScore, scoreExpression } from './searchRelevance.js';
import { exactPattern, matchOptions, namePattern, normalizeQuery, optionsForWord, requiredStudentWords, wordPattern } from './searchQuery.js';
import { showcaseVisibleTo } from './showcaseAccess.js';

export { normalizeQuery } from './searchQuery.js';
export { calculateSearchScore } from './searchRelevance.js';

/*
 * Search & Discovery. Every search runs inside the same visibility rules the rest of CampusX uses, read
 * from the signed-in student (`viewer`, req.user): campus/branch/community post rules, community scopes,
 * project and achievement visibility, listed opportunities, and the Anonymous Zone's own rules. Results
 * are ranked and paginated in the database (services/searchRelevance.js), then built by each feature's
 * own allow-list views and filtered once more through sanitizeSearchResults(): never raw documents.
 *
 * Trust & Safety: search only ever returns content in good standing that isn't flagged either
 * (SEARCHABLE_STATUSES): flagged, held and removed content never appears, not even to its owner.
 *
 * Anonymous Zone posts are matched on their title and content only. Their author is never read, matched,
 * scored or returned, so searching a student's name can't connect them to an anonymous post.
 */

const ACTIVE_STUDENT = { status: ACCOUNT_STATUSES.ACTIVE, onboardingCompleted: true };
// Content saved before a model had a moderation status has none: it counts as approved.
const SEARCHABLE = Object.freeze({ moderationStatus: { $in: [...SEARCHABLE_STATUSES, null] } });
const timeLimit = { maxTimeMS: SEARCH_RULES.timeoutMs };

// ----------------------------------------------------------------------------- shared helpers

/** A search that hit the time limit answers 503 instead of keeping the database busy. */
async function guarded(work) {
  try {
    return await work();
  } catch (error) {
    if (error?.code === 50 || error?.codeName === 'MaxTimeMSExpired') {
      logger.warn('Search stopped at the time limit');
      throw ApiError.serviceUnavailable('Search is taking longer than usual. Please try a more specific search.');
    }
    throw error;
  }
}

const unwrapOr = (clauses) => (clauses.length === 1 ? clauses[0] : { $or: clauses });

/**
 * "Matches the query": the text index for whole words (with stemming: "hackathons" finds "hackathon"),
 * plus word-prefix matches on short indexed fields ("rea" finds "React") and the ids of options the query
 * names ("hackathon" → type hackathon). MongoDB requires every other clause next to $text to use an
 * index, so `prefixFields` and the option fields are all indexed (see the models).
 */
function keywordClause(query, { text = true, prefixFields = [], options = {}, extra = [] }) {
  const clauses = [];
  if (text && query.textSearch) clauses.push({ $text: { $search: query.textSearch } });
  for (const path of prefixFields) {
    for (const word of query.words) clauses.push({ [path]: wordPattern(word) });
  }
  for (const [path, ids] of Object.entries(options)) {
    if (ids?.length) clauses.push({ [path]: { $in: ids } });
  }
  clauses.push(...extra);
  return clauses.length ? unwrapOr(clauses) : { _id: null };
}

const usesText = (query, text = true) => text && Boolean(query.textSearch);

/**
 * Ranks matches in the database and returns one page of ids (plus the sort keys, for merging two
 * collections) and the total. Only `_id` and sort keys leave the database here.
 */
async function rankPage(model, { match, score, sort, skip, limit, addFields = {}, keep = {} }) {
  const pipeline = [
    { $match: match },
    { $addFields: { _score: score, ...addFields } },
    ...(Array.isArray(sort) ? sort : [{ $sort: sort }]),
    { $skip: skip },
    { $limit: limit },
    { $project: { _id: 1, _score: 1, createdAt: 1, ...keep } },
  ];
  const [rows, total] = await guarded(() => Promise.all([model.aggregate(pipeline).option(timeLimit), model.countDocuments(match).maxTimeMS(SEARCH_RULES.timeoutMs)]));
  return { rows, total };
}

/** Puts views back into the ranked order; anything the second visibility check dropped stays out. */
function inOrder(ids, views) {
  const byId = new Map(views.map((view) => [view.id, view]));
  return ids.map((id) => byId.get(id.toString())).filter(Boolean);
}

const pagination = (page, limit, total) => ({ page, limit, total, hasMore: page * limit < total && page < SEARCH_RULES.maxPage });
const oid = (id) => new mongoose.Types.ObjectId(id);
const anyOf = (path, values) => ({ [path]: { $in: values.map(exactPattern) } });

// ----------------------------------------------------------------------------- safe result shapes

const STUDENT_SUMMARY = ['id', 'firstName', 'lastName', 'avatarUrl', 'college', 'branch', 'semester'];
const RESULT_FIELDS = Object.freeze({
  students: [...STUDENT_SUMMARY, 'skills', 'interests', 'isYou'],
  posts: ['id', 'type', 'content', 'media', 'visibility', 'community', 'author', 'likeCount', 'commentCount', 'likedByCurrentUser', 'savedByCurrentUser', 'isOwner', 'canModerate', 'editedAt', 'createdAt', 'updatedAt'],
  // No author, audience or college, ever: the view never has them, and they couldn't pass this list either.
  anonymous: ['id', 'anonymous', 'category', 'title', 'content', 'media', 'visibility', 'community', 'likeCount', 'commentCount', 'likedByCurrentUser', 'isOwner', 'edited', 'editedAt', 'createdAt', 'status', 'moderationStatus'],
  projects: ['id', 'slug', 'title', 'shortDescription', 'category', 'techStack', 'status', 'featured', 'thumbnail', 'owner', 'teamSize', 'views', 'likeCount', 'likedByCurrentUser', 'isOwner', 'createdAt'],
  communities: ['id', 'name', 'slug', 'description', 'type', 'visibility', 'college', 'branch', 'semester', 'iconUrl', 'coverImageUrl', 'memberCount', 'tags', 'official', 'status', 'membership', 'canJoin', 'joinBlockedReason', 'createdAt'],
  // Student view only: moderators' extras (createdBy, visibility, canManage) stay on the management pages.
  opportunities: ['id', 'slug', 'title', 'shortDescription', 'type', 'organizer', 'organizerLogo', 'image', 'location', 'mode', 'startDate', 'endDate', 'applicationDeadline', 'skills', 'tags', 'prize', 'featured', 'status', 'displayStatus', 'acceptingApplications', 'viewerEligibility', 'tracking', 'publishedAt', 'createdAt'],
  // The list view never carries proof files or the reviewer's note.
  achievements: ['id', 'title', 'type', 'organization', 'eventName', 'date', 'rank', 'skills', 'verificationStatus', 'proofCount', 'hasCertificateLink', 'owner', 'isOwner', 'createdAt'],
});
const NESTED_PEOPLE = { posts: 'author', projects: 'owner', achievements: 'owner' };

const pick = (item, keys) => Object.fromEntries(keys.filter((key) => item[key] !== undefined).map((key) => [key, item[key]]));

/** Each result through its type's allow-list (people inside it through the public student summary). */
export function sanitizeSearchResults(type, items) {
  return items.map((item) => {
    const kind = type === SEARCH_TYPES.POSTS && item.anonymous ? 'anonymous' : type;
    const safe = pick(item, RESULT_FIELDS[kind]);
    const person = NESTED_PEOPLE[kind];
    if (person && safe[person]) safe[person] = pick(safe[person], STUDENT_SUMMARY);
    return safe;
  });
}

// ----------------------------------------------------------------------------- filters

/** Discovery filters (already validated against CampusX's own option lists) as MongoDB conditions. */
export function buildSearchFilters(type, filters = {}, now = new Date()) {
  const conditions = [];
  const { college, branch, semester, skills = [], interests = [], tech = [], category, type: kind, mode, deadline = 'any', verified } = filters;
  switch (type) {
    case SEARCH_TYPES.STUDENTS:
      if (college) conditions.push({ college });
      if (branch) conditions.push({ branch });
      if (semester) conditions.push({ semester });
      if (skills.length) conditions.push(anyOf('skills', skills));
      if (interests.length) conditions.push({ interests: { $in: interests } });
      break;
    case SEARCH_TYPES.POSTS:
      if (kind) conditions.push({ type: kind });
      break;
    case SEARCH_TYPES.PROJECTS:
      if (category) conditions.push({ category });
      if (tech.length) conditions.push(anyOf('techStack', tech));
      break;
    case SEARCH_TYPES.COMMUNITIES:
      if (kind) conditions.push({ type: kind });
      if (college) conditions.push({ college });
      if (branch) conditions.push({ branch });
      break;
    case SEARCH_TYPES.OPPORTUNITIES:
      if (kind) conditions.push({ type: kind });
      if (mode) conditions.push({ mode });
      if (skills.length) conditions.push(anyOf('skills', skills));
      if (deadline !== 'any') conditions.push(openFilter(now));
      if (deadline === '7d' || deadline === '30d') conditions.push({ applicationDeadline: { $gt: now, $lte: daysFromNow(deadline === '7d' ? 7 : 30, now) } });
      // "Open to": no rule at all, or a rule that includes it. Filters only narrow what the student may already see.
      if (college) conditions.push(openTo('eligibleColleges', college));
      if (branch) conditions.push(openTo('eligibleBranches', branch));
      if (semester) conditions.push(openTo('eligibleSemesters', semester));
      break;
    case SEARCH_TYPES.ACHIEVEMENTS:
      if (kind) conditions.push({ type: kind });
      if (verified) conditions.push({ verificationStatus: 'verified' });
      break;
    default:
      break;
  }
  return conditions;
}

// ----------------------------------------------------------------------------- students

/** Public student summaries (plus skills and interests) for ids, in that order. Also used by recommendations. */
export async function studentViews(ids, viewer) {
  if (ids.length === 0) return [];
  const users = await User.find({ _id: { $in: ids }, ...ACTIVE_STUDENT }).select('firstName lastName avatarUrl college branch semester skills interests').lean();
  const views = await Promise.all(
    users.map(async (user) => {
      const interests = await Promise.all((user.interests ?? []).slice(0, 3).map(getInterest));
      return {
        ...(await toStudentSummary(user)),
        skills: (user.skills ?? []).slice(0, 6),
        interests: interests.filter(Boolean).map(({ id, name }) => ({ id, name })),
        isYou: user._id.equals(viewer._id),
      };
    }),
  );
  return inOrder(ids, views);
}

/** One condition per required word: a name, a skill, or a campus option that word stands for. */
function studentWordClause(word, query) {
  const options = optionsForWord(word, query.words);
  const pattern = wordPattern(word);
  return {
    $or: [
      { firstName: namePattern(word) },
      { lastName: namePattern(word) },
      { skills: pattern },
      ...(options.colleges.length ? [{ college: { $in: options.colleges } }] : []),
      ...(options.branches.length ? [{ branch: { $in: options.branches } }] : []),
      ...(options.interests.length ? [{ interests: { $in: options.interests } }] : []),
      ...(options.semesters.length ? [{ semester: { $in: options.semesters } }] : []),
    ],
  };
}

/**
 * Students by public profile details only: names, college, branch, semester, skills and interests.
 * Email, roll number and account fields are never searched or returned. Every required word must match.
 */
export async function searchStudents(viewer, rawQuery, { filters = {}, sort = 'relevance', page = 1, limit = SEARCH_RULES.pageSize.default } = {}) {
  const query = normalizeQuery(rawQuery);
  const options = matchOptions(query);
  const match = { $and: [ACTIVE_STUDENT, ...buildSearchFilters(SEARCH_TYPES.STUDENTS, filters), ...requiredStudentWords(query).map((word) => studentWordClause(word, query))] };
  const score = scoreExpression(
    {
      title: { $concat: [{ $ifNull: ['$firstName', ''] }, ' ', { $ifNull: ['$lastName', ''] }] },
      tags: ['skills'],
      options: { college: options.colleges, branch: options.branches, interests: options.interests, semester: options.semesters },
    },
    query,
  );
  const order = sort === 'name' ? { firstName: 1, lastName: 1, _id: 1 } : { _score: -1, firstName: 1, lastName: 1, _id: 1 };
  const { rows, total } = await rankPage(User, { match, score, sort: order, skip: (page - 1) * limit, limit });
  const results = await studentViews(rows.map((row) => row._id), viewer);
  return { query: query.text, type: SEARCH_TYPES.STUDENTS, sort, results: sanitizeSearchResults(SEARCH_TYPES.STUDENTS, results), pagination: pagination(page, limit, total) };
}

// ----------------------------------------------------------------------------- posts (campus + Anonymous Zone)

/** Active students whose name matches every word: for "posts by <name>" on campus posts only. */
async function matchingAuthorIds(query) {
  const words = requiredStudentWords(query);
  const users = await User.find({ $and: [ACTIVE_STUDENT, ...words.map((word) => ({ $or: [{ firstName: namePattern(word) }, { lastName: namePattern(word) }] }))] })
    .select('_id')
    .limit(SEARCH_RULES.authorMatches)
    .lean()
    .maxTimeMS(SEARCH_RULES.timeoutMs);
  return users.map((user) => user._id);
}

// Campus posts have no title: the opening of the post plays that part for word matches, as an
// anonymous post's title does, so neither kind outranks the other just for having a title.
const POST_HEADLINE = { $substrCP: [{ $ifNull: ['$content', ''] }, 0, 280] };

const POST_SORTS = {
  relevance: { _score: -1, createdAt: -1, _id: -1 },
  newest: { createdAt: -1, _id: -1 },
  popular: { _likes: -1, commentsCount: -1, createdAt: -1, _id: -1 },
};

/** The same order as POST_SORTS, for merging campus and anonymous pages in memory. */
function comparePosts(sort) {
  const keys = Object.entries(POST_SORTS[sort] ?? POST_SORTS.relevance);
  const value = (row, key) => (key === '_id' ? row._id.toString() : key === 'createdAt' ? new Date(row.createdAt).getTime() : (row[key] ?? 0));
  return (a, b) => {
    for (const [key, direction] of keys) {
      const [x, y] = [value(a, key), value(b, key)];
      if (x !== y) return (x < y ? -1 : 1) * direction;
    }
    return 0;
  };
}

/**
 * Campus posts the viewer may see (content, type, author name) and, unless a post type is chosen,
 * Anonymous Zone posts they may read (title and content only). Both lists are ranked by the same rules
 * and merged, a page at a time.
 */
export async function searchPosts(viewer, rawQuery, { filters = {}, sort = 'relevance', page = 1, limit = SEARCH_RULES.pageSize.default } = {}) {
  const query = normalizeQuery(rawQuery);
  const options = matchOptions(query);
  const window = page * limit;
  const popularity = { _likes: { $size: { $ifNull: ['$likes', []] } } };
  const keep = { _likes: 1, commentsCount: 1 };
  const authors = await matchingAuthorIds(query);

  const campusMatch = {
    $and: [
      await visibleTo(viewer),
      SEARCHABLE,
      ...buildSearchFilters(SEARCH_TYPES.POSTS, filters),
      keywordClause(query, { options: { type: options.postTypes }, extra: authors.length ? [{ author: { $in: authors } }] : [] }),
    ],
  };
  const campus = rankPage(Post, {
    match: campusMatch,
    score: scoreExpression({ title: POST_HEADLINE, options: { type: options.postTypes }, authors: { path: 'author', ids: authors }, keyword: usesText(query), date: 'createdAt' }, query),
    sort: POST_SORTS[sort] ?? POST_SORTS.relevance,
    skip: 0,
    limit: window,
    addFields: popularity,
    keep,
  });

  const includeAnonymous = !filters.type;
  const anonymous = includeAnonymous
    ? rankPage(AnonymousPost, {
        match: { $and: [await readableBy(viewer), SEARCHABLE, keywordClause(query, {})] },
        score: scoreExpression({ title: 'title', keyword: usesText(query), date: 'createdAt' }, query),
        sort: POST_SORTS[sort] ?? POST_SORTS.relevance,
        skip: 0,
        limit: window,
        addFields: popularity,
        keep,
      })
    : { rows: [], total: 0 };

  const [campusPage, anonymousPage] = await Promise.all([campus, anonymous]);
  const merged = [...campusPage.rows.map((row) => ({ ...row, anonymous: false })), ...anonymousPage.rows.map((row) => ({ ...row, anonymous: true }))]
    .sort(comparePosts(sort))
    .slice((page - 1) * limit, window);

  const campusIds = merged.filter((row) => !row.anonymous).map((row) => row._id);
  const anonymousIds = merged.filter((row) => row.anonymous).map((row) => row._id);
  // Hydrated through each feature's own views, with its visibility rule applied once more.
  const [campusViews, anonymousViews] = await Promise.all([
    campusIds.length ? findPostViews({ $and: [{ _id: { $in: campusIds } }, await visibleTo(viewer)] }, viewer) : [],
    anonymousIds.length ? findAnonymousPostViews({ $and: [{ _id: { $in: anonymousIds } }, await readableBy(viewer)] }, viewer) : [],
  ]);
  const views = new Map([...campusViews, ...anonymousViews].map((view) => [view.id, view]));
  const results = merged.map((row) => views.get(row._id.toString())).filter(Boolean);

  return {
    query: query.text,
    type: SEARCH_TYPES.POSTS,
    sort,
    results: sanitizeSearchResults(SEARCH_TYPES.POSTS, results),
    pagination: pagination(page, limit, campusPage.total + anonymousPage.total),
  };
}

// ----------------------------------------------------------------------------- projects

const PROJECT_SORTS = {
  relevance: { _score: -1, createdAt: -1, _id: -1 },
  newest: { createdAt: -1, _id: -1 },
  popular: { _likes: -1, views: -1, createdAt: -1, _id: -1 },
};

/** Projects the viewer may see (not archived) by title, descriptions, category and tech stack. */
export async function searchProjects(viewer, rawQuery, { filters = {}, sort = 'relevance', page = 1, limit = SEARCH_RULES.pageSize.default } = {}) {
  const query = normalizeQuery(rawQuery);
  const options = matchOptions(query);
  const match = {
    $and: [
      projectVisibleTo(viewer),
      { status: { $ne: 'archived' } },
      SEARCHABLE,
      ...buildSearchFilters(SEARCH_TYPES.PROJECTS, filters),
      keywordClause(query, { prefixFields: ['title', 'techStack'], options: { category: options.projectCategories } }),
    ],
  };
  const score = scoreExpression({ title: 'title', tags: ['techStack'], options: { category: options.projectCategories }, keyword: usesText(query), date: 'createdAt', featured: 'featured' }, query);
  const { rows, total } = await rankPage(Project, { match, score, sort: PROJECT_SORTS[sort] ?? PROJECT_SORTS.relevance, skip: (page - 1) * limit, limit, addFields: { _likes: { $size: { $ifNull: ['$likes', []] } } } });
  const ids = rows.map((row) => row._id);
  const cards = ids.length ? await findProjectCards({ $and: [{ _id: { $in: ids } }, projectVisibleTo(viewer)] }, viewer, { limit: ids.length }) : [];
  return { query: query.text, type: SEARCH_TYPES.PROJECTS, sort, results: sanitizeSearchResults(SEARCH_TYPES.PROJECTS, inOrder(ids, cards)), pagination: pagination(page, limit, total) };
}

// ----------------------------------------------------------------------------- communities

const COMMUNITY_SORTS = {
  relevance: { _score: -1, memberCount: -1, _id: -1 },
  popular: { memberCount: -1, official: -1, name: 1, _id: 1 },
  newest: { createdAt: -1, _id: -1 },
};

/** Active communities the viewer can find: their campus scope allows it, or they're already a member. */
async function discoverableCommunities(viewer) {
  await ensureOfficialCommunities(viewer);
  const memberIds = [...(await viewerMemberships(viewer)).keys()].map(oid);
  return { $and: [{ status: 'active' }, SEARCHABLE, { $or: [scopeFilter(viewer), { _id: { $in: memberIds } }] }] };
}

/**
 * Communities by name, description, tags, type, college and branch. A college/branch/class community is
 * only found by students its scope allows (or its members): it never reaches anyone else's results.
 */
export async function searchCommunities(viewer, rawQuery, { filters = {}, sort = 'relevance', page = 1, limit = SEARCH_RULES.pageSize.default } = {}) {
  const query = normalizeQuery(rawQuery);
  const options = matchOptions(query);
  const optionFields = { type: options.communityTypes, college: options.colleges, branch: options.branches };
  const discoverable = await discoverableCommunities(viewer);
  const match = { $and: [discoverable, ...buildSearchFilters(SEARCH_TYPES.COMMUNITIES, filters), keywordClause(query, { prefixFields: ['name', 'tags'], options: optionFields })] };
  const score = scoreExpression({ title: 'name', tags: ['tags'], options: optionFields, keyword: usesText(query), date: 'createdAt', featured: 'official' }, query);
  const { rows, total } = await rankPage(Community, { match, score, sort: COMMUNITY_SORTS[sort] ?? COMMUNITY_SORTS.relevance, skip: (page - 1) * limit, limit });
  const ids = rows.map((row) => row._id);
  const communities = ids.length ? await Community.find({ $and: [{ _id: { $in: ids } }, discoverable] }).lean() : [];
  const views = await presentCommunities(communities, viewer);
  return { query: query.text, type: SEARCH_TYPES.COMMUNITIES, sort, results: sanitizeSearchResults(SEARCH_TYPES.COMMUNITIES, inOrder(ids, views)), pagination: pagination(page, limit, total) };
}

// ----------------------------------------------------------------------------- opportunities

/** True for opportunities that no longer take applications (closed, or past their deadline). */
const closedNow = (now) => ({
  $or: [{ $eq: ['$status', 'closed'] }, { $and: [{ $ne: [{ $ifNull: ['$applicationDeadline', null] }, null] }, { $lte: ['$applicationDeadline', now] }] }],
});

/**
 * Published (or closed) opportunities the viewer may see, by title, descriptions, organizer, skills,
 * tags and type. Drafts and archived ones never appear, for anyone: they live on the management pages.
 */
export async function searchOpportunities(viewer, rawQuery, { filters = {}, sort = 'relevance', page = 1, limit = SEARCH_RULES.pageSize.default } = {}) {
  const query = normalizeQuery(rawQuery);
  const options = matchOptions(query);
  const now = new Date();
  const optionFields = { type: options.opportunityTypes, eligibleBranches: options.branches, eligibleColleges: options.colleges };
  const match = {
    $and: [
      listedFor(viewer),
      ...buildSearchFilters(SEARCH_TYPES.OPPORTUNITIES, filters, now),
      keywordClause(query, { prefixFields: ['title', 'skills', 'tags', 'organizer'], options: optionFields }),
    ],
  };
  const score = scoreExpression(
    { title: 'title', tags: ['skills', 'tags', 'organizer'], options: { ...optionFields, mode: options.opportunityModes }, keyword: usesText(query), date: 'publishedAt', featured: 'featured', closed: closedNow(now) },
    query,
    now,
  );
  const sorts = {
    relevance: [{ $sort: { _score: -1, publishedAt: -1, _id: -1 } }],
    newest: [{ $sort: { publishedAt: -1, createdAt: -1, _id: -1 } }],
    featured: [{ $sort: { featured: -1, _score: -1, publishedAt: -1, _id: -1 } }],
    // Open ones first, nearest deadline first: the same order as the Opportunities page.
    deadline: opportunitySortStages('deadline', now),
  };
  const { rows, total } = await rankPage(Opportunity, { match, score, sort: sorts[sort] ?? sorts.relevance, skip: (page - 1) * limit, limit });
  const ids = rows.map((row) => row._id);
  const opportunities = ids.length ? await Opportunity.find({ $and: [{ _id: { $in: ids } }, listedFor(viewer)] }).select('-description').lean() : [];
  const views = await presentOpportunities(opportunities, viewer, { now });
  return { query: query.text, type: SEARCH_TYPES.OPPORTUNITIES, sort, results: sanitizeSearchResults(SEARCH_TYPES.OPPORTUNITIES, inOrder(ids, views)), pagination: pagination(page, limit, total) };
}

// ----------------------------------------------------------------------------- achievements

const ACHIEVEMENT_SORTS = {
  relevance: { _score: -1, date: -1, _id: -1 },
  newest: { date: -1, _id: -1 },
};

/** Achievements the viewer may see (never someone else's private ones) by title, details, skills and type. */
export async function searchAchievements(viewer, rawQuery, { filters = {}, sort = 'relevance', page = 1, limit = SEARCH_RULES.pageSize.default } = {}) {
  const query = normalizeQuery(rawQuery);
  const options = matchOptions(query);
  const match = { $and: [showcaseVisibleTo(viewer), SEARCHABLE, ...buildSearchFilters(SEARCH_TYPES.ACHIEVEMENTS, filters), keywordClause(query, { prefixFields: ['title'], options: { type: options.achievementTypes } })] };
  const score = scoreExpression({ title: 'title', tags: ['skills', 'organization', 'eventName'], options: { type: options.achievementTypes }, keyword: usesText(query), date: 'date' }, query);
  const { rows, total } = await rankPage(Achievement, { match, score, sort: ACHIEVEMENT_SORTS[sort] ?? ACHIEVEMENT_SORTS.relevance, skip: (page - 1) * limit, limit });
  const ids = rows.map((row) => row._id);
  const achievements = ids.length ? await Achievement.find({ $and: [{ _id: { $in: ids } }, showcaseVisibleTo(viewer)] }).select('-description -verification').lean() : [];
  const views = await presentAchievements(achievements, viewer);
  return { query: query.text, type: SEARCH_TYPES.ACHIEVEMENTS, sort, results: sanitizeSearchResults(SEARCH_TYPES.ACHIEVEMENTS, inOrder(ids, views)), pagination: pagination(page, limit, total) };
}

// ----------------------------------------------------------------------------- global search

const SEARCHERS = Object.freeze({
  [SEARCH_TYPES.STUDENTS]: searchStudents,
  [SEARCH_TYPES.POSTS]: searchPosts,
  [SEARCH_TYPES.PROJECTS]: searchProjects,
  [SEARCH_TYPES.COMMUNITIES]: searchCommunities,
  [SEARCH_TYPES.OPPORTUNITIES]: searchOpportunities,
  [SEARCH_TYPES.ACHIEVEMENTS]: searchAchievements,
});

/** One category of results. `type` is one of the category ids (validated by the route). */
export function searchByType(type, viewer, rawQuery, settings) {
  const searcher = SEARCHERS[type];
  if (!searcher) throw ApiError.notFound('Unknown search type.');
  return searcher(viewer, rawQuery, settings);
}

/** A few of each kind (SEARCH_RULES.globalLimit), with totals for the "View all" links. */
export async function searchAll(viewer, rawQuery) {
  const query = normalizeQuery(rawQuery);
  const limit = SEARCH_RULES.globalLimit;
  const types = Object.keys(SEARCHERS);
  const sections = await Promise.all(types.map((type) => SEARCHERS[type](viewer, query.text, { page: 1, limit })));
  const data = { query: query.text, counts: {} };
  types.forEach((type, index) => {
    data[type] = sections[index].results;
    data.counts[type] = sections[index].pagination.total;
  });
  return data;
}

// ----------------------------------------------------------------------------- suggestions

const SUGGESTION = SEARCH_RULES.suggestions;

/** Topics from CampusX's own lists (skills, tech, interests, branches, colleges, opportunity types): no database. */
const TOPICS = Object.freeze(
  [
    ...[...new Map([...SKILL_SUGGESTIONS, ...TECH_SUGGESTIONS].map((name) => [name.toLowerCase(), name])).values()].map((label) => ({ label, query: label, kind: 'skill' })),
    ...INTERESTS.filter((interest) => interest.id !== 'other').map((interest) => ({ label: interest.name, query: interest.name, kind: 'topic' })),
    ...BRANCHES.filter((branch) => branch.id !== 'other').map((branch) => ({ label: branch.name, query: branch.shortName, kind: 'topic' })),
    ...COLLEGES.map((college) => ({ label: college.name, query: college.aliases?.[0] ?? college.name, kind: 'topic' })),
    ...OPPORTUNITY_TYPES.filter((type) => type.id !== 'other').map((type) => ({ label: type.plural, query: type.label, kind: 'topic', type: SEARCH_TYPES.OPPORTUNITIES })),
  ],
);

function topicSuggestions(query) {
  return TOPICS.map((topic) => {
    const label = topic.label.toLowerCase();
    // Topics are offered as the student types: the label must start with the query, or a label word must.
    const fits = label.startsWith(query.lower) || label.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(query.lower));
    return fits ? { ...topic, score: calculateSearchScore({ title: topic.label }, query) - topic.label.length / 100 } : null;
  })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, SUGGESTION.topics);
}

/** Small prefix queries on indexed names and titles, visible to everyone in the viewer's campus scope. */
async function entitySuggestions(viewer, query) {
  const titleWords = (path) => query.words.map((word) => ({ [path]: namePattern(word) }));
  const projectAudience = [{ visibility: { $in: ['public', 'campus'] } }, ...(viewer.college ? [{ visibility: 'college', 'audience.college': viewer.college }] : [])];
  const per = SUGGESTION.perCollection;
  const [students, projects, communities, opportunities] = await guarded(() =>
    Promise.all([
      User.find({ $and: [ACTIVE_STUDENT, ...query.words.map((word) => ({ $or: [{ firstName: namePattern(word) }, { lastName: namePattern(word) }] }))] })
        .select('firstName lastName avatarUrl college branch semester')
        .sort({ firstName: 1, lastName: 1 })
        .limit(per)
        .lean()
        .maxTimeMS(SEARCH_RULES.timeoutMs),
      Project.find({ $and: [{ $or: projectAudience }, { status: { $ne: 'archived' } }, SEARCHABLE, ...titleWords('title')] }).select('title owner').sort({ createdAt: -1 }).limit(per).lean().maxTimeMS(SEARCH_RULES.timeoutMs),
      Community.find({ $and: [{ status: 'active' }, SEARCHABLE, scopeFilter(viewer), ...titleWords('name')] }).select('name type').sort({ memberCount: -1 }).limit(per).lean().maxTimeMS(SEARCH_RULES.timeoutMs),
      Opportunity.find({ $and: [listedFor(viewer), ...titleWords('title')] }).select('title type').sort({ publishedAt: -1 }).limit(per).lean().maxTimeMS(SEARCH_RULES.timeoutMs),
    ]),
  );
  // Projects of accounts that are no longer active are left out, like everywhere else.
  const owners = new Set((await User.find({ _id: { $in: projects.map((project) => project.owner) }, status: ACCOUNT_STATUSES.ACTIVE }).select('_id').lean()).map((user) => user._id.toString()));
  const studentItems = await Promise.all(
    students.map(async (user) => {
      const summary = await toStudentSummary(user);
      return { kind: 'student', id: summary.id, label: `${summary.firstName} ${summary.lastName}`, subtitle: [summary.branch?.shortName, summary.college?.shortName].filter(Boolean).join(' · '), avatarUrl: summary.avatarUrl };
    }),
  );
  const typeLabel = (list, id) => list.find((item) => item.id === id)?.label ?? id;
  return [
    ...studentItems,
    ...projects.filter((project) => owners.has(project.owner.toString())).map((project) => ({ kind: 'project', id: project._id.toString(), label: project.title, subtitle: 'Project' })),
    ...communities.map((community) => ({ kind: 'community', id: community._id.toString(), label: community.name, subtitle: `${typeLabel(COMMUNITY_TYPES, community.type)} community` })),
    ...opportunities.map((opportunity) => ({ kind: 'opportunity', id: opportunity._id.toString(), label: opportunity.title, subtitle: typeLabel(OPPORTUNITY_TYPES, opportunity.type) })),
  ]
    .map((item) => ({ ...item, score: calculateSearchScore({ title: item.label }, query) }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Up to SEARCH_RULES.suggestions.total suggestions as the student types: matching topics ("React"), then
 * "Students with React skills" / "React projects", then students, projects, communities and opportunities
 * by name. Collection lookups are cached briefly per campus scope (college, branch, semester), and only
 * include things everyone in that scope may see, never someone's private or members-only items.
 */
export async function getSuggestions(viewer, rawQuery) {
  const query = normalizeQuery(rawQuery);
  const topics = topicSuggestions(query);
  const cacheKey = `search:suggest:v1:${viewer.college ?? '-'}:${viewer.branch ?? '-'}:${viewer.semester ?? '-'}:${query.lower}`;
  let entities = await getCache(cacheKey);
  if (!entities) {
    entities = await entitySuggestions(viewer, query);
    await setCache(cacheKey, entities, SUGGESTION.cacheSeconds);
  }

  const searchFor = (topic) => ({ kind: 'search', label: topic.label, query: topic.query, type: topic.type ?? SEARCH_TYPES.ALL });
  const [first, ...rest] = topics;
  const helpers =
    first?.kind === 'skill'
      ? [
          { kind: 'search', label: `Students with ${first.label} skills`, query: first.query, type: SEARCH_TYPES.STUDENTS },
          { kind: 'search', label: `${first.label} projects`, query: first.query, type: SEARCH_TYPES.PROJECTS },
        ]
      : [];
  const suggestions = [...(first ? [searchFor(first)] : []), ...helpers, ...entities.map(({ score, ...item }) => item), ...rest.map(searchFor)].slice(0, SUGGESTION.total);
  return { query: query.text, suggestions };
}

// ----------------------------------------------------------------------------- options

/** Tabs, sorts, rules and filter choices, from the same lists the server validates against. */
export async function getSearchOptions() {
  const campus = await getOnboardingOptions();
  const shortCollege = (college) => ({ id: college.id, name: college.name, shortName: college.aliases?.[0] ?? college.name });
  return {
    types: SEARCH_TABS,
    sorts: SEARCH_SORTS,
    rules: { query: SEARCH_RULES.query, pageSize: SEARCH_RULES.pageSize, globalLimit: SEARCH_RULES.globalLimit, maxPage: SEARCH_RULES.maxPage, filterList: SEARCH_RULES.filterList },
    filters: {
      colleges: campus.colleges.map(shortCollege),
      branches: campus.branches.map(({ id, name, shortName }) => ({ id, name, shortName })),
      semesters: campus.semesters,
      interests: campus.interests.map(({ id, name }) => ({ id, name })),
      skillSuggestions: [...new Map([...SKILL_SUGGESTIONS, ...TECH_SUGGESTIONS].map((name) => [name.toLowerCase(), name])).values()],
      postTypes: POST_TYPES.map(({ id, label }) => ({ id, label })),
      projectCategories: PROJECT_CATEGORIES,
      communityTypes: COMMUNITY_TYPES.map(({ id, label }) => ({ id, label })),
      opportunityTypes: OPPORTUNITY_TYPES.map(({ id, label, plural }) => ({ id, label, plural })),
      opportunityModes: OPPORTUNITY_MODES,
      deadlineFilters: DEADLINE_FILTERS,
      achievementTypes: ACHIEVEMENT_TYPES,
    },
  };
}

