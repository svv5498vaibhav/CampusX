import { SCORE_WEIGHTS } from '../data/searchOptions.js';
import { wordPattern } from './searchQuery.js';

/*
 * The one place relevance is decided, with the weights in data/searchOptions.js (SCORE_WEIGHTS). The same
 * rules run in two forms: calculateSearchScore() in JavaScript for small in-memory lists (suggestions),
 * and scoreExpression() as a MongoDB expression, so result pages are ranked and paginated inside the
 * database without loading every match.
 *
 *   exact    the name/title is the whole query            prefix  it starts with the query
 *   word     each query word starting a name/title word   whole   …and being a whole word of it
 *   tag      each query word matching a tag/skill
 *   option   each matched type/category/campus option     author  a post by a student whose name matches
 *   keyword  MongoDB's text-index score (title words weigh more than description words), capped
 *   recent / featured small boosts                       closed  opportunities no longer open sink
 */

const W = SCORE_WEIGHTS;
const DAY_MS = 24 * 60 * 60 * 1000;

const asList = (value) => (Array.isArray(value) ? value : value ? [value] : []);

/**
 * Score for one item described by plain values:
 *   { title, tags: [..], options: number of matched options, date, featured, closed, keywordScore }
 */
export function calculateSearchScore(item, query, now = new Date()) {
  const title = String(item.title ?? '').toLowerCase();
  let score = 0;
  if (title) {
    if (title === query.lower) score += W.exact;
    if (title.startsWith(query.lower)) score += W.prefix;
    score += query.words.filter((word) => wordPattern(word).test(title)).length * W.word;
    score += query.words.filter((word) => wordPattern(word, { prefix: false }).test(title)).length * W.whole;
  }
  const tags = asList(item.tags);
  score += query.words.filter((word) => tags.some((tag) => wordPattern(word).test(tag))).length * W.tag;
  score += (item.options ?? 0) * W.option;
  score += Math.min(W.keywordCap, (item.keywordScore ?? 0) * W.keyword);
  if (item.date) {
    const age = now.getTime() - new Date(item.date).getTime();
    score += W.recent.find(({ days }) => age <= days * DAY_MS)?.boost ?? 0;
  }
  if (item.featured) score += W.featured;
  if (item.closed) score += W.closed;
  return score;
}

// ----------------------------------------------------------------------------- the database form

const field = (path) => (path.startsWith('$') ? path : `$${path}`);
const when = (condition, points) => ({ $cond: [condition, points, 0] });
const lowered = (expression) => ({ $toLower: { $ifNull: [expression, ''] } });

/** Whether a field (a string, or a list of strings) has an entry the pattern matches. */
const anyMatches = (path, pattern) => ({
  $gt: [
    {
      $size: {
        $filter: {
          input: { $cond: [{ $isArray: field(path) }, field(path), { $cond: [{ $eq: [{ $type: field(path) }, 'string'] }, [field(path)], []] }] },
          cond: { $regexMatch: { input: '$$this', regex: pattern } },
        },
      },
    },
    0,
  ],
});

/** Whether a field (a value, or a list of values) holds one of the ids. */
const holdsAny = (path, ids) => ({
  $gt: [{ $size: { $setIntersection: [{ $cond: [{ $isArray: field(path) }, field(path), [field(path)]] }, ids] } }, 0],
});

/**
 * The score as an aggregation expression. `spec` describes a collection:
 *   title     the name/title expression (a path like 'title' or an expression object)
 *   tags      paths of skill/tag-like fields (strings or lists)
 *   options   { path: [matched ids] }
 *   authors   { path, ids } for "posts by <name>"
 *   keyword   true when the query used the text index ($text), so its score exists
 *   date      path of the date that counts for "recent"
 *   featured  path of a featured flag
 *   closed    an expression that is true for items that should sink (closed opportunities)
 */
export function scoreExpression(spec, query, now = new Date()) {
  const parts = [];
  if (spec.title) {
    const title = lowered(typeof spec.title === 'string' ? field(spec.title) : spec.title);
    parts.push(when({ $eq: [title, query.lower] }, W.exact));
    parts.push(when({ $eq: [{ $indexOfCP: [title, query.lower] }, 0] }, W.prefix));
    for (const word of query.words) {
      parts.push(when({ $regexMatch: { input: title, regex: wordPattern(word) } }, W.word));
      parts.push(when({ $regexMatch: { input: title, regex: wordPattern(word, { prefix: false }) } }, W.whole));
    }
  }
  for (const word of query.words) {
    const pattern = wordPattern(word);
    if (spec.tags?.length) parts.push(when({ $or: spec.tags.map((path) => anyMatches(path, pattern)) }, W.tag));
  }
  for (const [path, ids] of Object.entries(spec.options ?? {})) {
    if (ids?.length) parts.push(when(holdsAny(path, ids), W.option));
  }
  if (spec.authors?.ids.length) parts.push(when({ $in: [field(spec.authors.path), spec.authors.ids] }, W.author));
  if (spec.keyword) parts.push({ $min: [W.keywordCap, { $multiply: [W.keyword, { $ifNull: [{ $meta: 'textScore' }, 0] }] }] });
  if (spec.date) {
    parts.push({
      $switch: {
        branches: W.recent.map(({ days, boost }) => ({ case: { $gte: [field(spec.date), new Date(now.getTime() - days * DAY_MS)] }, then: boost })),
        default: 0,
      },
    });
  }
  if (spec.featured) parts.push(when({ $eq: [field(spec.featured), true] }, W.featured));
  if (spec.closed) parts.push(when(spec.closed, W.closed));
  return parts.length ? { $add: parts } : 0;
}
