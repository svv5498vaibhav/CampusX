import { pdfSafe } from './characters';
import { textWidth } from './fonts';

/**
 * The resume layout engine. Templates describe a resume as blocks (paragraphs, rows, bullet lists, tags,
 * rules, columns); flows place the blocks into page frames and move to a new page when a block doesn't
 * fit, splitting paragraphs and lists between lines and keeping headings with what follows them. The
 * result is a list of drawing operations per A4 page, in points, which two renderers draw identically:
 * the SVG preview (components/resume/ResumePage.jsx) and the PDF (utils/resume/pdf.js). Nothing is ever
 * clipped: content that doesn't fit continues on the next page.
 *
 * Operations (y grows downwards; text y is the baseline):
 *   { t: 'text', x, y, text, font, style, size, color, cs, w }
 *   { t: 'rect', x, y, w, h, fill, stroke?, lw?, r? }      { t: 'line', x1, y1, x2, y2, color, lw }
 *   { t: 'circle', x, y, r, fill }                          { t: 'link', x, y, w, h, url }
 */

export const A4 = Object.freeze({ width: 595.28, height: 841.89 });
const EPS = 0.01;
// Where the baseline sits in a line box, as a share of the font size below the box's vertical centre.
const BASELINE = 0.78;

// ----------------------------------------------------------------------------- document

export function createDocument() {
  const pages = [];
  return {
    pages,
    overflow: false,
    page(index) {
      while (pages.length <= index) pages.push({ bg: [], fg: [] });
      return pages[index];
    },
  };
}

// ----------------------------------------------------------------------------- text

/**
 * Runs: [{ text, style: { font, style, size, color, cs }, url? }]. Splits into words and spaces, each
 * measured, then fills lines greedily. A word longer than a whole line is broken between characters.
 */
function tokenize(runs) {
  const tokens = [];
  for (const run of runs) {
    const text = pdfSafe(run.text);
    if (!text) continue;
    for (const part of text.split(/( )/)) {
      if (!part) continue;
      tokens.push({ text: part, run, space: part === ' ', w: textWidth(part, run.style) });
    }
  }
  return tokens;
}

function breakWord(token, limit) {
  const pieces = [];
  let current = '';
  for (const char of token.text) {
    if (current && textWidth(current + char, token.run.style) > limit) {
      pieces.push(current);
      current = char;
    } else current += char;
  }
  if (current) pieces.push(current);
  return pieces.map((text) => ({ ...token, text, w: textWidth(text, token.run.style) }));
}

function wrap(tokens, firstWidth, width) {
  const lines = [];
  let line = [];
  let lineWidth = 0;
  let limit = firstWidth;
  const finish = () => {
    while (line.length && line.at(-1).space) lineWidth -= line.pop().w;
    if (line.length) lines.push({ tokens: line, width: lineWidth });
    line = [];
    lineWidth = 0;
    limit = width;
  };
  for (const token of tokens) {
    if (token.space && !line.length) continue;
    if (lineWidth + token.w <= limit + EPS) {
      line.push(token);
      lineWidth += token.w;
      continue;
    }
    if (token.space) {
      finish();
      continue;
    }
    if (line.length) finish();
    const pieces = token.w > limit + EPS ? breakWord(token, limit) : [token];
    pieces.forEach((piece, index) => {
      if (index > 0) finish();
      line.push(piece);
      lineWidth += piece.w;
    });
  }
  finish();
  // Consecutive words of the same run become one drawing operation.
  return lines.map(({ tokens: items, width: lineW }) => {
    const segments = [];
    let x = 0;
    for (const token of items) {
      const last = segments.at(-1);
      if (last && last.run === token.run) {
        last.text += token.text;
        last.w += token.w;
      } else segments.push({ run: token.run, text: token.text, x, w: token.w });
      x += token.w;
    }
    return { segments, width: lineW };
  });
}

