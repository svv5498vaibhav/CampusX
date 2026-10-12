import mongoose from 'mongoose';
import env from '../config/env.js';
import {
  ABUSE_RULES,
  ACCOUNT_RULES,
  ACTION_FOR_RISK,
  COMMENT_RULES,
  ENFORCEMENT,
  LINK_RULES,
  MODERATION_ACTIONS as A,
  OPPORTUNITY_RULES,
  OWNER_ONLY_STATUSES,
  PRIORITIES,
  PROMOTION_RULES,
  PUBLIC_STATUSES,
  RISK_LEVEL_IDS,
  RISK_THRESHOLDS,
  SPAM_RULES,
  STATUS_FOR_ACTION,
  STATUS_SEVERITY,
} from '../config/moderationConfig.js';
import { BEHAVIOR_LIMITS, ENGAGEMENT_LIMITS } from '../config/moderationLimits.js';
import Achievement from '../models/Achievement.js';
import AnonymousComment from '../models/AnonymousComment.js';
import AnonymousPost from '../models/AnonymousPost.js';
import Comment from '../models/Comment.js';
import Community from '../models/Community.js';
import ModerationAuditLog from '../models/ModerationAuditLog.js';
import ModerationCase from '../models/ModerationCase.js';
import Opportunity from '../models/Opportunity.js';
import Post from '../models/Post.js';
import Project from '../models/Project.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import { SharedCounterStore } from '../utils/sharedCounterStore.js';
import { getCache, setCache } from './cacheService.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';
import { calculateTextSimilarity, detectDuplicateContent, detectSpam as detectSpamText } from './spamDetectionService.js';

/*
 * Trust & Safety: the one place moderation decisions are made. Content services call an analyzer before
 * saving (and save the content with the status it returns), then recordOutcome() after saving. Reports
 * (services/reportService.js) and the staff case API (services/moderationCaseService.js) use
 * applyModerationAction(). Rules and thresholds live in config/moderationConfig.js and
 * config/moderationLimits.js only.
 *
 * Every analysis returns the same shape:
 *   { score: 0-100, riskLevel: low|medium|high|critical, flags, reasons, recommendedAction, status }
 * and the pipeline is: low → publish · medium → publish + flag · high → hold (restricted) ·
 * critical → restrict + escalate. Rule-based only; a single weak signal never removes content.
 *
 * Privacy: scores, flags, reasons, cases and audit logs are internal. Anonymous authors are only ever
 * used internally (duplicate checks, enforcement, notifying the author themself); events about anonymous
 * content carry no user id.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const oid = (id) => (id instanceof mongoose.Types.ObjectId ? id : mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null);
const since = (minutes) => new Date(Date.now() - minutes * MINUTE);
const unique = (items) => [...new Set(items.filter(Boolean))];
const capList = (items, max = 20, length = 200) => unique(items).slice(0, max).map((item) => String(item).slice(0, length));

// ----------------------------------------------------------------------------- what can be moderated

/**
 * Every kind of content Trust & Safety knows. `owner` is the field holding the student it belongs to
 * (anonymous authors are hidden fields, selected only here); `parent` keeps comment counts in step with
 * what other students can see; `statusless` kinds (opportunities, students) have no moderation status.
 */
export const TARGETS = Object.freeze({
  post: { model: Post, owner: 'author', label: 'post' },
  comment: { model: Comment, owner: 'author', label: 'comment', parent: { model: Post, field: 'post' } },
  anonymousPost: { model: AnonymousPost, owner: 'author', label: 'anonymous post', anonymous: true },
  anonymousComment: { model: AnonymousComment, owner: 'author', label: 'anonymous comment', anonymous: true, parent: { model: AnonymousPost, field: 'post' } },
  project: { model: Project, owner: 'owner', label: 'project' },
  achievement: { model: Achievement, owner: 'owner', label: 'achievement' },
  community: { model: Community, owner: 'createdBy', label: 'community' },
  opportunity: { model: Opportunity, owner: 'createdBy', label: 'opportunity', statusless: true },
  user: { model: User, owner: '_id', label: 'student', statusless: true },
});

/** The student a piece of content belongs to (the anonymous author too, internally), or null. */
export async function ownerOf(targetType, targetId) {
  const spec = TARGETS[targetType];
  const id = oid(targetId);
  if (!spec || !id) return null;
  if (targetType === 'user') return id;
  const doc = await spec.model.findById(id).select(`+${spec.owner}`).lean();
  return doc?.[spec.owner] ?? null;
}

// ----------------------------------------------------------------------------- activity counters

const counterStores = new Map();

/** Counts on Redis (shared by API instances) or, without it, in memory: the rate limiters' store. */
async function bump(kind, key, windowMinutes) {
  if (!counterStores.has(kind)) {
    const store = new SharedCounterStore(`moderation-${kind}`);
    store.init({ windowMs: windowMinutes * MINUTE });
    counterStores.set(kind, store);
  }
  try {
    const { totalHits } = await counterStores.get(kind).increment(String(key));
    return totalHits;
  } catch (error) {
    logger.warn(`Moderation: activity counter failed (${error?.message ?? error})`);
    return 0;
  }
}

/**
 * Counts one more `kind` action (post, comment, like, report, ...) for the student and says whether
 * they are over the behaviour limit (config/moderationLimits.js). Going over is a signal, not a block.
 */
