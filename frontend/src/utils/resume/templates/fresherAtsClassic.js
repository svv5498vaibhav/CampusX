import { printable } from '../format';
import { rule, stack } from '../layout';
import { entriesFor, personalParts, renderColumn, skillLines } from './shared';

/**
 * Fresher ATS Classic: one column in black and white, centred name, full-width ruled headings, every
 * entry as "Title ........ Dates / subtitle ........ place" with round bullets. No colour, no graphics.
 */
export default {
  id: 'fresher-ats-classic',
  theme: { body: 10.4, small: 10, lh: 1.27 },
  render(ctx) {
    const { kit, theme, resume } = ctx;
    const { s, sp } = kit;
    const c = resume.content;
    const body = s(theme.body);
    const bold = s(theme.body, { style: 'bold' });
    const italic = s(theme.body, { style: 'italic' });
    const right = s(theme.small);
    const rightItalic = s(theme.small, { style: 'italic' });
    const { name, headline, contact } = personalParts(resume);

    const entry = (item, width, { linksLine = false } = {}) => {
      const titleRuns = [{ text: item.title, style: bold }];
      if (item.tech?.length) titleRuns.push({ text: ` | ${item.tech.join(', ')}`, style: italic });
      const parts = [
        kit.row(titleRuns, item.dates, { width, style: bold, rightStyle: right }),
        (item.subtitle || item.location || item.score) && kit.row([{ text: item.subtitle, style: italic }], [{ text: [item.location, item.score].filter(Boolean).join(' | '), style: rightItalic }], { width, style: italic, rightStyle: rightItalic }),
        item.summary && kit.para(item.summary, { width, style: body }),
        item.coursework?.length && kit.para(kit.labelled('Relevant coursework', item.coursework.join(', '), { style: body }), { width, style: body }),
        linksLine && item.links?.length && kit.para(kit.joined(item.links.map((link) => ({ text: `${link.label}: ${link.text}`, url: link.url })), { style: s(theme.small) }), { width, style: s(theme.small) }),
        kit.bullets(item.bullets, { width, style: body, glyph: 'dot', color: theme.ink }),
      ].filter(Boolean);
      return stack(parts.map((block, index) => ({ block, gap: index ? sp(1) : 0 })), { keepFirst: 2 });
    };

    renderColumn(ctx, {
      margins: { top: 44, right: 50, bottom: 44, left: 50 },
      header: (width) =>
        stack(
          [
            kit.para(name.toUpperCase(), { width, style: s(20, { style: 'bold', cs: 1.4 }), align: 'center', lh: 1.15 }),
            headline && { block: kit.para(headline, { width, style: s(11, { style: 'italic' }), align: 'center' }), gap: sp(2) },
            contact.length && { block: kit.para(kit.joined(contact, { style: s(9.6) }), { width, style: s(9.6), align: 'center' }), gap: sp(4) },
          ].filter(Boolean),
          { keepFirst: Infinity },
        ),
      heading: (title, width) => stack([kit.para(title.toUpperCase(), { width, style: s(11, { style: 'bold', cs: 0.9 }), lh: 1.2 }), rule(width, { color: theme.ink, thickness: 0.8, before: sp(1.5) })], { keepFirst: Infinity }),
      firstSectionGap: sp(10),
      sectionGap: sp(11),
      headingGap: sp(5),
      entryGap: sp(6),
      section(key, { width }) {
        if (key === 'summary') return [kit.para(c.summary, { width, style: body })];
        if (key === 'skills') return [stack(skillLines(kit, printable.skills(c), { width, style: body, labelStyle: bold }), { keepFirst: 1 })];
        if (key === 'coursework') return [kit.para(c.coursework.join(', '), { width, style: body })];
        return entriesFor(key, c).map((item) => entry(item, width, { linksLine: true }));
      },
    });
  },
};
