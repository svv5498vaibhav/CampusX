import { printable } from '../format';
import { stack } from '../layout';
import { entriesFor, personalParts, renderColumn, skillLines } from './shared';

/**
 * Minimal One-Page Fresher: narrow margins, small letter-spaced section labels without rules, each entry's
 * title, organisation and dates on one line, and dash bullets. Built to fit one page at 9 pt or more.
 */
export default {
  id: 'minimal-one-page',
  theme: { body: 9.6, small: 9, lh: 1.24 },
  render(ctx) {
    const { kit, theme, resume } = ctx;
    const { s, sp } = kit;
    const c = resume.content;
    const body = s(theme.body);
    const bold = s(theme.body, { style: 'bold' });
    const muted = s(theme.small, { color: theme.muted });
    const { name, headline, contact } = personalParts(resume);

    const entry = (key, item, width) => {
      const titleRuns = [{ text: item.title, style: bold }];
      const second = key === 'education' ? item.degree : item.subtitle;
      if (second && key !== 'education') titleRuns.push({ text: `, ${second}`, style: body });
      const parts = [
        kit.row(titleRuns, [{ text: [item.location, item.dates].filter(Boolean).join('  ·  '), style: muted }], { width, style: bold }),
        key === 'education' && (item.degree || item.score) && kit.para([{ text: item.degree, style: body }, { text: item.score ? `${item.degree ? '  ·  ' : ''}${item.score}` : '', style: bold }], { width, style: body }),
        item.tech?.length && kit.para(item.tech.join(', '), { width, style: s(theme.small, { style: 'italic', color: theme.muted }) }),
        item.summary && kit.para(item.summary, { width, style: body }),
        item.coursework?.length && kit.para(kit.labelled('Coursework', item.coursework.join(', '), { style: body }), { width, style: body }),
        item.links?.length && kit.para(kit.joined(item.links.map((link) => ({ text: link.text, url: link.url })), { style: s(theme.small, { color: theme.accent }), separator: '  ·  ' }), { width, style: s(theme.small) }),
        kit.bullets(item.bullets, { width, style: body, glyph: 'dash', color: theme.muted, indent: sp(9), gap: sp(0.6) }),
      ].filter(Boolean);
      return stack(parts.map((block, index) => ({ block, gap: index ? sp(0.6) : 0 })), { keepFirst: 2 });
    };

    renderColumn(ctx, {
      margins: { top: 32, right: 36, bottom: 32, left: 36 },
      header: (width) =>
        stack(
          [
            kit.para([{ text: name, style: s(17, { style: 'bold' }) }, { text: headline ? `   ${headline}` : '', style: s(10.5, { color: theme.muted }) }], { width, style: s(17), lh: 1.15 }),
            contact.length && { block: kit.para(kit.joined(contact, { style: muted, separator: '  ·  ', linkStyle: s(theme.small, { color: theme.accent }) }), { width, style: muted }), gap: sp(2) },
          ].filter(Boolean),
          { keepFirst: Infinity },
        ),
      heading: (title, width) => kit.para(title.toUpperCase(), { width, style: s(8.4, { style: 'bold', color: theme.accent === theme.ink ? theme.muted : theme.accent, cs: 1.7 }), lh: 1.3 }),
      firstSectionGap: sp(8),
      sectionGap: sp(8),
      headingGap: sp(2.5),
      entryGap: sp(4),
      section(key, { width }) {
        if (key === 'summary') return [kit.para(c.summary, { width, style: body })];
        if (key === 'skills') return [stack(skillLines(kit, printable.skills(c), { width, style: body, labelStyle: bold, gap: sp(1) }), { keepFirst: 1 })];
        if (key === 'coursework') return [kit.para(c.coursework.join(', '), { width, style: body })];
        return entriesFor(key, c).map((item) => entry(key, item, width));
      },
    });
  },
};