export async function detectSuspiciousActivity(kind, userId) {
  const limit = BEHAVIOR_LIMITS[kind];
  if (!limit || !userId) return null;
  const count = await bump(kind, userId, limit.windowMinutes);
  const exceeded = count > limit.max;
  return { kind, count, max: limit.max, exceeded, flag: limit.flag, points: exceeded ? (limit.points ?? 0) : 0 };
}

// ----------------------------------------------------------------------------- content signals

const LINK_PATTERN = /\b(?:(?:https?|ftp|javascript|data|vbscript|file):[^\s<>"'`]+|www\.[^\s<>"'`]+)/gi;
const IP_HOST = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Unsafe or deceptive links. Conservative: ordinary links score nothing. */
export function detectMaliciousLinks(text = '') {
  const R = LINK_RULES;
  const links = String(text).match(LINK_PATTERN) ?? [];
  const flags = new Set();
  const reasons = [];
  let points = 0;
  for (const link of links) {
    const lower = link.toLowerCase();
    if (R.dangerousSchemes.some((scheme) => lower.startsWith(scheme))) {
      points += R.dangerousPoints;
      flags.add('dangerous_link');
      reasons.push(`Link with an unsafe scheme (${lower.split(':')[0]}:)`);
      continue;
    }
    let url;
    try {
      url = new URL(lower.startsWith('www.') ? `https://${link}` : link);
    } catch {
      points += R.malformedPoints;
      flags.add('malformed_link');
      reasons.push('Malformed link');
      continue;
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      points += R.malformedPoints;
      flags.add('unusual_link');
      reasons.push(`Unusual link type (${url.protocol})`);
    }
    if (url.username || url.password) {
      points += R.credentialsPoints;
      flags.add('deceptive_link');
      reasons.push('Link hides its real address behind a username');
    }
    const host = url.hostname.replace(/^www\./, '');
    if (IP_HOST.test(host) || host.startsWith('[')) {
      points += R.ipHostPoints;
      flags.add('ip_address_link');
      reasons.push('Link to a bare IP address');
    }
    if (host.split('.').some((part) => part.startsWith('xn--'))) {
      points += R.punycodePoints;
      flags.add('lookalike_domain');
      reasons.push('Link to a look-alike (punycode) domain');
    }
    if (R.shorteners.includes(host)) {
      points += R.shortenerPoints;
      flags.add('shortened_link');
      reasons.push(`Shortened link (${host})`);
    }
  }
  if (links.length >= R.tooManyLinks.count) {
    points += R.tooManyLinks.points;
    flags.add('too_many_links');
    reasons.push(`${links.length} links in one post`);
  } else if (links.length >= R.manyLinks.count) {
    points += R.manyLinks.points;
    flags.add('many_links');
    reasons.push(`${links.length} links in one post`);
  }
  return { points: Math.min(points, R.maxPoints), flags: [...flags], reasons, severe: flags.has('dangerous_link'), linkCount: links.length };
}

const THREATS = ABUSE_RULES.threats.map((source) => new RegExp(source, 'i'));
const HARASSMENT = ABUSE_RULES.harassment.map((source) => new RegExp(source, 'i'));
const ABUSIVE = new RegExp(`\\b(${ABUSE_RULES.abusiveWords.join('|')})\\b`, 'gi');

/** Threats, harassment and abusive words (simple phrase rules). A threat is always escalated. */
export function detectAbuse(text = '') {
  const flags = [];
  const reasons = [];
  let points = 0;
  let severe = false;
  if (THREATS.some((pattern) => pattern.test(text))) {
    points += ABUSE_RULES.threatPoints;
    severe = true;
    flags.push('threat');
    reasons.push('Possible threat of violence or self-harm encouragement');
  }
  const harassment = HARASSMENT.filter((pattern) => pattern.test(text)).length;
  if (harassment) {
    points += harassment * ABUSE_RULES.harassmentPoints;
    flags.push('harassment');
    reasons.push('Possible harassment');
  }
  const words = unique((String(text).match(ABUSIVE) ?? []).map((word) => word.toLowerCase()));
  if (words.length) {
    points += Math.min(words.length * ABUSE_RULES.abusivePoints, ABUSE_RULES.abusiveMax);
    flags.push('abusive_language');
    reasons.push(`Abusive language (${words.length} ${words.length === 1 ? 'word' : 'words'})`);
  }
  return { points, flags, reasons, severe };
}

/** Self-promotion phrases: small points that only matter together with other signals. */
export function detectPromotion(text = '') {
  const lower = String(text).toLowerCase();
  const found = PROMOTION_RULES.phrases.filter((phrase) => lower.includes(phrase));
  if (!found.length) return { points: 0, flags: [], reasons: [] };
  return { points: Math.min(found.length * PROMOTION_RULES.points, PROMOTION_RULES.max), flags: ['promotional'], reasons: [`Promotional phrases (${found.join(', ')})`] };
}

// ----------------------------------------------------------------------------- scoring

/** 0-100 score → low · medium · high · critical (config/moderationConfig.js RISK_THRESHOLDS). */
export function riskLevelFor(score) {
  if (score >= RISK_THRESHOLDS.critical) return 'critical';
  if (score >= RISK_THRESHOLDS.high) return 'high';
  if (score >= RISK_THRESHOLDS.medium) return 'medium';
  return 'low';
}

const higherLevel = (a, b) => (RISK_LEVEL_IDS.indexOf(a) >= RISK_LEVEL_IDS.indexOf(b) ? a : b);
const higherPriority = (a, b) => (PRIORITIES.indexOf(a ?? 'low') >= PRIORITIES.indexOf(b ?? 'low') ? a : b);
/** Automated changes only move content up the status ladder (approved → flagged → restricted), never down. */
export const stricterStatus = (current, next) => ((STATUS_SEVERITY[current] ?? 0) >= (STATUS_SEVERITY[next] ?? 0) ? current : next);

/**
 * Adds up signals ({ points, flags, reasons, severe?, behavioral? }) into the moderation result. A
 * severe signal (a threat, an unsafe link) reaches at least "high" and is escalated; when only behaviour
 * (not the content) looks off, a medium result limits instead of flags.
 */
export function calculateRiskScore(signals) {
  const active = signals.filter((signal) => signal && signal.points > 0);
  const score = Math.min(SPAM_RULES.maxScore, Math.round(active.reduce((sum, signal) => sum + signal.points, 0)));
  const severe = active.some((signal) => signal.severe);
  const riskLevel = severe ? higherLevel(riskLevelFor(score), 'high') : riskLevelFor(score);
  let recommendedAction = ACTION_FOR_RISK[riskLevel];
  if (severe) recommendedAction = A.ESCALATE;
  else if (riskLevel === 'medium' && active.every((signal) => signal.behavioral)) recommendedAction = A.LIMIT;
  return {
    score,
    riskLevel,
    flags: unique(active.flatMap((signal) => signal.flags ?? [])),
    reasons: unique(active.flatMap((signal) => signal.reasons ?? [])),
    recommendedAction,
    status: STATUS_FOR_ACTION[recommendedAction] ?? 'approved',
  };
}

/** The original SpamDetector rules (services/spamDetectionService.js) as a signal. */
export function detectSpam(text, recentItems = []) {
  const result = detectSpamText(text, recentItems);
  return { points: result.spamScore, flags: result.flags, reasons: result.reasons, isSpam: result.isSpam };
}

export { detectDuplicateContent };

// ----------------------------------------------------------------------------- the author's context

const DEFAULT_TRUST = Object.freeze({ riskScore: 0, riskLevel: 'low', warningCount: 0, violationCount: 0, violationDates: [], lastModerationAt: null, restrictedUntil: null, reportsFiled: 0, reportsDismissed: 0, flags: [] });

/** The student's internal trust profile (defaults for accounts that have none yet). */
export async function loadTrust(userId) {
  const user = userId ? await User.findById(userId).select('+moderation createdAt').lean() : null;
  return { trust: { ...DEFAULT_TRUST, ...(user?.moderation ?? {}) }, createdAt: user?.createdAt ?? null, exists: Boolean(user) };
}

const recentViolations = (trust, now = Date.now()) =>
  (trust.violationDates ?? []).filter((date) => new Date(date).getTime() >= now - ENFORCEMENT.windowDays * 24 * HOUR).length;

/** Repeat offenders, high-risk accounts and brand-new accounts acting fast get a little extra attention. */
function accountSignal({ trust, createdAt }, behavior) {
  let points = 0;
  const flags = [];
  const reasons = [];
  if (recentViolations(trust) >= ACCOUNT_RULES.repeatOffender.recentViolations) {
    points += ACCOUNT_RULES.repeatOffender.points;
    flags.push('repeat_offender');
    reasons.push('Recent guideline violations');
  }
  if (['high', 'critical'].includes(trust.riskLevel)) {
    points += ACCOUNT_RULES.highRiskUserPoints;
    flags.push('high_risk_account');
    reasons.push('Account with a high risk level');
  }
  if (behavior?.exceeded && createdAt && Date.now() - new Date(createdAt).getTime() < ACCOUNT_RULES.newAccount.hours * HOUR) {
    points += ACCOUNT_RULES.newAccount.points;
    flags.push('new_account');
    reasons.push('Brand-new account acting fast');
  }
  return { points, flags, reasons, behavioral: true };
}

const behaviorSignal = (behavior) =>
  behavior?.exceeded ? { points: behavior.points, flags: [behavior.flag], reasons: [`${behavior.count} in a short time (limit ${behavior.max})`], behavioral: true } : null;

/**
 * The common analysis: the original spam rules, links, abuse, promotion, behaviour and account signals.
 *   kind         behaviour counter to use (BEHAVIOR_LIMITS), or null for edits (nothing new is counted)
 *   recentItems  the author's recent items for duplicate checks ([{ title, content }], newest first)
 *   extra        more signals (comment repeats, fake prizes)
 */
export async function analyzeContent({ userId, kind = null, title = '', content = '', otherText = '', recentItems = [], compareContent, extra = [] }) {
  const text = [title, content, otherText].filter(Boolean).join('\n');
  const [behavior, account] = await Promise.all([kind ? detectSuspiciousActivity(kind, userId) : null, loadTrust(userId)]);
  const signals = [
    detectSpam({ title, content, compareContent }, recentItems),
    detectMaliciousLinks(text),
    detectAbuse(text),
    detectPromotion(text),
    behaviorSignal(behavior),
    ...extra,
  ];
  // Account signals only add weight to something already suspicious.
  if (signals.some((signal) => signal?.points > 0)) signals.push(accountSignal(account, behavior));
  return calculateRiskScore(signals);
}

const recent = (Model, filter, select, limit) => Model.find({ ...filter, createdAt: { $gte: since(SPAM_RULES.duplicate.windowMinutes) } }).sort({ createdAt: -1 }).limit(limit).select(select).lean();
const excluding = (excludeId) => (excludeId ? { _id: { $ne: oid(excludeId) } } : {});

/** A campus or community post. `isNew` counts it towards the posting-speed limit. */
export async function analyzePost(viewer, { content = '' }, { excludeId, isNew = true } = {}) {
  const recentItems = await recent(Post, { author: viewer._id, ...excluding(excludeId) }, 'content', SPAM_RULES.duplicate.compareWith);
  return analyzeContent({ userId: viewer._id, kind: isNew ? 'post' : null, content, recentItems });
}

/** Copy-paste and very short repeated comments from the same student. */
function commentRepeatSignal(content, recentComments) {
  const R = COMMENT_RULES;
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const normalized = content.trim().toLowerCase();
  if (words <= R.shortRepeat.maxWords) {
    const repeats = recentComments.filter((comment) => (comment.content ?? '').trim().toLowerCase() === normalized).length;
    return repeats + 1 >= R.shortRepeat.repeats ? { points: R.shortRepeat.points, flags: ['repetitive_short_comments'], reasons: [`The same short comment ${repeats + 1} times`] } : null;
  }
  if (words < R.copyPaste.minWords) return null;
  const repeats = recentComments.filter((comment) => calculateTextSimilarity(comment.content ?? '', content) >= R.copyPaste.similarity).length;
  if (repeats >= R.copyPaste.manyRepeats) return { points: R.copyPaste.manyPoints, flags: ['copy_paste_comments'], reasons: [`The same comment ${repeats + 1} times`] };
  if (repeats >= R.copyPaste.repeats) return { points: R.copyPaste.points, flags: ['copy_paste_comments'], reasons: [`The same comment ${repeats + 1} times`] };
  return null;
}

/** A comment on a campus post (comments use their own repeat rules, not the post duplicate rule). */
export async function analyzeComment(viewer, { content = '' }, { excludeId, isNew = true } = {}) {
  const recentComments = await recent(Comment, { author: viewer._id, ...excluding(excludeId) }, 'content', COMMENT_RULES.compareWith);
  return analyzeContent({ userId: viewer._id, kind: isNew ? 'comment' : null, content, extra: [commentRepeatSignal(content, recentComments)] });
}

/** An Anonymous Zone post. The author is used internally only (duplicates, limits, enforcement). */
export async function analyzeAnonymousPost(viewer, { title = '', content = '' }, { excludeId, isNew = true } = {}) {
  const recentItems = await recent(AnonymousPost, { author: viewer._id, status: { $ne: 'deleted' }, ...excluding(excludeId) }, 'title content', SPAM_RULES.duplicate.compareWith);
  return analyzeContent({ userId: viewer._id, kind: isNew ? 'anonymousPost' : null, title, content, recentItems });
}

export async function analyzeAnonymousComment(viewer, { content = '' }, { excludeId, isNew = true } = {}) {
  const recentComments = await recent(AnonymousComment, { author: viewer._id, ...excluding(excludeId) }, 'content', COMMENT_RULES.compareWith);
  return analyzeContent({ userId: viewer._id, kind: isNew ? 'anonymousComment' : null, content, extra: [commentRepeatSignal(content, recentComments)] });
}

/** A community's name, description, tags and rules. */
export async function analyzeCommunityContent(viewer, { name = '', description = '', tags = [], rules = [] }, { excludeId, isNew = true } = {}) {
  const recentItems = (await recent(Community, { createdBy: viewer._id, ...excluding(excludeId) }, 'name description', SPAM_RULES.duplicate.compareWith)).map((item) => ({ title: item.name, content: item.description }));
  return analyzeContent({ userId: viewer._id, kind: isNew ? 'community' : null, title: name, content: description, otherText: [...tags, ...rules].join('\n'), recentItems });
}

/** A project: title, descriptions and links. */
export async function analyzeProject(viewer, { title = '', shortDescription = '', description = '', githubUrl = '', liveUrl = '', demoUrl = '' }, { excludeId, isNew = true } = {}) {
  const recentItems = (await recent(Project, { owner: viewer._id, ...excluding(excludeId) }, 'title description', SPAM_RULES.duplicate.compareWith)).map((item) => ({ title: item.title, content: item.description }));
  return analyzeContent({ userId: viewer._id, kind: isNew ? 'project' : null, title, content: description, otherText: [shortDescription, githubUrl, liveUrl, demoUrl].filter(Boolean).join('\n'), recentItems });
}

/** An achievement claim. Verification stays a separate, moderator-only process. */
export async function analyzeAchievement(viewer, { title = '', description = '', organization = '', eventName = '', date = null, certificateUrl = '' }, { excludeId, isNew = true } = {}) {
  const recentItems = (await recent(Achievement, { owner: viewer._id, ...excluding(excludeId) }, 'title description organization eventName date', SPAM_RULES.duplicate.compareWith)).map((item) => ({ title: item.title, content: achievementDetails(item) }));
  return analyzeContent({ userId: viewer._id, kind: isNew ? 'achievement' : null, title, content: description, otherText: [organization, eventName, certificateUrl].filter(Boolean).join('\n'), recentItems, compareContent: achievementDetails({ description, organization, eventName, date }) });
}

/** What tells two achievements apart for the duplicate check: often only the event and the date. */
function achievementDetails({ description, organization, eventName, date }) {
  const day = date ? new Date(date).toISOString().slice(0, 10) : '';
  return [description, organization, eventName, day].filter(Boolean).join('\n');
}

/**
 * An opportunity (posted by CampusX staff). Words like "win", "prize" or "earn" never count; paying to
 * claim a prize does. Never hidden automatically: a suspicious one only opens a review case.
 */
export async function analyzeOpportunity(viewer, { title = '', shortDescription = '', description = '', organizer = '', prize = '', fee = '', applicationUrl = '', registrationUrl = '' }) {
  const text = [title, shortDescription, description, organizer, prize, fee].join('\n').toLowerCase();
  const fakePrize = OPPORTUNITY_RULES.fakePrizePhrases.filter((phrase) => text.includes(phrase));
  const extra = fakePrize.length ? [{ points: Math.min(fakePrize.length * OPPORTUNITY_RULES.fakePrizePoints, 60), flags: ['fake_prize_claim'], reasons: [`Pay-to-claim wording (${fakePrize.join(', ')})`] }] : [];
  const result = await analyzeContent({ userId: viewer._id, title, content: description, otherText: [shortDescription, organizer, prize, fee, applicationUrl, registrationUrl].filter(Boolean).join('\n'), extra });
  return { ...result, status: 'approved', recommendedAction: result.riskLevel === 'low' ? A.ALLOW : result.recommendedAction === A.ESCALATE ? A.ESCALATE : A.FLAG };
}

// ----------------------------------------------------------------------------- audit log and cases

const actorRole = (actor) => (actor ? (['admin', 'moderator'].includes(actor.role) ? actor.role : 'community') : 'system');

/**
 * Adds a row to the moderation audit log. Ids, statuses, scores and short reasons only. During an admin
 * API request the staff member's address is on `actor.$locals.auditIp` (middleware/adminAuth.js), so
 * every row that request writes carries it.
 */
export async function writeAudit({ actor = null, action, targetType, targetId, previousStatus = null, newStatus = null, reason = '', metadata, caseId = null, ip = actor?.$locals?.auditIp ?? null }) {
  try {
    await ModerationAuditLog.create({
      actor: actor?._id ?? null,
      actorRole: actor?.auditRole ?? actorRole(actor),
      action,
      targetType,
      targetId: oid(targetId),
      previousStatus,
      newStatus,
      reason: String(reason ?? '').slice(0, 500),
      ...(metadata && { metadata }),
      case: caseId,
      ...(ip && { ip: String(ip).slice(0, 64) }),
    });
  } catch (error) {
    logger.warn(`Moderation: audit log write failed (${error?.message ?? error})`);
  }
}

const PRIORITY_FOR_LEVEL = { low: 'low', medium: 'medium', high: 'high', critical: 'critical' };
const bumpPriority = (priority) => PRIORITIES[Math.min(PRIORITIES.indexOf(priority) + 1, PRIORITIES.length - 1)];

/**
 * Opens a case for the moderation team, or adds to the one already open for that target (one active case
 * per target). `source` is "automated" or "report"; `verdict` an analysis result; `reporterId` the
 * student who reported it (stored internally, never shown).
 */
export async function createModerationCase({ targetType, targetId, ownerId = null, source = 'automated', verdict = null, reporterId = null, priority = null, flags = [], reasons = [], priorityBumpAfter = null }) {
  const id = oid(targetId);
  const verdictPriority = verdict ? PRIORITY_FOR_LEVEL[verdict.riskLevel] : 'low';
  const wanted = higherPriority(priority ?? 'low', verdictPriority);
  const newFlags = [...(verdict?.flags ?? []), ...flags];
  const newReasons = [...(verdict?.reasons ?? []), ...reasons];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existing = await ModerationCase.findOne({ targetType, targetId: id, active: true }).select('+reportedBy +targetOwner');
    if (existing) {
      existing.sources = unique([...existing.sources, source]);
      existing.flags = capList([...existing.flags, ...newFlags]);
      existing.reasons = capList([...existing.reasons, ...newReasons]);
      if (verdict) {
        existing.automatedScore = Math.max(existing.automatedScore, verdict.score);
        existing.riskLevel = higherLevel(existing.riskLevel, verdict.riskLevel);
        if (verdict.recommendedAction) existing.action = verdict.recommendedAction;
      }
      if (reporterId && !existing.reportedBy.some((reporter) => reporter.equals(reporterId))) {
        existing.reportedBy.push(reporterId);
        existing.reportCount += 1;
      }
      let next = higherPriority(existing.priority, wanted);
      if (priorityBumpAfter && existing.reportCount >= priorityBumpAfter && existing.reportCount - 1 < priorityBumpAfter) next = bumpPriority(next);
      existing.priority = next;
      if (!existing.targetOwner && ownerId) existing.targetOwner = ownerId;
      await existing.save();
      return existing;
    }
    try {
      const created = await ModerationCase.create({
        targetType,
        targetId: id,
        targetOwner: ownerId ?? null,
        sources: [source],
        reportedBy: reporterId ? [reporterId] : [],
        reportCount: reporterId ? 1 : 0,
        automatedScore: verdict?.score ?? 0,
        riskLevel: verdict?.riskLevel ?? 'low',
        flags: capList(newFlags),
        reasons: capList(newReasons),
        priority: wanted,
        action: verdict?.recommendedAction ?? null,
      });
      // Staff dashboards hear about it live (ids and levels only: never the owner or the reporters).
      emitCampusEvent(CAMPUS_EVENTS.MODERATION_CASE_OPENED, { caseId: created._id.toString(), targetType, targetId: id.toString(), riskLevel: created.riskLevel, priority: created.priority, source });
      return created;
    } catch (error) {
      // Two findings at the same moment: the other one opened the case, add to it instead.
      if (error?.code !== 11000) throw error;
    }
  }
  return ModerationCase.findOne({ targetType, targetId: id, active: true });
}

// ----------------------------------------------------------------------------- the student's trust profile

/** Changes a student's internal risk score (never shown to them). */
export async function adjustRisk(userId, delta, flag) {
  const id = oid(userId);
  if (!id) return;
  const { trust, exists } = await loadTrust(id);
  if (!exists) return;
  const riskScore = Math.max(0, Math.min(ENFORCEMENT.risk.max, (trust.riskScore ?? 0) + delta));
  await User.updateOne(
    { _id: id },
    { $set: { 'moderation.riskScore': riskScore, 'moderation.riskLevel': riskLevelFor(riskScore), 'moderation.lastModerationAt': new Date(), ...(flag && { 'moderation.flags': capList([...(trust.flags ?? []), flag], 10, 60) }) } },
    { timestamps: false },
  );
}

const restrictionDate = (date) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: env.gamificationTimezone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date);

