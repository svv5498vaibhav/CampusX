import { BRANCHES, COLLEGES, INTERESTS, SEMESTER_COUNT } from '../data/campusOptions.js';
import { COMMUNITY_TYPES } from '../data/communityOptions.js';
import { OPPORTUNITY_MODES, OPPORTUNITY_TYPES } from '../data/opportunityOptions.js';
import { POST_TYPES } from '../data/postOptions.js';
import { GENERIC_CAMPUS_WORDS, SEARCH_RULES, STOP_WORDS, STUDENT_NOISE_WORDS } from '../data/searchOptions.js';
import { ACHIEVEMENT_TYPES, PROJECT_CATEGORIES } from '../data/showcaseOptions.js';

/*
 * Turns what a student typed into something safe to search with. Nothing typed ever becomes a regular
 * expression or a MongoDB operator: every word is escaped and used as a literal, the $text string is
 * rebuilt from plain words (no quotes or "-" negations), and the number and length of words are capped.
 */

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "react," → "react" · "(ai)" → "ai" · "c++" and "c#" keep their symbols.
const cleanWord = (word) => word.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}+#]+$/u, '');
// "node.js" → "nodejs", "e&tc" → "etc": compares a typed word with option labels like "E&TC".
const compact = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Trimmed, single-spaced, without control characters and at most SEARCH_RULES.query.max characters. */
export const cleanQueryText = (raw) =>
  String(raw ?? '')
    .normalize('NFKC')
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SEARCH_RULES.query.max);

/**
 * The query in every form search needs:
 *   text        as typed, cleaned ("React Native")
 *   lower       lower case ("react native")
 *   words       distinct words without common English words, at most SEARCH_RULES.maxWords
 *   textSearch  the string for MongoDB's $text (letters and digits only), '' when nothing is left
 */
export function normalizeQuery(raw) {
  const text = cleanQueryText(raw);
  const lower = text.toLowerCase();
  const all = [...new Set(lower.split(' ').map(cleanWord).filter(Boolean))];
  const meaningful = all.filter((word) => !STOP_WORDS.has(word));
  const words = (meaningful.length ? meaningful : all).slice(0, SEARCH_RULES.maxWords);
  const textSearch = [...new Set(words.flatMap((word) => word.split(/[^\p{L}\p{N}]+/u)).filter(Boolean))].join(' ');
  return { text, lower, words, textSearch };
}

// ----------------------------------------------------------------------------- patterns

const startsWithLetterOrDigit = /^[A-Za-z0-9]/;

/**
 * A word starting a word of the text: "rea" matches "React" and "Campus React App", not "Area".
 * Words of one or two letters must match a whole word ("ai" matches "AI", not "aim").
 */
export function wordPattern(word, { prefix = word.length > 2 } = {}) {
  const before = startsWithLetterOrDigit.test(word) ? '(?:^|[^A-Za-z0-9])' : '(?:^|\\s)';
  const after = prefix ? '' : '(?![A-Za-z0-9])';
  return new RegExp(`${before}${escapeRegex(word)}${after}`, 'i');
}

/** Names always match on prefixes, even short ones ("va" → "Vaibhav"). */
export const namePattern = (word) => wordPattern(word, { prefix: true });

/** A whole value, ignoring case ("react" matches the skill "React" only). */
export const exactPattern = (text) => new RegExp(`^${escapeRegex(text)}$`, 'i');

// ----------------------------------------------------------------------------- campus and type options

/** One plural/singular step: "hackathons" ↔ "hackathon", "branches" ↔ "branch". */
const sameWord = (a, b) => a === b || `${a}s` === b || a === `${b}s` || `${a}es` === b || a === `${b}es`;

/** The words an option answers to: its label words, plural, short name and aliases, plus its whole id. */
function vocabulary(option, { generic = new Set() } = {}) {
  const phrases = [option.label, option.name, option.plural, option.shortName, ...(option.aliases ?? [])].filter(Boolean);
  const words = phrases.flatMap((phrase) => phrase.toLowerCase().split(/[^\p{L}\p{N}]+/u)).filter((word) => word && !STOP_WORDS.has(word) && !generic.has(word));
  const exact = new Set([option.id, ...[option.shortName, ...(option.aliases ?? [])].filter(Boolean).map(compact)]);
  return { words: [...new Set(words)], exact };
}

/** Whether a typed word means this option: a whole word, a short name ("CSE", "E&TC"), or (4+ letters) the start of a label word. */
function wordMeans(word, { words, exact }) {
  const plain = compact(word);
  if (!plain) return false;
  if (exact.has(word) || exact.has(plain)) return true;
  return words.some((candidate) => sameWord(plain, candidate) || (plain.length >= 4 && candidate.startsWith(plain)));
}

const build = (options, settings) =>
  options.filter((option) => option.id !== 'other').map((option) => ({ id: option.id, ...vocabulary(option, settings) }));

// Built once: these lists only change with a deploy.
const VOCABULARIES = Object.freeze({
  colleges: build(COLLEGES, { generic: GENERIC_CAMPUS_WORDS }),
  branches: build(BRANCHES, { generic: GENERIC_CAMPUS_WORDS }),
  interests: build(INTERESTS),
  postTypes: build(POST_TYPES.filter((type) => !['text', 'photo', 'video'].includes(type.id))),
  projectCategories: build(PROJECT_CATEGORIES),
  communityTypes: build(COMMUNITY_TYPES),
  opportunityTypes: build(OPPORTUNITY_TYPES),
  opportunityModes: build(OPPORTUNITY_MODES),
  achievementTypes: build(ACHIEVEMENT_TYPES),
});

const ORDINAL = /^([1-9])(?:st|nd|rd|th)$/;
const SEMESTER_WORDS = new Set(['sem', 'semester', 'semesters']);

/** "5th", "sem5", or a plain digit next to the word "semester". */
function semestersFor(word, words) {
  const match = ORDINAL.exec(word) ?? /^sem(?:ester)?([1-9])$/.exec(word) ?? (/^[1-9]$/.test(word) && words.some((other) => SEMESTER_WORDS.has(other)) ? [word, word] : null);
  const value = match ? Number(match[1]) : null;
  return value && value <= SEMESTER_COUNT ? [value] : [];
}

/** Every option a single typed word stands for, as lists of option ids (semesters as numbers). */
export function optionsForWord(word, words = [word]) {
  const matches = Object.fromEntries(Object.entries(VOCABULARIES).map(([kind, list]) => [kind, list.filter((option) => wordMeans(word, option)).map((option) => option.id)]));
  matches.semesters = semestersFor(word, words);
  return matches;
}

/** The options any word of the query stands for: "hackathon" → opportunity and achievement type "hackathon". */
export function matchOptions(query) {
  const merged = {};
  for (const word of query.words) {
    for (const [kind, ids] of Object.entries(optionsForWord(word, query.words))) {
      merged[kind] = [...new Set([...(merged[kind] ?? []), ...ids])];
    }
  }
  return merged;
}

/**
 * Student search needs every word to match something (a name, a skill, a campus option). Words that only
 * describe the search ("students"), the semester ("sem") or that every college shares ("engineering")
 * don't have to; they still count towards relevance. If nothing else is left, all words are required.
 */
export function requiredStudentWords(query) {
  const optional = (word) => STUDENT_NOISE_WORDS.has(word) || SEMESTER_WORDS.has(word) || GENERIC_CAMPUS_WORDS.has(word);
  const required = query.words.filter((word) => !optional(word));
  return required.length ? required : query.words;
}