function drawLine(page, line, { x, baseline }) {
  for (const segment of line.segments) {
    const text = segment.text.replace(/\s+$/, '');
    if (!text.trim()) continue;
    const { style } = segment.run;
    const width = segment.text === text ? segment.w : textWidth(text, style);
    page.fg.push({ t: 'text', x: x + segment.x, y: baseline, text, font: style.font, style: style.style ?? 'normal', size: style.size, color: style.color ?? '#111827', cs: style.cs ?? 0, w: width });
    if (segment.run.url) page.fg.push({ t: 'link', x: x + segment.x, y: baseline - style.size * 0.85, w: width, h: style.size * 1.15, url: segment.run.url });
  }
}

function linesBlock(lines, options) {
  const { width, lineHeight, size, align = 'left', indent = 0, firstIndent = 0, minLines = 2 } = options;
  const height = lines.length * lineHeight;
  return {
    height,
    // Paragraphs of up to three lines stay whole; longer ones keep at least two lines on each page.
    minHead: lines.length <= minLines * 2 - 1 ? height : minLines * lineHeight,
    lines,
    draw(page, x, y) {
      lines.forEach((line, index) => {
        const offset = index === 0 ? firstIndent : indent;
        let left = x + offset;
        if (align === 'right') left = x + width - line.width;
        else if (align === 'center') left = x + (width - line.width) / 2;
        drawLine(page, line, { x: left, baseline: y + index * lineHeight + lineHeight / 2 - size / 2 + size * BASELINE });
      });
      options.decorate?.(page, x, y, lines[0]);
    },
    split(available) {
      if (lines.length <= minLines * 2 - 1) return null;
      const fit = Math.min(Math.floor((available + EPS) / lineHeight), lines.length - minLines);
      if (fit < minLines) return null;
      return [linesBlock(lines.slice(0, fit), options), linesBlock(lines.slice(fit), { ...options, firstIndent: indent, decorate: null })];
    },
  };
}

/**
 * A paragraph of styled runs, `width` points wide. `indent` indents every line after the first (hanging
 * indent for bullet points), `firstIndent` the first line. Returns null when there is no text.
 */
export function paragraph(runs, { width, lineHeight, size, align = 'left', indent = 0, firstIndent = 0, minLines = 2, decorate } = {}) {
  const list = (Array.isArray(runs) ? runs : [runs]).filter((run) => run && run.text);
  const baseSize = size ?? list[0]?.style.size ?? 10;
  const tokens = tokenize(list);
  if (!tokens.some((token) => !token.space)) return null;
  const lines = wrap(tokens, width - firstIndent, width - indent);
  return linesBlock(lines, { width, lineHeight: lineHeight ?? baseSize * 1.3, size: baseSize, align, indent, firstIndent, minLines, decorate });
}

/** Width of a single run of text (no wrapping). */
export const measure = (text, style) => textWidth(pdfSafe(text), style);

// ----------------------------------------------------------------------------- composite blocks

/**
 * Blocks one under another. `gap` (per child, before it) separates them. The first `keepFirst` children
 * stay together with at least the start of the next one, so an entry's title never sits alone at the
 * bottom of a page (Infinity keeps the whole stack together). `decorate(page, x, y, height)` draws a
 * background behind each part, so a card that continues on the next page keeps its background; children
 * are drawn `padX` points in from it.
 */
export function stack(children, { keepFirst = 1, padTop = 0, padBottom = 0, padX = 0, decorate } = {}) {
  const entries = children
    .map((child) => (child && child.block !== undefined ? child : { block: child, gap: 0 }))
    .filter((entry) => entry.block && entry.block.height > 0);
  if (!entries.length) return null;
  return stackOf(entries, { keepFirst, padTop, padBottom, padX, decorate });
}