/**
 * Stops students under a temporary restriction from creating new content (posts, comments, projects,
 * achievements, communities, anonymous posts). Reading, liking and reporting still work.
 */
export async function assertCanPublish(viewer) {
  const { trust } = await loadTrust(viewer._id);
  const until = trust.restrictedUntil ? new Date(trust.restrictedUntil) : null;
  if (until && until > new Date()) {
    throw ApiError.forbidden(`You can't post new content until ${restrictionDate(until)} because some of your recent content didn't follow the CampusX community guidelines.`);
  }
}

/** Warns a student (progressive enforcement, or a moderator's decision). */
export async function warnUser(userId, { actor = null, reason = '', source = null, caseId = null } = {}) {
  const id = oid(userId);
  if (!id) return;
  const { trust, exists } = await loadTrust(id);
  if (!exists) return;
  const riskScore = Math.min(ENFORCEMENT.risk.max, (trust.riskScore ?? 0) + ENFORCEMENT.risk.perWarning);
  await User.updateOne({ _id: id }, { $set: { 'moderation.warningCount': (trust.warningCount ?? 0) + 1, 'moderation.riskScore': riskScore, 'moderation.riskLevel': riskLevelFor(riskScore), 'moderation.lastModerationAt': new Date() } }, { timestamps: false });
  await writeAudit({ actor, action: A.WARN_USER, targetType: 'user', targetId: id, reason, metadata: source ? { source } : undefined, caseId });
  emitCampusEvent(CAMPUS_EVENTS.MODERATION_USER_ACTION, { userId: id.toString(), action: 'warning' });
}

