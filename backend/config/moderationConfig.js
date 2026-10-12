/**
 * Trust & Safety: every moderation rule, threshold and label in one place. The moderation, spam and
 * report services read only from here (and from config/moderationLimits.js for activity limits), so
 * tuning CampusX moderation never means hunting for magic numbers.
 *
 * Rule-based only: no AI, no language models. Detection is deliberately conservative: one weak signal
 * never removes content or bans anyone, and nothing here bans an account permanently.
 */

// ----------------------------------------------------------------------------- statuses and levels

/**
 * Content moderation status (posts, comments, projects, achievements, communities, anonymous content):
 *   approved    live as usual (the default: content is published straight away)
 *   flagged     live, but marked for review: left out of search and of rankings until reviewed
 *   pending     waiting for review before anyone else sees it (not used for new content by default)
 *   restricted  hidden from everyone except its owner while it is reviewed
 *   removed     taken down (kept internally for audits, shown to nobody)
 */
export const CONTENT_STATUSES = Object.freeze(['pending', 'approved', 'flagged', 'restricted', 'removed']);
/** Seen by other students (the feed, profiles, communities). */
export const PUBLIC_STATUSES = Object.freeze(['approved', 'flagged']);
/** Found by search and counted for rankings. */
export const SEARCHABLE_STATUSES = Object.freeze(['approved']);
/** Hidden from everyone but the owner (who sees a short explanation). */
export const OWNER_ONLY_STATUSES = Object.freeze(['pending', 'restricted']);
/** How serious each status is; automated checks only ever move content up this ladder, never down. */
export const STATUS_SEVERITY = Object.freeze({ approved: 0, flagged: 1, pending: 2, restricted: 3, removed: 4 });