function stackOf(entries, options) {
  const { keepFirst, padTop, padBottom, padX = 0, decorate } = options;
  const gapOf = (index) => (index ? entries[index].gap : 0);
  const height = padTop + padBottom + entries.reduce((sum, entry, index) => sum + gapOf(index) + entry.block.height, 0);
  const kept = Math.min(keepFirst, entries.length);
  let minHead = padTop + padBottom;
  entries.slice(0, kept).forEach((entry, index) => {
    minHead += gapOf(index) + entry.block.height;
  });
  if (kept < entries.length) minHead += gapOf(kept) + entries[kept].block.minHead;
  return {
    height,
    minHead: Math.min(minHead, height),
    draw(page, x, y) {
      decorate?.(page, x, y, height);
      let cursor = y + padTop;
      entries.forEach((entry, index) => {
        cursor += gapOf(index);
        entry.block.draw(page, x + padX, cursor);
        cursor += entry.block.height;
      });
    },
    split(available) {
      if (kept >= entries.length) return null;
      let used = padTop + padBottom;
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const gap = gapOf(index);
        if (used + gap + entry.block.height <= available + EPS) {
          used += gap + entry.block.height;
          continue;
        }
        if (index < kept) return null;
        const parts = entry.block.minHead <= available - used - gap + EPS ? entry.block.split?.(available - used - gap) : null;
        let head;
        let tail;
        if (parts?.[0]) {
          head = [...entries.slice(0, index), { block: parts[0], gap: entry.gap }];
          tail = [{ block: parts[1], gap: 0 }, ...entries.slice(index + 1)];
        } else {
          // Nothing of this child fits: the kept head alone would be a title without content.
          if (index <= kept) return null;
          head = entries.slice(0, index);
          tail = [{ ...entry, gap: 0 }, ...entries.slice(index + 1)];
        }
        return [stackOf(head, { ...options, keepFirst: Infinity }), stackOf(tail, { ...options, keepFirst: 1 })];
      }
      return null;
    },
  };
}

/** Moves a block `dx` points to the right (keeps working when split). */
export function offset(block, dx) {
  if (!block) return null;
  return {
    height: block.height,
    minHead: block.minHead,
    draw: (page, x, y) => block.draw(page, x + dx, y),
    split: block.split && ((available) => {
      const parts = block.split(available);
      return parts && [offset(parts[0], dx), offset(parts[1], dx)];
    }),
  };
}

/**
 * Two blocks side by side (a date column and an entry; a section label and its content). Only the right
 * block continues on the next page; the left one is drawn with the first part.
 */
export function columns(left, right, { leftWidth, gap = 0 }) {
  if (!right) return left;
  const shift = leftWidth + gap;
  const height = Math.max(left?.height ?? 0, right.height);
  return {
    height,
    minHead: Math.min(height, Math.max(left?.height ?? 0, right.minHead)),
    draw(page, x, y) {
      left?.draw(page, x, y);
      right.draw(page, x + shift, y);
    },
    split(available) {
      if ((left?.height ?? 0) > available + EPS) return null;
      const parts = right.split?.(available);
      if (!parts?.[0]) return null;
      return [columns(left, parts[0], { leftWidth, gap }), offset(parts[1], shift)];
    },
  };
}

/** A block that draws itself with `draw(page, x, y)` and is never split. */
export const fixed = (height, draw) => ({ height, minHead: height, draw });

/** A horizontal line across `width`, with space above and below. */
export function rule(width, { color = '#d1d5db', thickness = 0.75, before = 0, after = 0 } = {}) {
  return fixed(before + thickness + after, (page, x, y) => {
    const lineY = y + before + thickness / 2;
    page.fg.push({ t: 'line', x1: x, y1: lineY, x2: x + width, y2: lineY, color, lw: thickness });
  });
}

/**
 * Tags in rows (skills as chips). `style` is the text style; each tag gets `padX`/`padY` padding and a
 * rounded background (`fill`) and/or border (`stroke`). Splits between rows.
 */