/** A temporary restriction on creating new content (never a ban: it ends by itself). */
export async function restrictUser(userId, hours, { actor = null, reason = '', source = null, caseId = null } = {}) {
  const id = oid(userId);
  if (!id) return null;
  const { trust, exists } = await loadTrust(id);
  if (!exists) return null;
  const now = new Date();
  const wanted = new Date(now.getTime() + hours * HOUR);
  const current = trust.restrictedUntil ? new Date(trust.restrictedUntil) : null;
  const until = current && current > wanted ? current : wanted;
  await User.updateOne({ _id: id }, { $set: { 'moderation.restrictedUntil': until, 'moderation.lastModerationAt': now } }, { timestamps: false });
  await writeAudit({ actor, action: A.TEMPORARY_RESTRICTION, targetType: 'user', targetId: id, reason, metadata: { hours, until, ...(source && { source }) }, caseId });
  emitCampusEvent(CAMPUS_EVENTS.MODERATION_USER_ACTION, { userId: id.toString(), action: 'restriction', until: until.toISOString() });
  return until;
}

/**
 * Counts a violation (content held, restricted or removed) and applies the progressive enforcement
 * ladder (config/moderationConfig.js ENFORCEMENT): warnings first, then temporary restrictions, then a
 * case for a CampusX moderator. Never a permanent ban.
 */
