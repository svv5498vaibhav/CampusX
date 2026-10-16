import { tint } from '../kit';
import { printable } from '../format';
import { chips, columns, fixed, measure, paragraph, rule, stack } from '../layout';
import { entriesFor, personalParts, renderColumn } from './shared';

/**
 * Modern Graduate: a large name in the accent colour over an accent rule, letter-spaced headings that
 * run into a hairline, degree-first education with the score set apart, and skills as tinted tags.
 */
export default {
  id: 'modern-graduate',
  theme: { body: 10, small: 9, lh: 1.32 },
  render(ctx) {
    const { kit, theme, resume } = ctx;
    const { s, sp } = kit;
    const c = resume.content;
    const body = s(theme.body);
    const bold = s(10.5, { style: 'bold' });
    const muted = s(theme.small, { color: theme.muted });
    const accentText = s(theme.small, { color: theme.accent });
    const { name, headline, contact } = personalParts(resume);
    const pale = tint(theme.accent, 0.88);

    const heading = (title, width) => {
      const style = s(10, { style: 'bold', color: theme.accent, cs: 1.5 });
      const text = title.toUpperCase();
      const textWidth = measure(text, style);
      const height = style.size * 1.5;
      const block = paragraph([{ text, style }], { width, size: style.size, lineHeight: height });
      return fixed(height, (page, x, y) => {
        block.draw(page, x, y);
        const lineY = y + height / 2 + 0.5;
        if (textWidth + 10 < width) page.fg.push({ t: 'line', x1: x + textWidth + 8, y1: lineY, x2: x + width, y2: lineY, color: tint(theme.accent, 0.6), lw: 0.6 });
      });
    };

    const entry = (key, item, width) => {
      const isEducation = key === 'education';
      const title = isEducation ? item.degree || item.institution : item.title;
      const subtitle = isEducation ? [item.degree ? item.institution : '', item.location].filter(Boolean).join(' · ') : [item.subtitle, item.location].filter(Boolean).join(' · ');
      const parts = [
        kit.row(title, item.dates, { width, style: bold, rightStyle: muted }),
        (subtitle || item.score) && kit.row([{ text: subtitle, style: muted }], [{ text: item.score, style: s(theme.small, { style: 'bold', color: theme.accent }) }], { width, style: muted }),
        item.tech?.length && kit.para(item.tech.join('  ·  '), { width, style: accentText }),
        item.links?.length && kit.para(kit.joined(item.links.map((link) => ({ text: link.text, url: link.url })), { style: accentText, separator: '   ' }), { width, style: accentText }),
        item.summary && kit.para(item.summary, { width, style: body }),
        item.coursework?.length && kit.para(kit.labelled('Coursework', item.coursework.join(', '), { style: s(theme.small, { color: theme.muted }) }), { width, style: muted }),
        kit.bullets(item.bullets, { width, style: body, glyph: 'dot', color: theme.accent }),
      ].filter(Boolean);
      return stack(parts.map((block, index) => ({ block, gap: index ? sp(1.5) : 0 })), { keepFirst: 2 });
    };

    renderColumn(ctx, {
      margins: { top: 42, right: 46, bottom: 42, left: 46 },
      header: (width) =>
        stack(
          [
            kit.para(name, { width, style: s(25, { style: 'bold', color: theme.accent }), lh: 1.1 }),
            headline && { block: kit.para(headline, { width, style: s(11.5, { color: theme.muted }) }), gap: sp(2) },
            contact.length && { block: kit.para(kit.joined(contact, { style: s(9, { color: theme.muted }), separator: '   •   ', linkStyle: s(9, { color: theme.accent }) }), { width, style: s(9) }), gap: sp(5) },
            { block: rule(width, { color: theme.accent, thickness: 2, before: sp(7) }), gap: 0 },
          ].filter(Boolean),
          { keepFirst: Infinity },
        ),
      heading,
      firstSectionGap: sp(12),
      sectionGap: sp(13),
      headingGap: sp(5),
      entryGap: sp(8),
      section(key, { width }) {
        if (key === 'summary') return [kit.para(c.summary, { width, style: body })];
        if (key === 'coursework') return [chips(c.coursework, { width, style: s(8.6, { color: theme.ink }), fill: '#f3f4f6', padX: sp(5), padY: sp(2.4), radius: 3 })];
        if (key === 'skills') {
          const rows = printable.skills(c).map((group) => {
            const label = kit.para(group.label, { width: sp(98), style: s(8.6, { style: 'bold', color: theme.muted, cs: 0.3 }), lh: 1.9 });
            const tags = chips(group.items, { width: width - sp(106), style: s(8.6, { color: theme.ink }), fill: pale, padX: sp(5), padY: sp(2.4), radius: 3 });
            return columns(label, tags, { leftWidth: sp(98), gap: sp(8) });
          });
          return [stack(rows.map((block, index) => ({ block, gap: index ? sp(5) : 0 })), { keepFirst: 1 })];
        }
        return entriesFor(key, c).map((item) => entry(key, item, width));
      },
    });
  },
};
