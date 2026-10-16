import { contactItems, dateRange, degreeLine, displayUrl, formatDate, printable, clean } from './format';
import { measure, paragraph, stack } from './layout';

/**
 * Building blocks every template shares, sized by the theme (font, colours, density scale), and the
 * mapping from saved content to printable entries. Templates combine these differently; nothing here
 * decides a layout.
 */

const BASELINE = 0.78;

/** Mixes a hex colour with white: tint('#166534', 0.9) → a pale green. */
export function tint(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift) => Math.round(((value >> shift) & 255) + (255 - ((value >> shift) & 255)) * amount);
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

export function createKit(theme) {
  const k = theme.scale;

  /** A text style at `size` points (scaled by density). */
  const s = (size, overrides = {}) => ({ font: theme.font, style: 'normal', size: size * k, color: theme.ink, cs: 0, ...overrides, ...(overrides.size && { size: overrides.size * k }) });
  /** A distance in points, scaled by density. */
  const sp = (value) => value * k;

  /** A paragraph from text or runs; `lh` is the line height as a multiple of the size. */
  function para(content, { width, style = s(theme.body), lh = theme.lh, align, indent, firstIndent, decorate } = {}) {
    const runs = typeof content === 'string' ? [{ text: content, style }] : content;
    return paragraph(runs, { width, size: style.size, lineHeight: style.size * lh, align, indent, firstIndent, decorate });
  }

  const runsWidth = (runs) => runs.reduce((sum, run) => sum + measure(run.text, run.style), 0);

  /**
   * A line with text on the left (wrapping) and text on the right of its first line (dates, location).
   * When the right side is very wide it moves under the left side instead.
   */
  function row(left, right, { width, style = s(theme.body), rightStyle = s(theme.small, { color: theme.muted }), lh = theme.lh, gap = sp(10) } = {}) {
    const leftRuns = (typeof left === 'string' ? [{ text: left, style }] : left).filter((run) => run.text);
    const rightRuns = (typeof right === 'string' ? [{ text: right, style: rightStyle }] : right ?? []).filter((run) => run.text);
    const hasText = (runs) => runs.some((run) => clean(run.text));
    if (!hasText(rightRuns)) return para(leftRuns, { width, style, lh });
    const rightWidth = runsWidth(rightRuns) + 0.5;
    if (!hasText(leftRuns)) return para(rightRuns, { width, style: rightRuns[0].style, lh, align: 'right' });
    if (rightWidth > width * 0.55) return stack([para(leftRuns, { width, style, lh }), para(rightRuns, { width, style: rightRuns[0].style, lh })], { keepFirst: Infinity });
    const rightBlock = paragraph(rightRuns, { width: rightWidth, size: style.size, lineHeight: style.size * lh, align: 'right' });
    return paragraph(leftRuns, {
      width: width - rightWidth - gap,
      size: style.size,
      lineHeight: style.size * lh,
      decorate: (page, x, y) => rightBlock?.draw(page, x + width - rightWidth, y),
    });
  }

  /**
   * Bullet points with a hanging indent. glyph: 'dot' | 'dash' | 'square' | 'bar'.
   */
  function bullets(items, { width, style = s(theme.body), lh = theme.lh, glyph = 'dot', indent = sp(11), gap = sp(1.5), color = style.color } = {}) {
    const list = (items ?? []).map(clean).filter(Boolean);
    if (!list.length) return null;
    const blocks = list.map((text) =>
      para(text, {
        width,
        style,
        lh,
        indent,
        firstIndent: indent,
        decorate: (page, x, y) => {
          const baseline = y + (style.size * lh) / 2 - style.size / 2 + style.size * BASELINE;
          const mid = baseline - style.size * 0.31;
          if (glyph === 'dash') page.fg.push({ t: 'line', x1: x + indent * 0.15, y1: mid, x2: x + indent * 0.55, y2: mid, color, lw: Math.max(0.6, style.size * 0.07) });
          else if (glyph === 'square') page.fg.push({ t: 'rect', x: x + indent * 0.25, y: mid - style.size * 0.12, w: style.size * 0.24, h: style.size * 0.24, fill: color });
          else if (glyph === 'bar') page.fg.push({ t: 'rect', x: x + indent * 0.25, y: mid - style.size * 0.3, w: Math.max(1, style.size * 0.12), h: style.size * 0.6, fill: color });
          else page.fg.push({ t: 'circle', x: x + indent * 0.38, y: mid, r: Math.max(0.9, style.size * 0.12), fill: color });
        },
      }),
    );
    return stack(blocks.map((block, index) => ({ block, gap: index ? gap : 0 })), { keepFirst: 0 });
  }

  /** Runs joined by a separator, e.g. contact details "a  |  b  |  c". */
  function joined(items, { style, separator = '  |  ', separatorStyle = style, linkStyle = style }) {
    const runs = [];
    items.forEach((item, index) => {
      if (index) runs.push({ text: separator, style: separatorStyle });
      runs.push({ text: item.text, style: item.url ? linkStyle : style, url: item.url });
    });
    return runs;
  }

  /** "Label: a, b, c" with the label in bold. */
  const labelled = (label, text, { style = s(theme.body), labelStyle = { ...style, style: theme.boldStyle } } = {}) =>
    clean(text) ? [...(clean(label) ? [{ text: `${clean(label)}: `, style: labelStyle }] : []), { text, style }] : [];

  return { s, sp, para, row, bullets, joined, labelled, theme, runsWidth };
}