export const RISK_LEVELS = Object.freeze({ LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' });
export const RISK_LEVEL_IDS = Object.freeze(Object.values(RISK_LEVELS));
/** A score (0-100) at or above each value reaches that level. */
export const RISK_THRESHOLDS = Object.freeze({ medium: 30, high: 60, critical: 85 });

export const MODERATION_ACTIONS = Object.freeze({
  ALLOW: 'ALLOW',
  FLAG: 'FLAG',
  LIMIT: 'LIMIT',
  HOLD: 'HOLD',
  REMOVE: 'REMOVE',
  WARN_USER: 'WARN_USER',
  TEMPORARY_RESTRICTION: 'TEMPORARY_RESTRICTION',
  ESCALATE: 'ESCALATE',
});
export const MODERATION_ACTION_IDS = Object.freeze(Object.values(MODERATION_ACTIONS));

/**
 * The automated pipeline:  low → publish · medium → publish + flag · high → hold (restricted) ·
 * critical → restrict + escalate. LIMIT is used instead of FLAG when only behaviour (not the content
 * itself) looks off, e.g. posting very fast.
 */
export const ACTION_FOR_RISK = Object.freeze({ low: 'ALLOW', medium: 'FLAG', high: 'HOLD', critical: 'ESCALATE' });
export const STATUS_FOR_ACTION = Object.freeze({ ALLOW: 'approved', FLAG: 'flagged', LIMIT: 'flagged', HOLD: 'restricted', ESCALATE: 'restricted', REMOVE: 'removed' });

// ----------------------------------------------------------------------------- spam (original CampusX SpamDetector)

/**
 * The original CampusX SpamDetector's rules, kept word for word and point for point: 25 per spam phrase,
 * 15 per clickbait phrase, 20 for shouting in capitals, 15 for "!!!"/"???", 100 for an exact duplicate
 * and 85 for a near duplicate (Jaccard similarity above 0.8) of one of the author's last 5 posts in the
 * past hour, capped at 100; 60 or more was "spam". One addition: texts under `duplicate.minWords` words
 * ("ok", "thank you") are never treated as duplicates, so short legitimate replies aren't punished.
 */
export const SPAM_RULES = Object.freeze({
  spamKeywords: Object.freeze([
    'free cash', 'make money', 'click here', 'guaranteed success',
    'double your', 'unlimited free', 'earn money', 'get rich',
    'investment plan', 'crypto wealth', 'claim reward', 'winner alert',
    'work from home online', 'binary option', 'testosterone booster',
  ]),
  spamKeywordPoints: 25,
  clickbaitPhrases: Object.freeze([
    'you wont believe', 'must see', 'shocking truth', 'secret formula',
    'revealed', 'will change your life', 'omg', 'what happened next',
  ]),
  clickbaitPoints: 15,
  // More than `ratio` of all characters in capitals, for texts longer than `minLength`.
  capitals: Object.freeze({ minLength: 20, ratio: 0.6, points: 20 }),
  // Three or more ! or ? in a row.
  punctuation: Object.freeze({ points: 15 }),
  duplicate: Object.freeze({ windowMinutes: 60, compareWith: 5, exactScore: 100, similarity: 0.8, similarScore: 85, minWords: 3 }),
  spamAt: 60,
  maxScore: 100,
});

// ----------------------------------------------------------------------------- other content signals

/**
 * Links. Conservative on purpose: ordinary links are fine. Only clearly unsafe schemes score high;
 * the rest are small hints that add up. This is not a malware scanner.
 */
export const LINK_RULES = Object.freeze({
  dangerousSchemes: Object.freeze(['javascript:', 'data:', 'vbscript:', 'file:']),
  dangerousPoints: 60,
  shorteners: Object.freeze(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rb.gy', 'shorturl.at', 'ow.ly', 'tiny.cc', 'rebrand.ly']),
  shortenerPoints: 10,
  ipHostPoints: 20, // http://123.45.67.89/...
  credentialsPoints: 25, // http://paypal.com@evil.example/
  punycodePoints: 15, // xn-- look-alike domains
  malformedPoints: 10,
  manyLinks: Object.freeze({ count: 4, points: 15 }),
  tooManyLinks: Object.freeze({ count: 8, points: 30 }),
  maxPoints: 60,
});

/**
 * Harassment, threats and abusive language: simple phrase rules, not language understanding. A threat
 * always reaches at least "high" and is escalated for a moderator; abusive words add up to a cap.
 */
export const ABUSE_RULES = Object.freeze({
  threats: Object.freeze([
    String.raw`\b(i\s*(?:'| a)?m\s+going\s+to|i\s+will|i'?ll|gonna|we\s+will)\s+(kill|hurt|beat\s+up|stab|shoot|attack|murder)\s+(you|u|him|her|them)\b`,
    String.raw`\b(kill|hang)\s+(yourself|urself|ur\s*self)\b`,
    String.raw`\bkys\b`,
    String.raw`\byou\s*(?:'| a)?re\s+(dead|going\s+to\s+die)\b`,
    String.raw`\bwatch\s+your\s+back\b`,
    String.raw`\b(bomb|shoot\s+up|blow\s+up)\s+(the\s+)?(college|campus|school|hostel|class|library|canteen)\b`,
  ]),
  threatPoints: 60,
  harassment: Object.freeze([
    String.raw`\byou\s*(?:'| a)?re\s+(so\s+)?(stupid|ugly|worthless|useless|pathetic|disgusting|a\s+loser|an\s+idiot|trash)\b`,
    String.raw`\bnobody\s+(likes|wants|cares\s+about)\s+you\b`,
    String.raw`\beveryone\s+hates\s+you\b`,
    String.raw`\bgo\s+die\b`,
    String.raw`\bshut\s+up\s+(you|u)\b`,
  ]),
  harassmentPoints: 25,
  abusiveWords: Object.freeze([
    'fuck', 'fucking', 'motherfucker', 'bitch', 'bastard', 'asshole', 'dickhead', 'slut', 'whore', 'retard',
    'chutiya', 'madarchod', 'behenchod', 'bhenchod', 'bhosdike', 'gandu', 'randi',
  ]),
  abusivePoints: 15,
  abusiveMax: 45,
});

/** Self-promotion: small points that only matter together with other signals. */
export const PROMOTION_RULES = Object.freeze({
  phrases: Object.freeze([
    'dm me', 'dm for', 'whatsapp me', 'join my telegram', 'telegram channel', 'use my referral', 'referral code',
    'promo code', 'buy now', 'limited offer', 'discount code', 'follow me on', 'subscribe to my',
  ]),
  points: 10,
  max: 30,
});

/**
 * Opportunities are posted by CampusX moderators and admins, so they are never hidden automatically:
 * suspicious ones only open a review case. Ordinary words like "win", "prize" or "earn" never count;
 * these phrases about paying to claim a prize do.
 */
export const OPPORTUNITY_RULES = Object.freeze({
  fakePrizePhrases: Object.freeze(['pay to claim', 'processing fee to claim', 'claim your prize now', 'guaranteed prize', '100% guaranteed', 'send money to', 'pay first', 'guaranteed internship for a fee']),
  fakePrizePoints: 30,
});

/** Comments: copy-paste and very short repeats from the same student. */
export const COMMENT_RULES = Object.freeze({
  windowMinutes: 60,
  compareWith: 20,
  // The same (or almost the same) comment several times.
  copyPaste: Object.freeze({ similarity: 0.8, minWords: 3, repeats: 2, points: 35, manyRepeats: 4, manyPoints: 60 }),
  // "nice", "gg", "+1" over and over.
  shortRepeat: Object.freeze({ maxWords: 2, repeats: 3, points: 25 }),
});

/** Who is posting: repeat offenders and brand-new accounts acting fast get a little extra attention. */
export const ACCOUNT_RULES = Object.freeze({
  repeatOffender: Object.freeze({ recentViolations: 2, points: 15 }),
  highRiskUserPoints: 10,
  newAccount: Object.freeze({ hours: 24, points: 10 }),
});

// ----------------------------------------------------------------------------- progressive enforcement

/**
 * What happens to a student whose content is held, restricted or removed (a "violation"), counted over
 * `windowDays`. Temporary restrictions only stop new posts, comments and other new content; reading,
 * liking and reporting still work. Nothing is permanent and no account is ever banned automatically:
 * the last step escalates to a CampusX moderator.
 */
export const ENFORCEMENT = Object.freeze({
  windowDays: 30,
  ladder: Object.freeze([
    Object.freeze({ violations: 1, action: 'WARN_USER' }),
    Object.freeze({ violations: 3, action: 'TEMPORARY_RESTRICTION', hours: 24 }),
    Object.freeze({ violations: 5, action: 'TEMPORARY_RESTRICTION', hours: 72, escalate: true }),
  ]),
  // Internal risk score for each student (never shown to anyone, including the student).
  risk: Object.freeze({ perViolation: 15, perWarning: 5, perFlag: 2, suspiciousReporting: 10, suspiciousEngagement: 5, max: 100 }),
  keepViolationDates: 20,
});

// ----------------------------------------------------------------------------- reports

export const REPORT_REASONS = Object.freeze([
  { id: 'spam', label: 'Spam', priority: 'medium' },
  { id: 'harassment', label: 'Harassment', priority: 'high' },
  { id: 'hate_or_abuse', label: 'Hate or abuse', priority: 'high' },
  { id: 'threat', label: 'Threat', priority: 'critical' },
  { id: 'inappropriate_content', label: 'Inappropriate content', priority: 'medium' },
  { id: 'misleading', label: 'Misleading', priority: 'low' },
  { id: 'impersonation', label: 'Impersonation', priority: 'medium' },
  { id: 'malicious_link', label: 'Malicious link', priority: 'high' },
  { id: 'privacy_violation', label: 'Privacy violation', priority: 'high' },
  // Opportunities only: practical problems rather than safety ones.
  { id: 'expired', label: 'Expired', priority: 'low' },
  { id: 'broken_link', label: 'Broken application link', priority: 'low' },
  { id: 'wrong_info', label: 'Wrong information', priority: 'low' },
  { id: 'other', label: 'Other', priority: 'low' },
]);
export const REPORT_REASON_IDS = Object.freeze(REPORT_REASONS.map((reason) => reason.id));

const SAFETY_REASONS = ['spam', 'harassment', 'hate_or_abuse', 'threat', 'inappropriate_content', 'misleading', 'impersonation', 'malicious_link', 'privacy_violation', 'other'];

/** What can be reported, and which reasons fit each. */
export const REPORT_TARGETS = Object.freeze({
  post: { label: 'post', reasons: SAFETY_REASONS },
  comment: { label: 'comment', reasons: SAFETY_REASONS },
  project: { label: 'project', reasons: SAFETY_REASONS },
  community: { label: 'community', reasons: SAFETY_REASONS },
  opportunity: { label: 'opportunity', reasons: ['spam', 'misleading', 'malicious_link', 'expired', 'broken_link', 'wrong_info', 'inappropriate_content', 'other'] },
  achievement: { label: 'achievement', reasons: SAFETY_REASONS },
  user: { label: 'student', reasons: ['spam', 'harassment', 'hate_or_abuse', 'threat', 'impersonation', 'privacy_violation', 'inappropriate_content', 'other'] },
  anonymousPost: { label: 'anonymous post', reasons: SAFETY_REASONS },
  anonymousComment: { label: 'anonymous comment', reasons: SAFETY_REASONS },
});
export const REPORT_TARGET_IDS = Object.freeze(Object.keys(REPORT_TARGETS));

/**
 * pending    waiting for the moderation team        reviewing  a moderator is looking at it
 * resolved   action was taken                       dismissed  no guideline problem found
 * withdrawn  the reporter took it back
 */
export const REPORT_STATUSES = Object.freeze(['pending', 'reviewing', 'resolved', 'dismissed', 'withdrawn']);
export const ACTIVE_REPORT_STATUSES = Object.freeze(['pending', 'reviewing']);
export const PRIORITIES = Object.freeze(['low', 'medium', 'high', 'critical']);

export const REPORT_RULES = Object.freeze({
  descriptionMax: 500,
  pageSize: Object.freeze({ default: 20, max: 50 }),
  // Reports from this many different students flag the content for review. It stays visible: reports
  // alone never hide content, so a group can't take a post down by reporting it together.
  flagAfterReporters: 3,
  // ...and raise the case's priority by one step.
  priorityBumpAfter: 3,
  // Report abuse: a student sending this many reports in a day, or this many about the same person,
  // is noted as suspicious (internal risk only); above `limitAfter` in a day, reporting pauses for a while.
  abuse: Object.freeze({ windowHours: 24, suspiciousAfter: 15, sameOwnerAfter: 5, limitAfter: 25, dismissedLimit: 5 }),
});

/**
 * Report reasons used by the Phase 5, 8 and 9 report endpoints (still accepted), mapped to the reasons
 * above. All reports are stored the same way now (models/Report.js).
 */
export const LEGACY_REPORT_REASONS = Object.freeze({
  post: Object.freeze({ spam: 'spam', harassment: 'harassment', inappropriate: 'inappropriate_content', misinformation: 'misleading', other: 'other' }),
  opportunity: Object.freeze({ expired: 'expired', 'wrong-info': 'wrong_info', 'broken-link': 'broken_link', spam: 'spam', misleading: 'misleading', other: 'other' }),
  anonymous: Object.freeze({ harassment: 'harassment', 'abusive-language': 'hate_or_abuse', spam: 'spam', threat: 'threat', 'personal-info': 'privacy_violation', misleading: 'misleading', hate: 'hate_or_abuse', other: 'other' }),
});

// ----------------------------------------------------------------------------- cases

/** open → reviewing → resolved | dismissed. One open case per piece of content (or student). */
export const CASE_STATUSES = Object.freeze(['open', 'reviewing', 'resolved', 'dismissed']);
export const ACTIVE_CASE_STATUSES = Object.freeze(['open', 'reviewing']);
export const CASE_TARGET_TYPES = REPORT_TARGET_IDS;
export const CASE_RULES = Object.freeze({ pageSize: Object.freeze({ default: 20, max: 50 }), noteMax: 1000 });

/** Moderator actions on a case (the staff case API and the Phase 15 admin control center). */
export const CASE_DECISIONS = Object.freeze({
  approve: 'ALLOW', // content is fine: live again, reports dismissed
  flag: 'FLAG', // keep it live but out of search and rankings; the case stays open (reviewing)
  restrict: 'HOLD', // hidden from everyone but the owner
  remove: 'REMOVE', // taken down (soft delete)
  warn: 'WARN_USER', // the owner gets a warning; the content stays as it is
  dismiss: 'DISMISS', // nothing to do: reports dismissed, flags cleared
  escalate: 'ESCALATE', // needs a senior look: highest priority
});
export const CASE_DECISION_IDS = Object.freeze(Object.keys(CASE_DECISIONS));
