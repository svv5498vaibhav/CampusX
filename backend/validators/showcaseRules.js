import { body, query } from 'express-validator';

/*
 * Shared rule builders for projects and achievements. Text is plain text: React escapes it when shown,
 * and markup-like input (tags such as <script>) is refused outright.
 */

export const singleSpaced = (text) => text.replace(/\s+/g, ' ').trim();
export const cleanText = (text) => text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const MARKUP = /<\s*\/?\s*[a-z!?]/i;
const LIST_ITEM = /^[\p{L}\p{N}][\p{L}\p{N} .+#&/()_-]*$/u;
const NO_MARKUP_MESSAGE = "Please don't include HTML or code tags.";
export const isObjectIdString = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

/** A text field: single-line (singleSpaced) or multi-line (cleanText), length-checked, no markup. */
export function textRule(field, label, { min = 0, max, required = false, multiline = false }) {
  let chain = required ? body(field) : body(field).optional({ values: 'undefined' });
  chain = chain
    .isString().withMessage(`${label} must be text.`)
    .bail()
    .customSanitizer(multiline ? cleanText : singleSpaced);
  if (min > 0) {
    chain = chain.isLength({ min, max }).withMessage(`${label} must be ${min}–${max} characters.`);
  } else {
    chain = chain.isLength({ max }).withMessage(`${label} must be ${max} characters or fewer.`);
  }
  return chain.bail().not().matches(MARKUP).withMessage(NO_MARKUP_MESSAGE);
}

/** An optional http(s) link. An empty string removes a saved link. */
export const urlRule = (field, label, maxLength) =>
  body(field)
    .optional({ values: 'undefined' })
    .isString().withMessage(`${label} must be text.`)
    .bail()
    .trim()
    .custom((value) => value === '' || /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(value)).withMessage(`Please enter a full link for ${label}, starting with https://`)
    .bail()
    .isLength({ max: maxLength }).withMessage(`${label} is too long.`)
    .bail()
    .custom((value) => {
      if (value === '') return true;
      try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.');
      } catch {
        return false;
      }
    })
    .withMessage(`Please enter a valid link for ${label}.`);

/**
 * A list of short names (tech stack, skills): known spellings are used ("react" → "React"),
 * case-insensitive duplicates are dropped, then the size is checked.
 */
export const nameListRule = (field, label, { max, maxLength, suggestions = [], required = false }) => {
  const canonical = new Map(suggestions.map((name) => [name.toLowerCase(), name]));
  return (required ? body(field) : body(field).optional({ values: 'undefined' }))
    .custom(Array.isArray).withMessage(`${label} must be a list.`)
    .bail()
    .custom((list) => list.every((item) => typeof item === 'string')).withMessage(`${label} must be text.`)
    .bail()
    .customSanitizer((list) => {
      const seen = new Set();
      return list
        .map((item) => singleSpaced(item))
        .filter(Boolean)
        .map((item) => canonical.get(item.toLowerCase()) ?? item)
        .filter((item) => !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()));
    })
    .custom((list) => list.length <= max).withMessage(`Add up to ${max} ${label.toLowerCase()}.`)
    .bail()
    .custom((list) => list.every((item) => item.length <= maxLength)).withMessage(`Each entry can be up to ${maxLength} characters.`)
    .bail()
    .custom((list) => list.every((item) => LIST_ITEM.test(item))).withMessage(`${label} can use letters, numbers, spaces and . + # & / ( ) _ -`);
};

export const pageRules = ({ default: defaultSize, max }) => [
  query('page').default(1).isInt({ min: 1, max: 1000 }).withMessage('page must be a whole number from 1 to 1000.').bail().toInt(),
  query('limit').default(defaultSize).isInt({ min: 1, max }).withMessage(`limit must be a whole number from 1 to ${max}.`).bail().toInt(),
];

export const searchRule = () =>
  query('search')
    .optional({ values: 'falsy' })
    .isString().withMessage('Search must be text.')
    .bail()
    .customSanitizer(singleSpaced)
    .isLength({ max: 80 }).withMessage('Search is limited to 80 characters.');