// ----------------------------------------------------------------------------- printable entries

/**
 * Every section's items in one shape templates can lay out:
 *   { id, title, subtitle, dates, location, score, summary, bullets, tech, links: [{ label, url, text }], coursework }
 */
export function entriesFor(key, content) {
  switch (key) {
    case 'education':
      return printable.education(content).map((item) => ({
        id: item.id,
        title: clean(item.institution),
        subtitle: degreeLine(item),
        degree: degreeLine(item),
        institution: clean(item.institution),
        dates: dateRange(item.startDate, item.endDate, { expected: true }),
        location: clean(item.location),
        score: clean(item.score),
        coursework: item.coursework.map(clean).filter(Boolean),
        bullets: item.details,
      }));
    case 'projects':
      return printable.projects(content).map((item) => ({
        id: item.id,
        title: clean(item.name),
        subtitle: clean(item.role),
        dates: dateRange(item.startDate, item.endDate),
        tech: item.tech.map(clean).filter(Boolean),
        summary: clean(item.summary),
        bullets: item.bullets,
        links: [
          item.github && { label: /github\.com/i.test(item.github) ? 'GitHub' : 'Code', url: item.github, text: displayUrl(item.github) },
          item.live && { label: 'Live', url: item.live, text: displayUrl(item.live) },
        ].filter(Boolean),
      }));
    case 'experience':
      return printable.experience(content).map((item) => ({ id: item.id, title: clean(item.role), subtitle: clean(item.organization), dates: dateRange(item.startDate, item.endDate), location: clean(item.location), bullets: item.bullets }));
    case 'volunteering':
      return printable.volunteering(content).map((item) => ({ id: item.id, title: clean(item.role), subtitle: clean(item.organization), dates: dateRange(item.startDate, item.endDate), bullets: item.bullets }));
    case 'achievements':
      return printable.achievements(content).map((item) => ({ id: item.id, title: clean(item.title), subtitle: clean(item.organization), dates: formatDate(item.date), summary: clean(item.description), bullets: [] }));
    case 'certifications':
      return printable.certifications(content).map((item) => ({ id: item.id, title: clean(item.name), subtitle: clean(item.issuer), dates: formatDate(item.date), links: item.url ? [{ label: 'Credential', url: item.url, text: displayUrl(item.url) }] : [], bullets: [] }));
    case 'custom-1':
    case 'custom-2':
      return printable.custom(content, Number(key.slice(7)) - 1).map((item) => ({ id: item.id, title: clean(item.title), subtitle: clean(item.subtitle), dates: clean(item.date), bullets: item.bullets }));
    default:
      return [];
  }
}

export { contactItems, displayUrl };