export function chips(items, { width, style, padX = 5, padY = 2.5, gapX = 4, gapY = 4, fill, stroke, radius = 3 }) {
  const tags = items.map((item) => pdfSafe(item).trim()).filter(Boolean).map((text) => ({ text, w: textWidth(text, style) + padX * 2 }));
  if (!tags.length) return null;
  const rowHeight = style.size + padY * 2;
  const rows = [];
  let row = [];
  let used = 0;
  for (const tag of tags) {
    const w = Math.min(tag.w, width);
    if (row.length && used + gapX + w > width + EPS) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push({ ...tag, w });
    used += (row.length > 1 ? gapX : 0) + w;
  }
  rows.push(row);
  const build = (list) => {
    const height = list.length * rowHeight + (list.length - 1) * gapY;
    return {
      height,
      minHead: Math.min(height, rowHeight),
      draw(page, x, y) {
        list.forEach((items2, index) => {
          let left = x;
          const top = y + index * (rowHeight + gapY);
          for (const tag of items2) {
            page.bg.push({ t: 'rect', x: left, y: top, w: tag.w, h: rowHeight, fill, stroke, lw: stroke ? 0.6 : 0, r: radius });
            page.fg.push({ t: 'text', x: left + padX, y: top + padY + style.size * BASELINE, text: tag.text, font: style.font, style: style.style ?? 'normal', size: style.size, color: style.color, cs: style.cs ?? 0, w: tag.w - padX * 2 });
            left += tag.w + gapX;
          }
        });
      },
      split(available) {
        const fit = Math.floor((available + gapY + EPS) / (rowHeight + gapY));
        if (fit < 1 || fit >= list.length) return null;
        return [build(list.slice(0, fit)), build(list.slice(fit))];
      },
    };
  };
  return build(rows);
}

// ----------------------------------------------------------------------------- flows

/**
 * Places blocks down a column of frames, one frame per page: `frameAt(pageIndex)` → { x, top, bottom }.
 * Several flows can share a document (a sidebar and a main column).
 */
export class Flow {
  constructor(doc, frameAt, { page = 0 } = {}) {
    this.doc = doc;
    this.frameAt = frameAt;
    this.pageIndex = page;
    this.y = frameAt(page).top;
    this.fresh = true;
    doc.page(page);
  }

  get frame() {
    return this.frameAt(this.pageIndex);
  }

  get remaining() {
    return this.frame.bottom - this.y;
  }

  nextPage() {
    this.pageIndex += 1;
    this.doc.page(this.pageIndex);
    this.y = this.frame.top;
    this.fresh = true;
  }

  /** Vertical space; dropped at the top of a page. */
  gap(height) {
    if (!this.fresh) this.y += height;
  }

  add(block) {
    let current = block;
    for (let guard = 0; current && current.height > 0 && guard < 500; guard += 1) {
      const page = this.doc.page(this.pageIndex);
      if (current.height <= this.remaining + EPS) {
        current.draw(page, this.frame.x, this.y);
        this.y += current.height;
        this.fresh = false;
        return;
      }
      const parts = current.minHead <= this.remaining + EPS || this.fresh ? current.split?.(this.remaining) : null;
      if (parts?.[0]) {
        parts[0].draw(page, this.frame.x, this.y);
        this.nextPage();
        current = parts[1];
        continue;
      }
      if (this.fresh) {
        // Taller than a whole page and impossible to split: drawn anyway (never dropped) and reported.
        current.draw(page, this.frame.x, this.y);
        this.y += current.height;
        this.fresh = false;
        this.doc.overflow = true;
        return;
      }
      this.nextPage();
    }
  }

  /**
   * Adds blocks that belong together (a section heading and its first entry): when all but the last, plus
   * the start of the last, don't fit, they all start on the next page.
   */
  keep(blocks, gaps = []) {
    const list = blocks.filter((block) => block && block.height > 0);
    if (!list.length) return;
    let need = 0;
    list.forEach((block, index) => {
      need += (index ? (gaps[index] ?? 0) : 0) + (index === list.length - 1 ? block.minHead : block.height);
    });
    if (need > this.remaining + EPS && !this.fresh) this.nextPage();
    list.forEach((block, index) => {
      if (index) this.gap(gaps[index] ?? 0);
      this.add(block);
    });
  }
}
