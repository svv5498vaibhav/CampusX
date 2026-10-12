import {
  ACTIVITY_NOUNS,
  DEADLINE_RULES,
  DIVERSITY_RULES,
  FRESHNESS_RULES,
  MATCH_RULES,
  REASONS,
  RECOMMENDATION_TYPES,
  REASON_ORDER,
  RECOMMENDATION_WEIGHTS,
  RESULT_RULES,
} from '../config/recommendationConfig.js';

/*
 * The one recommendation scorer (Phase 14). Candidates arrive as plain "features" (built in
 * services/recommendationCandidates.js from the database) and the student as a context (built by
 * buildStudentProfile in services/recommendationService.js). Everything here is pure and deterministic:
 * no database, no clock other than the `now` passed in, no randomness.
 *
 * Feature shape (every field optional except id/type):
 *   id, type ('projects', ...), anonymous
 *   category, categoryKind ('postType' | 'projectCategory' | 'opportunityType' | 'communityType' | 'achievementType')
 *   keywords   Set of lower-case exact terms (skills, tech stack, tags)
 *   text       lower-case title / description / post text, matched by whole words
 *   interestIds Set of interest ids the item stands for (a student's interests, an official interest community)
 *   interestByIdOnly  match interests by id only (students: "Also into …")
 *   college, branch, semester  (or colleges/branches/semesters lists for opportunity eligibility rules)
 *   communityId, officialFor ('college' | 'branch'), date, deadline, engagement, quality, diversity {key: value}
 *
 * Score = profile fit (interests, skills, campus, activity, communities, opportunity type)
 *       + popularity + freshness + deadline + quality − penalties ("Not interested" in similar things,
 *         ignored many times). Only reasons ever leave the server, never these numbers.
 */

const W = RECOMMENDATION_WEIGHTS;
const DAY_MS = 24 * 60 * 60 * 1000;

const fraction = (count, forFull) => Math.min(count, forFull) / forFull;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const listText = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

