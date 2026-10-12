import mongoose from 'mongoose';
import { CACHE_RULES, INTEREST_SIGNALS, PROFILE_RULES } from '../config/recommendationConfig.js';
import { SKILL_SUGGESTIONS } from '../data/campusOptions.js';
import { TECH_SUGGESTIONS } from '../data/showcaseOptions.js';
import Achievement from '../models/Achievement.js';
import Community from '../models/Community.js';
import CommunityMember from '../models/CommunityMember.js';
import Opportunity from '../models/Opportunity.js';
import OpportunityApplication from '../models/OpportunityApplication.js';
import Project from '../models/Project.js';
import RecommendationProfile from '../models/RecommendationProfile.js';
import SearchHistory from '../models/SearchHistory.js';
import { getCache, setCache } from './cacheService.js';
import { mentions } from './recommendationScoring.js';
import { matchOptions, normalizeQuery } from './searchQuery.js';

/*
 * The derived recommendation profile (models/RecommendationProfile.js): what CampusX has learned from a
 * student's activity. It is rebuilt from indexed, per-student data only (their own projects and
 * achievements, communities, tracked opportunities, recent searches and the like/comment/click signals
 * recorded by services/recommendationEvents.js), never by scanning other students' content.
 *
 * Nothing from the Anonymous Zone is used. Search text is never stored here: searches are only mapped to
 * CampusX's own topic lists (interests, project categories, opportunity types, known skills).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LIST = 8;
const MAX_KEYWORDS = 15;
const lower = (text) => String(text ?? '').trim().toLowerCase();
const oid = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)));

/** Topic words CampusX knows (skills, tech, interest keywords): the only words ever learned from text. */
export const TOPIC_VOCABULARY = Object.freeze([
  ...new Set([...SKILL_SUGGESTIONS, ...TECH_SUGGESTIONS].map(lower).concat(Object.values(INTEREST_SIGNALS).flatMap((signals) => signals.keywords))),
]);

const SKILL_LABELS = new Map([...SKILL_SUGGESTIONS, ...TECH_SUGGESTIONS].map((name) => [lower(name), name]));

/** How a learned (lower-case) skill is shown: CampusX's own spelling when it knows the skill ("Node.js"). */
export const skillLabel = (key) => SKILL_LABELS.get(key) ?? key;

/** Known topics a piece of text mentions (at most `max`), as "keyword:<topic>" traits. */
export function topicTraits(text, max = 5) {
  const item = { text: lower(text) };
  if (!item.text) return [];
  const found = [];
  for (const topic of TOPIC_VOCABULARY) {
    if (mentions(item, topic)) found.push(`keyword:${topic}`);
    if (found.length >= max) break;
  }
  return found;
}

// ----------------------------------------------------------------------------- cache version

/**
 * Every cached recommendation list of a student includes this version in its key: bumping it (profile
 * edited, community joined, "Not interested", ...) makes the next request rank afresh. Works the same on
 * Redis and in memory, and costs nothing if the cache is down (lists are then simply ranked each time).
 */
const versionKey = (userId) => `${CACHE_RULES.keyPrefix}:version:${userId}`;

export async function getProfileVersion(userId) {
  return (await getCache(versionKey(userId))) ?? '0';
}