export async function recordViolation(userId, { targetType, targetId, actor = null, caseId = null } = {}) {
  const id = oid(userId);
  if (!id) return null;
  const { trust, exists } = await loadTrust(id);
  if (!exists) return null;
  const now = new Date();
  const dates = [...(trust.violationDates ?? []), now].filter((date) => new Date(date).getTime() >= now.getTime() - ENFORCEMENT.windowDays * 24 * HOUR).slice(-ENFORCEMENT.keepViolationDates);
  const riskScore = Math.min(ENFORCEMENT.risk.max, (trust.riskScore ?? 0) + ENFORCEMENT.risk.perViolation);
  await User.updateOne(
    { _id: id },
    { $set: { 'moderation.violationCount': (trust.violationCount ?? 0) + 1, 'moderation.violationDates': dates, 'moderation.riskScore': riskScore, 'moderation.riskLevel': riskLevelFor(riskScore), 'moderation.lastModerationAt': now } },
    { timestamps: false },
  );
  const source = targetType ? { targetType, targetId: String(targetId) } : null;
  const step = ENFORCEMENT.ladder.filter((rung) => dates.length >= rung.violations).at(-1);
  if (!step) return null;
  const reason = `${dates.length} ${dates.length === 1 ? 'violation' : 'violations'} in ${ENFORCEMENT.windowDays} days`;
  if (step.action === A.WARN_USER) await warnUser(id, { actor, reason, source, caseId });
  if (step.action === A.TEMPORARY_RESTRICTION) await restrictUser(id, step.hours, { actor, reason, source, caseId });
  if (step.escalate) {
    await createModerationCase({ targetType: 'user', targetId: id, ownerId: id, source: 'automated', priority: 'critical', verdict: { score: riskScore, riskLevel: 'critical', flags: ['repeated_violations'], reasons: [reason], recommendedAction: A.ESCALATE } });
  }
  return step.action;
}

