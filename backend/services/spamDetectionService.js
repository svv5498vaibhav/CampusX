import { SPAM_RULES } from '../config/moderationConfig.js';

/*
 * The original CampusX SpamDetector, carried over from the earlier build with the same rules and points
 * (config/moderationConfig.js SPAM_RULES): spam phrases +25 each, clickbait phrases +15 each, shouting in
 * capitals +20, "!!!"/"???" +15, an exact duplicate of a recent post 100, a near duplicate (Jaccard
 * similarity above 0.8) 85, capped at 100; 60 or more is spam. It only scores text: the moderation
 * service (services/moderationService.js) combines this with links, abusive language, behaviour and
 * account signals, and decides what happens.
 *
 * Unlike the earlier version it doesn't query the database itself: the caller passes the author's recent
 * items, so the same check works for posts, anonymous posts, projects, achievements and communities.
 */

const S = SPAM_RULES;

/** Jaccard-like similarity of two texts' word sets (0 to 1), exactly as the original calculated it. */
export function calculateTextSimilarity(text1 = '', text2 = '') {
  const getWords = (text) => new Set(String(text).toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean));
  const words1 = getWords(text1);
  const words2 = getWords(text2);
  if (words1.size === 0 || words2.size === 0) return 0;
  const intersection = [...words1].filter((word) => words2.has(word)).length;
  const union = new Set([...words1, ...words2]).size;
  return intersection / union;
}

const wordCount = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean).length;

/**
 * Compares new text with the author's recent items ([{ title?, content }], newest first). Returns the
 * duplicate part of the score, or null. Texts under SPAM_RULES.duplicate.minWords words are skipped.
 */
export function detectDuplicateContent({ title = '', content = '' }, recentItems = []) {
  const { compareWith, exactScore, similarity: threshold, similarScore, minWords } = S.duplicate;
  if (wordCount(`${title} ${content}`) < minWords) return null;
  for (const item of recentItems.slice(0, compareWith)) {
    const itemContent = (item.content ?? '').trim();
    const sameContent = Boolean(content.trim()) && itemContent === content.trim();
    const sameTitle = Boolean(title?.trim()) && (item.title ?? '').trim() === title.trim();
    // A repeated title alone isn't a duplicate (two achievements can both be "Certificate of
    // Participation", two anonymous posts "Hostel issue"): the rest must repeat too. Items with nothing
    // but a title are compared by the title.
    if (sameContent || (sameTitle && !content.trim() && !itemContent)) {
      return { score: exactScore, flag: 'duplicate_content', reason: 'Exact duplicate of a recent post by the same author' };
    }
    const similarity = calculateTextSimilarity(item.content ?? '', content);
    if (similarity > threshold) {
      return { score: similarScore, flag: 'similar_content', reason: `Highly similar to a recent post (${Math.round(similarity * 100)}%)` };
    }
  }
  return null;
}

/**
 * Scores text the way the original SpamDetector did.
 * Returns { isSpam, spamScore, flags, reasons }.
 */
export function detectSpam({ title = '', content = '', compareContent }, recentItems = []) {
  const reasons = [];
  const flags = new Set();
  let spamScore = 0;
  const combinedText = `${title} ${content}`.toLowerCase();

  for (const keyword of S.spamKeywords) {
    if (combinedText.includes(keyword)) {
      spamScore += S.spamKeywordPoints;
      flags.add('spam_keywords');
      reasons.push(`Contains spam phrase "${keyword}"`);
    }
  }
  for (const phrase of S.clickbaitPhrases) {
    if (combinedText.includes(phrase)) {
      spamScore += S.clickbaitPoints;
      flags.add('clickbait');
      reasons.push(`Contains clickbait phrase "${phrase}"`);
    }
  }

  // Capitals and punctuation are judged on the main text, as before.
  const upperCount = (content.match(/[A-Z]/g) ?? []).length;
  if (content.length > S.capitals.minLength && upperCount / content.length > S.capitals.ratio) {
    spamScore += S.capitals.points;
    flags.add('excessive_capitals');
    reasons.push('Excessive capitalization');
  }
  if (/[!?]{3,}/.test(content)) {
    spamScore += S.punctuation.points;
    flags.add('excessive_punctuation');
    reasons.push('Excessive exclamation or question marks');
  }

  // `compareContent`: what makes the item itself, when that is more than its main text (achievements).
  const duplicate = detectDuplicateContent({ title, content: compareContent ?? content }, recentItems);
  if (duplicate) {
    // As before: a duplicate sets the score (exact 100, near duplicate at least 85).
    spamScore = duplicate.score === S.duplicate.exactScore ? S.duplicate.exactScore : Math.max(spamScore, duplicate.score);
    flags.add(duplicate.flag);
    reasons.push(duplicate.reason);
  }

  spamScore = Math.min(spamScore, S.maxScore);
  return { isSpam: spamScore >= S.spamAt, spamScore, flags: [...flags], reasons };
}