export async function bumpProfileVersion(userId) {
  await setCache(versionKey(userId), `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, 24 * 60 * 60);
}

// ----------------------------------------------------------------------------- signals

/** Something important changed: rebuild the learned lists on the next read, and re-rank. */
export async function markProfileStale(userId) {
  if (!mongoose.isValidObjectId(userId)) return;
  await RecommendationProfile.updateOne({ user: oid(userId) }, { $set: { stale: true } }, { upsert: true });
  await bumpProfileVersion(String(userId));
}

/** Adds (or refreshes) one signal; the newest PROFILE_RULES.keepSignals are kept. */
export async function recordSignal(userId, { kind, ref, traits = [] }) {
  if (!mongoose.isValidObjectId(userId)) return;
  const signal = { kind, ref: String(ref), traits: [...new Set(traits)].slice(0, 12), at: new Date() };
  const recent = { $ifNull: ['$activitySignals.recent', []] };
  await RecommendationProfile.updateOne(
    { user: oid(userId) },
    [
      {
        $set: {
          'activitySignals.recent': {
            $slice: [{ $concatArrays: [{ $filter: { input: recent, cond: { $not: [{ $and: [{ $eq: ['$$this.kind', kind] }, { $eq: ['$$this.ref', signal.ref] }] }] } } }, [signal]] }, -PROFILE_RULES.keepSignals],
          },
        },
      },
    ],
    { upsert: true, updatePipeline: true },
  );
}

/** Undoes a signal (an unlike). */
export async function removeSignal(userId, { kind, ref }) {
  if (!mongoose.isValidObjectId(userId)) return;
  await RecommendationProfile.updateOne({ user: oid(userId) }, { $pull: { 'activitySignals.recent': { kind, ref: String(ref) } } });
}

// ----------------------------------------------------------------------------- rebuilding

/** Weighted tally of traits ("projectCategory:web" → 3). */
function tally() {
  const weights = new Map();
  return {
    add(trait, weight = 1) {
      if (trait && !trait.endsWith(':')) weights.set(trait, (weights.get(trait) ?? 0) + weight);
    },
    top(prefix, max = MAX_LIST) {
      return [...weights.entries()]
        .filter(([trait]) => trait.startsWith(`${prefix}:`))
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, max)
        .map(([trait]) => trait.slice(prefix.length + 1));
    },
  };
}

/** Known skills / tech among free-typed words (search words, tags): "react" yes, "fest" no. */
const KNOWN_TOPICS = new Set(TOPIC_VOCABULARY);

/**
 * Rebuilds the learned lists from the student's own activity and saves them. Every query is indexed and
 * limited to this student's data.
 */
export async function rebuildDerivedProfile(viewer, existing = null) {
  const userId = viewer._id;
  const since = new Date(Date.now() - PROFILE_RULES.windowDays * DAY_MS);
  const [projects, achievements, memberships, tracking, searches] = await Promise.all([
    Project.find({ owner: userId, moderationStatus: { $ne: 'removed' } }).select('category techStack').sort({ createdAt: -1 }).limit(PROFILE_RULES.ownItems).lean(),
    Achievement.find({ owner: userId, moderationStatus: { $ne: 'removed' } }).select('type skills').sort({ date: -1 }).limit(PROFILE_RULES.ownItems).lean(),
    CommunityMember.find({ user: userId, status: 'active' }).select('community').limit(100).lean(),
    OpportunityApplication.find({ user: userId }).select('opportunity status').sort({ updatedAt: -1 }).limit(PROFILE_RULES.trackedOpportunities).lean(),
    SearchHistory.find({ user: userId }).select('query').sort({ searchedAt: -1 }).limit(PROFILE_RULES.recentSearches).lean(),
  ]);
  const [communities, opportunities] = await Promise.all([
    memberships.length ? Community.find({ _id: { $in: memberships.map((m) => m.community) } }).select('type tags name official').lean() : [],
    tracking.length ? Opportunity.find({ _id: { $in: tracking.map((t) => t.opportunity) } }).select('type skills tags').lean() : [],
  ]);

  const traits = tally();
  for (const project of projects) {
    traits.add(`projectCategory:${project.category}`, 2);
    // Tech a student has built with counts as a skill of theirs.
    for (const tech of project.techStack ?? []) traits.add(`skill:${lower(tech)}`);
  }
  for (const achievement of achievements) {
    traits.add(`achievementType:${achievement.type}`, 2);
    for (const skill of achievement.skills ?? []) traits.add(`skill:${lower(skill)}`);
  }
  const knownInterests = new Set(Object.keys(INTEREST_SIGNALS));
  for (const community of communities) {
    traits.add(`communityType:${community.type}`, 2);
    for (const tag of community.tags ?? []) if (KNOWN_TOPICS.has(lower(tag))) traits.add(`keyword:${lower(tag)}`);
    const [interest] = community.type === 'interest' ? matchOptions(normalizeQuery(community.name)).interests ?? [] : [];
    if (knownInterests.has(interest)) traits.add(`interest:${interest}`, 2);
  }
  const byOpportunity = new Map(opportunities.map((item) => [item._id.toString(), item]));
  for (const record of tracking) {
    const opportunity = byOpportunity.get(record.opportunity.toString());
    if (!opportunity) continue;
    // Applying says more than saving.
    traits.add(`opportunityType:${opportunity.type}`, record.status === 'saved' ? 2 : 3);
    for (const word of [...(opportunity.skills ?? []), ...(opportunity.tags ?? [])]) if (KNOWN_TOPICS.has(lower(word))) traits.add(`keyword:${lower(word)}`);
  }
  for (const search of searches) {
    const query = normalizeQuery(search.query);
    const options = matchOptions(query);
    for (const id of options.interests ?? []) traits.add(`interest:${id}`);
    for (const id of options.projectCategories ?? []) traits.add(`projectCategory:${id}`);
    for (const id of options.opportunityTypes ?? []) traits.add(`opportunityType:${id}`);
    for (const id of options.achievementTypes ?? []) traits.add(`achievementType:${id}`);
    for (const id of options.postTypes ?? []) traits.add(`postType:${id}`);
    for (const word of query.words) if (KNOWN_TOPICS.has(word)) traits.add(`keyword:${word}`);
  }

  const profile = existing ?? (await RecommendationProfile.findOne({ user: userId }).lean());
  const signals = (profile?.activitySignals?.recent ?? []).filter((signal) => new Date(signal.at) >= since);
  const signalWeight = { 'post-comment': 2 };
  for (const signal of signals) for (const trait of signal.traits ?? []) traits.add(trait, signalWeight[signal.kind] ?? 1);

  const countOf = (kind) => signals.filter((signal) => signal.kind === kind).length;
  const update = {
    interests: traits.top('interest'),
    skills: traits.top('skill', MAX_KEYWORDS),
    keywords: traits.top('keyword', MAX_KEYWORDS),
    preferredCategories: traits.top('postType'),
    preferredOpportunityTypes: traits.top('opportunityType'),
    preferredCommunityTypes: traits.top('communityType'),
    preferredProjectCategories: traits.top('projectCategory'),
    preferredAchievementTypes: traits.top('achievementType'),
    'activitySignals.counts': {
      postLikes: countOf('post-like'),
      postComments: countOf('post-comment'),
      projectLikes: countOf('project-like'),
      recommendationClicks: countOf('recommendation-click'),
      communitiesJoined: memberships.length,
      opportunitiesTracked: tracking.length,
      ownProjects: projects.length,
      ownAchievements: achievements.length,
      searches: searches.length,
    },
    stale: false,
    lastUpdatedAt: new Date(),
  };
  return RecommendationProfile.findOneAndUpdate({ user: userId }, { $set: update }, { upsert: true, returnDocument: 'after', lean: true });
}

/** The student's derived profile, rebuilt first when it is missing, marked stale or getting old. */
export async function loadDerivedProfile(viewer) {
  const profile = await RecommendationProfile.findOne({ user: viewer._id }).lean();
  const old = !profile?.lastUpdatedAt || Date.now() - new Date(profile.lastUpdatedAt).getTime() > PROFILE_RULES.staleAfterMinutes * 60 * 1000;
  if (!profile || profile.stale || old) return rebuildDerivedProfile(viewer, profile);
  return profile;
}