// ----------------------------------------------------------------------------- applying decisions

const ACTION_STATUS = Object.freeze({ ALLOW: 'approved', FLAG: 'flagged', LIMIT: 'flagged', HOLD: 'restricted', ESCALATE: 'restricted', REMOVE: 'removed' });

/** Keeps a post's comment count equal to the comments other students can see. */
async function syncParentCount(spec, doc, previousStatus, newStatus) {
  if (!spec.parent) return;
  const before = PUBLIC_STATUSES.includes(previousStatus);
  const after = PUBLIC_STATUSES.includes(newStatus);
  if (before === after) return;
  const parentId = doc[spec.parent.field];
  if (after) await spec.parent.model.updateOne({ _id: parentId }, { $inc: { commentsCount: 1 } }, { timestamps: false });
  else await spec.parent.model.updateOne({ _id: parentId, commentsCount: { $gt: 0 } }, { $inc: { commentsCount: -1 } }, { timestamps: false });
}

/**
 * Applies a moderation action to a piece of content: ALLOW (back to approved), FLAG / LIMIT (flagged),
 * HOLD / ESCALATE (restricted), REMOVE (soft delete). `actor` is the moderator (or community manager),
 * null for automated actions; `onlyStricter` keeps automated changes from ever lowering a status.
 * Writes the audit log and tells listeners (notifications, rankings) through CONTENT_MODERATED.
 * Returns { changed, previousStatus, newStatus, ownerId }.
 */