// Whole-word matching inside text ("react" in "React Native app", never inside "reactor").
const wordPatterns = new Map();
function wordPattern(term) {
  let pattern = wordPatterns.get(term);
  if (!pattern) {
    pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegex(term)}(?![\\p{L}\\p{N}])`, 'u');
    if (wordPatterns.size > 5000) wordPatterns.clear();
    wordPatterns.set(term, pattern);
  }
  return pattern;
}

/** True when the item names `term` exactly (skills, tags, tech) or as a whole word in its text. */
export function mentions(item, term) {
  if (!term) return false;
  if (item.keywords?.has(term)) return true;
  if (!item.text || term.length < MATCH_RULES.minKeywordLength || MATCH_RULES.ambiguousWords.includes(term)) return false;
  return wordPattern(term).test(item.text);
}

/** The trait strings an item carries ("projectCategory:web", "keyword:react"), for learning and feedback. */
export function traitsOf(item) {
  const traits = new Set();
  if (item.category && item.categoryKind) traits.add(`${item.categoryKind}:${item.category}`);
  for (const keyword of item.keywords ?? []) traits.add(`keyword:${keyword}`);
  for (const id of item.interestIds ?? []) traits.add(`interest:${id}`);
  return traits;
}

/** How a "Not interested" trait is remembered: per recommendation type. */
export const penaltyKey = (type, trait) => `${type}|${trait}`;

// ----------------------------------------------------------------------------- freshness

/**
 * How fresh an item is, from 0 to 1: it halves every `halfLifeDays` (per type). Items without a date,
 * and types where age doesn't matter (students), count as neither fresh nor stale.
 */
export function applyFreshness(item, now = new Date()) {
  const halfLife = FRESHNESS_RULES.halfLifeDays[item.type];
  if (!halfLife || !item.date) return 0;
  const ageDays = Math.max(0, (now.getTime() - new Date(item.date).getTime()) / DAY_MS);
  return 0.5 ** (ageDays / halfLife);
}

/** Days until an opportunity's deadline (rounded up), or null without one. */
export function daysLeft(item, now = new Date()) {
  if (!item.deadline) return null;
  return Math.max(0, Math.ceil((new Date(item.deadline).getTime() - now.getTime()) / DAY_MS));
}

// ----------------------------------------------------------------------------- scoring

function interestMatches(item, context) {
  return context.interests.filter((interest) => {
    if (item.interestIds?.has(interest.id)) return true;
    if (item.interestByIdOnly) return false;
    if (item.categoryKind === 'projectCategory' && interest.projectCategories.includes(item.category)) return true;
    if (item.categoryKind === 'opportunityType' && interest.opportunityTypes.includes(item.category)) return true;
    if (item.categoryKind === 'achievementType' && interest.achievementTypes.includes(item.category)) return true;
    if (item.categoryKind === 'postType' && interest.postTypes.includes(item.category)) return true;
    return interest.keywords.some((keyword) => mentions(item, keyword));
  });
}

const inList = (list, value) => Boolean(value) && Array.isArray(list) && list.includes(value);

/** Campus fit. Opportunities carry eligibility lists: being named in one is a match ("for your college"). */
function campusMatches(item, context) {
  const college = Boolean(context.college) && (item.college === context.college || inList(item.colleges, context.college));
  const branch =
    Boolean(context.branch) &&
    (inList(item.branches, context.branch) || (item.branch === context.branch && (!item.college || item.college === context.college)));
  const semester =
    Boolean(context.semester) &&
    (inList(item.semesters, context.semester) || (item.semester === context.semester && branch && (!item.college || college)));
  return { college, branch, semester };
}

/** What the student has been doing lately that this item resembles (learned categories and keywords). */
function activityMatches(item, context) {
  const matched = [];
  if (item.category && context.learned.has(`${item.categoryKind}:${item.category}`)) matched.push(`${item.categoryKind}:${item.category}`);
  for (const keyword of context.learnedKeywords) {
    if (mentions(item, keyword)) matched.push(`keyword:${keyword}`);
    if (matched.length >= MATCH_RULES.learnedForFull) break;
  }
  return matched;
}

/**
 * Scores one candidate for one student. Returns { score, profileScore, reasons } where profileScore is
 * the personal-fit part (used to tell "for you" items from exploration and fallback items).
 */
export function calculateRecommendationScore(item, context, now = new Date()) {
  const parts = [];
  const add = (value, reason, kind) => {
    if (value > 0) parts.push({ value, reason, order: REASON_ORDER.indexOf(kind) });
    return value;
  };
  let profile = 0;

  // Interests: the student's own count fully, interests learned from activity count half.
  const interests = interestMatches(item, context);
  const interestWeight = interests.reduce((sum, interest) => sum + (interest.learned ? 0.5 : 1), 0);
  if (interests.length) {
    const names = interests.slice(0, 2).map((interest) => interest.name);
    const reason = item.type === RECOMMENDATION_TYPES.STUDENTS ? REASONS.sharedInterests(listText(names)) : REASONS.interest(listText(names));
    profile += add(W.INTEREST_MATCH * fraction(interestWeight, MATCH_RULES.interestsForFull), reason, 'interest');
  }

  // Skills (and tech the student has used in their own projects and achievements).
  const skills = context.skills.filter((skill) => (item.interestByIdOnly ? item.keywords?.has(skill.key) : mentions(item, skill.key)));
  if (skills.length) {
    const names = listText(skills.slice(0, 2).map((skill) => skill.label));
    profile += add(W.SKILL_MATCH * fraction(skills.length, MATCH_RULES.skillsForFull), item.type === RECOMMENDATION_TYPES.STUDENTS ? REASONS.sharedSkills(names) : REASONS.skills(names), 'skills');
  }

  // Campus: ranking signals only.
  const campus = campusMatches(item, context);
  if (item.officialFor === 'college' && campus.college) {
    profile += add(W.COMMUNITY_RELEVANCE + W.COLLEGE_MATCH, REASONS.campusCommunity, 'campusCommunity');
  } else if (campus.college) {
    profile += add(W.COLLEGE_MATCH, item.type === RECOMMENDATION_TYPES.OPPORTUNITIES ? REASONS.collegeOpportunity : REASONS.college, 'college');
  }
  if (campus.branch) {
    const branchName = context.branchShort ?? 'your branch';
    const popular = item.engagement > 0 && (item.type === RECOMMENDATION_TYPES.POSTS || item.type === RECOMMENDATION_TYPES.PROJECTS);
    if (item.officialFor === 'branch') {
      profile += add(W.BRANCH_MATCH + W.COMMUNITY_RELEVANCE, REASONS.branchCommunity, 'campusCommunity');
    } else if (item.type === RECOMMENDATION_TYPES.STUDENTS) {
      // Same branch and semester says it better ("In your branch and semester").
      profile += add(W.BRANCH_MATCH, campus.semester ? null : REASONS.sameBranch(branchName), 'branch');
    } else {
      profile += add(W.BRANCH_MATCH, popular ? REASONS.branchPopular(branchName) : REASONS.branch(branchName), 'branch');
    }
  }
  if (campus.semester) {
    profile += add(W.SEMESTER_MATCH, item.type === RECOMMENDATION_TYPES.STUDENTS ? REASONS.sameClass : REASONS.semester, 'semester');
  }

  // A post from one of the student's communities.
  const community = item.communityId ? context.memberships.get(item.communityId) : null;
  if (community) profile += add(W.COMMUNITY_RELEVANCE, REASONS.community(community.name), 'community');

  // An opportunity type that fits the student's interests or the opportunities they track.
  if (item.type === RECOMMENDATION_TYPES.OPPORTUNITIES) {
    const byInterest = context.interests.some((interest) => interest.opportunityTypes.includes(item.category));
    const byHistory = context.learned.has(`opportunityType:${item.category}`);
    if (byInterest || byHistory) profile += add(W.OPPORTUNITY_RELEVANCE, byHistory && !byInterest ? REASONS.activity(ACTIVITY_NOUNS.opportunities) : null, 'activity');
  }

  // Like what the student liked, joined, saved, searched or opened lately.
  const activity = activityMatches(item, context);
  if (activity.length) profile += add(W.RECENT_ACTIVITY * fraction(activity.length, MATCH_RULES.learnedForFull), REASONS.activity(ACTIVITY_NOUNS[item.type] ?? 'things'), 'activity');

  // Not personal: popularity (log-scaled), freshness, deadlines, quality.
  const engagement = Math.max(0, item.engagement ?? 0);
  const popularity = engagement > 0 ? W.POPULARITY * Math.min(1, Math.log1p(engagement) / Math.log1p(MATCH_RULES.popularityForFull)) : 0;
  const freshness = W.FRESHNESS * applyFreshness(item, now);
  const days = daysLeft(item, now);
  const deadline = days !== null && days <= DEADLINE_RULES.soonDays ? W.DEADLINE_SOON * (1 - days / (DEADLINE_RULES.soonDays + 1)) : 0;
  const quality = item.quality ? W.QUALITY : 0;
  if (days !== null && days <= 7) add(deadline, REASONS.deadline(days), 'deadline');
  if (item.quality && item.type === RECOMMENDATION_TYPES.ACHIEVEMENTS) add(quality, REASONS.verified, 'verified');

  // Penalties: "Not interested" in something similar of the same kind lately (a dismissed AI community
  // lowers AI communities, not AI projects); shown many times and never opened.
  let penalty = 0;
  if (context.penalties.size && [...traitsOf(item)].some((trait) => context.penalties.has(penaltyKey(item.type, trait)))) penalty += W.NOT_INTERESTED_PENALTY;
  if (context.ignored.has(`${item.targetType}:${item.id}`)) penalty += W.IGNORED_PENALTY;

  const score = profile + popularity + freshness + deadline + quality - penalty;
  return { score, profileScore: profile, reasons: reasonsFor(parts, item, context, { engagement, now }) };
}

/** The strongest reasons first; plain fallbacks for items picked for being new or popular. */
function reasonsFor(parts, item, context, { engagement, now }) {
  const reasons = [...new Set(parts.filter((part) => part.reason).sort((a, b) => b.value - a.value || a.order - b.order).map((part) => part.reason))];
  if (reasons.length === 0) {
    const ageDays = item.date ? (now.getTime() - new Date(item.date).getTime()) / DAY_MS : Number.POSITIVE_INFINITY;
    if (ageDays <= FRESHNESS_RULES.newForDays && item.type !== RECOMMENDATION_TYPES.STUDENTS) reasons.push(REASONS.fresh);
    else if (engagement > 0 && (!item.college || item.college === context.college)) reasons.push(REASONS.popular);
    else reasons.push(REASONS.explore);
  }
  return reasons.slice(0, RESULT_RULES.maxReasons);
}

/** Scores every candidate; best first (ties: newer first, then id, so the order never wobbles). */
export function rankCandidates(items, context, now = new Date()) {
  return items
    .map((item) => ({ ...item, ...calculateRecommendationScore(item, context, now) }))
    .sort((a, b) => b.score - a.score || new Date(b.date ?? 0) - new Date(a.date ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ----------------------------------------------------------------------------- diversity

/**
 * Picks `limit` items from a ranked list so it isn't twenty versions of the same thing: each item that
 * shares a key (category, author, organizer, ...) with ones already picked keeps DIVERSITY_RULES.decay
 * of its score per repeat, no key appears more than its cap, and every `exploreEvery`-th slot goes to the
 * best item outside the student's profile (new or popular campus content), when there is one.
 */
export function applyDiversity(ranked, { type, limit = RESULT_RULES.ranked, explore = true } = {}) {
  const keys = DIVERSITY_RULES.keys[type] ?? [];
  const counts = new Map();
  const remaining = [...ranked];
  const picked = [];
  const keyOf = (item, key) => (item.diversity?.[key] ? `${key}:${item.diversity[key]}` : null);
  const repeats = (item) => keys.reduce((sum, key) => sum + (counts.get(keyOf(item, key)) ?? 0), 0);
  const capped = (item) => keys.some((key) => (counts.get(keyOf(item, key)) ?? 0) >= (DIVERSITY_RULES.maxPerKey[key] ?? Number.POSITIVE_INFINITY));

  while (picked.length < limit && remaining.length) {
    const slot = picked.length + 1;
    const exploring = explore && DIVERSITY_RULES.exploreEvery > 0 && slot % DIVERSITY_RULES.exploreEvery === 0;
    let pool = remaining.filter((item) => !capped(item));
    if (pool.length === 0) pool = remaining;
    if (exploring) {
      const outside = pool.filter((item) => item.profileScore < MATCH_RULES.minProfileScore);
      if (outside.length) pool = outside;
    }
    let best = null;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (const item of pool) {
      const value = item.score * DIVERSITY_RULES.decay ** repeats(item);
      if (value > bestValue) {
        best = item;
        bestValue = value;
      }
    }
    picked.push(best);
    remaining.splice(remaining.indexOf(best), 1);
    for (const key of keys) {
      const name = keyOf(best, key);
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return picked;
}

/**
 * "For you": one mixed list from several ranked lists, best personal fit first, at most
 * DIVERSITY_RULES.mixPerType of one type, so it reads like a tour of CampusX rather than one feed.
 */
export function mixRecommendations(listsByType, limit) {
  const all = Object.entries(listsByType)
    .flatMap(([type, entries]) => entries.map((entry, rank) => ({ ...entry, type, rank })))
    .sort((a, b) => b.profileScore - a.profileScore || b.score - a.score || a.rank - b.rank);
  const perType = new Map();
  const picked = [];
  for (const entry of all) {
    if (picked.length >= limit) break;
    if ((perType.get(entry.type) ?? 0) >= DIVERSITY_RULES.mixPerType) continue;
    perType.set(entry.type, (perType.get(entry.type) ?? 0) + 1);
    picked.push(entry);
  }
  return picked;
}