export async function applyModerationAction({ targetType, targetId, action, actor = null, reason = '', caseId = null, onlyStricter = false, notify = true }) {
  const spec = TARGETS[targetType];
  const id = oid(targetId);
  if (!spec || !id || spec.statusless) throw ApiError.unprocessable('This action needs content with a moderation status.');
  const next = ACTION_STATUS[action];
  if (!next) throw ApiError.unprocessable('Unknown moderation action.');

  const doc = await spec.model.findById(id).select(`moderationStatus +${spec.owner}${spec.parent ? ` ${spec.parent.field}` : ''}`).lean();
  if (!doc) throw ApiError.notFound(`That ${spec.label} no longer exists.`);
  const previousStatus = doc.moderationStatus ?? 'approved';
  const newStatus = onlyStricter ? stricterStatus(previousStatus, next) : next;
  const ownerId = doc[spec.owner] ?? null;
  if (newStatus === previousStatus) return { changed: false, previousStatus, newStatus, ownerId };

  const now = new Date();
  const update = newStatus === 'removed'
    ? { $set: { moderationStatus: newStatus, deletedAt: now, deletedBy: actor?._id ?? null, deletionReason: reason || null } }
    : { $set: { moderationStatus: newStatus }, ...(previousStatus === 'removed' && { $unset: { deletionReason: 1, deletedBy: 1 } }) };
  // Matches only if nobody changed the status meanwhile.
  const { modifiedCount } = await spec.model.updateOne({ _id: id, moderationStatus: doc.moderationStatus ?? { $in: [null, 'approved'] } }, update, { timestamps: false });
  if (!modifiedCount) return { changed: false, previousStatus, newStatus: previousStatus, ownerId };

  await syncParentCount(spec, doc, previousStatus, newStatus);
  await writeAudit({ actor, action, targetType, targetId: id, previousStatus, newStatus, reason, caseId });
  emitCampusEvent(CAMPUS_EVENTS.CONTENT_MODERATED, {
    targetType,
    targetId: id.toString(),
    previousStatus,
    newStatus,
    automated: !actor,
    notify,
    // Anonymous content: no user id in the event; listeners look the author up themselves.
    ...(!spec.anonymous && ownerId && { ownerId: ownerId.toString() }),
    ...(spec.parent && { parentId: doc[spec.parent.field].toString() }),
  });
  return { changed: true, previousStatus, newStatus, ownerId };
}

/**
 * After new or edited content is saved with the status its analysis gave it: opens a case for anything
 * above "low", writes the audit log, tells the owner when their content is held, and applies progressive
 * enforcement. Never fails the request that saved the content (problems are logged).
 */
export async function recordOutcome({ targetType, targetId, ownerId, verdict, previousStatus = null }) {
  if (!verdict || verdict.recommendedAction === A.ALLOW) return null;
  try {
    const moderationCase = await createModerationCase({ targetType, targetId, ownerId, source: 'automated', verdict });
    const spec = TARGETS[targetType];
    await writeAudit({
      action: verdict.recommendedAction,
      targetType,
      targetId,
      previousStatus,
      newStatus: spec?.statusless ? null : verdict.status,
      reason: verdict.reasons.slice(0, 3).join('; '),
      metadata: { score: verdict.score, riskLevel: verdict.riskLevel, flags: verdict.flags },
      caseId: moderationCase?._id ?? null,
    });
    const held = !spec?.statusless && OWNER_ONLY_STATUSES.includes(verdict.status) && previousStatus !== verdict.status;
    if (held) {
      emitCampusEvent(CAMPUS_EVENTS.CONTENT_MODERATED, {
        targetType,
        targetId: String(targetId),
        previousStatus,
        newStatus: verdict.status,
        automated: true,
        notify: true,
        ...(!spec.anonymous && ownerId && { ownerId: String(ownerId) }),
      });
      await recordViolation(ownerId, { targetType, targetId, caseId: moderationCase?._id ?? null });
    } else if (ownerId && !spec?.statusless) {
      await adjustRisk(ownerId, ENFORCEMENT.risk.perFlag);
    }
    return moderationCase;
  } catch (error) {
    logger.warn(`Moderation: recording an automated outcome failed (${error?.message ?? error})`);
    return null;
  }
}

// ----------------------------------------------------------------------------- engagement

const pauseKey = (userId) => `moderation:engagement-pause:${userId}`;

/**
 * Watches likes for fake engagement: liking very fast, liking/unliking the same thing over and over, or
 * one thing getting a burst of likes. Nobody is punished: the student's likes and comments stop counting
 * for rankings for a while, their internal risk goes up a little, and a content burst opens a case.
 */
export async function trackEngagement({ userId, targetType, targetId, liked }) {
  try {
    const [likes, toggles, contentLikes] = await Promise.all([
      liked ? bump('like', userId, BEHAVIOR_LIMITS.like.windowMinutes) : 0,
      bump('toggle', `${userId}:${targetType}:${targetId}`, ENGAGEMENT_LIMITS.toggles.windowMinutes),
      liked ? bump('content-likes', `${targetType}:${targetId}`, ENGAGEMENT_LIMITS.contentBurst.windowMinutes) : 0,
    ]);
    const rapid = likes > BEHAVIOR_LIMITS.like.max;
    const toggling = toggles > ENGAGEMENT_LIMITS.toggles.max;
    if (rapid || toggling) {
      await setCache(pauseKey(userId), 1, ENGAGEMENT_LIMITS.pauseRewardsMinutes * 60);
      // Once per burst, not on every extra like.
      if (likes === BEHAVIOR_LIMITS.like.max + 1 || toggles === ENGAGEMENT_LIMITS.toggles.max + 1) {
        await adjustRisk(userId, ENFORCEMENT.risk.suspiciousEngagement, rapid ? BEHAVIOR_LIMITS.like.flag : ENGAGEMENT_LIMITS.toggles.flag);
        await writeAudit({ action: A.LIMIT, targetType: 'user', targetId: userId, reason: rapid ? 'Liking very fast' : 'Liking and unliking the same content repeatedly', metadata: { likes, toggles } });
      }
    }
    if (contentLikes === ENGAGEMENT_LIMITS.contentBurst.max + 1) {
      const ownerId = await ownerOf(targetType, targetId);
      const verdict = { score: RISK_THRESHOLDS.medium, riskLevel: 'medium', flags: [ENGAGEMENT_LIMITS.contentBurst.flag], reasons: [`More than ${ENGAGEMENT_LIMITS.contentBurst.max} likes within a minute`], recommendedAction: A.FLAG };
      const moderationCase = await createModerationCase({ targetType, targetId, ownerId, source: 'automated', verdict });
      await writeAudit({ action: A.FLAG, targetType, targetId, reason: verdict.reasons[0], metadata: { flags: verdict.flags }, caseId: moderationCase?._id ?? null });
    }
    return { suspicious: rapid || toggling };
  } catch (error) {
    logger.warn(`Moderation: engagement tracking failed (${error?.message ?? error})`);
    return { suspicious: false };
  }
}

/** Whether a student's likes and comments count for other students' rankings right now. */
export async function engagementCounts(userId) {
  if (!userId) return false;
  if (await getCache(pauseKey(userId))) return false;
  const { trust } = await loadTrust(userId);
  return trust.riskLevel !== 'critical';
}

/** Moderation status for an owner-facing view: only when it's something the owner should know about. */
export const ownerModeration = (status) => (OWNER_ONLY_STATUSES.includes(status) ? { status } : null);
