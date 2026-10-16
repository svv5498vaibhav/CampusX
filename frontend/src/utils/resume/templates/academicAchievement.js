import { printable } from '../format';
import { columns, measure, rule, stack } from '../layout';
import { entriesFor, personalParts, renderColumn, skillLines } from './shared';

/**
 * Academic & Achievement: a CV layout. Centred, letter-spaced name over a double rule; accent headings
 * with a fine rule; every entry hangs off a date column on the left; education reads degree first with
 * score and coursework; achievements are titled "Honors & Awards".
 */
export default {
  id: 'academic-achievement',
  theme: { body: 10.2, small: 9.6, lh: 1.28 },
  render(ctx) {
    const { kit, theme, resume } = ctx;
    const { s, sp } = kit;
    const c = resume.content;
    const body = s(theme.body);
    const bold = s(theme.body + 0.3, { style: 'bold' });
    const italic = s(theme.body, { style: 'italic' });
    const dateStyle = s(9.2, { color: theme.muted });
    const { name, headline, contact } = personalParts(resume);
    const dateWidth = sp(80);
    const gap = sp(10);

    // A range that doesn't fit the date column breaks after the dash, never inside a date.
    const dateBlock = (dates) => {
      if (!dates) return null;
      const parts = dates.split(' – ');
      if (parts.length === 1 || measure(dates, dateStyle) <= dateWidth) return kit.para(dates, { width: dateWidth, style: dateStyle });
      return stack([kit.para(`${parts[0]} –`, { width: dateWidth, style: dateStyle }), kit.para(parts.slice(1).join(' – '), { width: dateWidth, style: dateStyle })], { keepFirst: Infinity });
    };
    const withDate = (dates, content) => columns(dateBlock(dates), content, { leftWidth: dateWidth, gap });

    const entry = (key, item, width) => {
      const inner = width - dateWidth - gap;
      const isEducation = key === 'education';
      const parts = [
        kit.para(isEducation ? item.degree || item.institution : item.title, { width: inner, style: bold }),
        isEducation
          ? kit.para([item.degree ? item.institution : '', item.location].filter(Boolean).join(', '), { width: inner, style: italic })
          : (item.subtitle || item.location) && kit.para([item.subtitle, item.location].filter(Boolean).join(', '), { width: inner, style: italic }),
        item.score && kit.para(kit.labelled('Score', item.score, { style: body }), { width: inner, style: body }),
        item.coursework?.length && kit.para(kit.labelled('Coursework', item.coursework.join('; '), { style: body }), { width: inner, style: body }),
        item.tech?.length && kit.para(kit.labelled('Tools', item.tech.join(', '), { style: body }), { width: inner, style: body }),
        item.summary && kit.para(item.summary, { width: inner, style: body }),
        item.links?.length && kit.para(kit.joined(item.links.map((link) => ({ text: link.text, url: link.url })), { style: s(theme.small, { color: theme.accent }) }), { width: inner, style: s(theme.small) }),
        kit.bullets(item.bullets, { width: inner, style: body, glyph: 'dot', color: theme.accent }),
      ].filter(Boolean);
      return withDate(item.dates, stack(parts.map((block, index) => ({ block, gap: index ? sp(1) : 0 })), { keepFirst: 2 }));
    };

    renderColumn(ctx, {
      margins: { top: 46, right: 52, bottom: 46, left: 52 },
      header: (width) =>
        stack(
          [
            kit.para(name.toUpperCase(), { width, style: s(21, { cs: 2.2, color: theme.ink }), align: 'center', lh: 1.15 }),
            headline && { block: kit.para(headline, { width, style: s(11, { style: 'italic', color: theme.accent }), align: 'center' }), gap: sp(2) },
            contact.length && { block: kit.para(kit.joined(contact, { style: s(9.4, { color: theme.muted }), separator: '   ·   ', linkStyle: s(9.4, { color: theme.accent }) }), { width, style: s(9.4), align: 'center' }), gap: sp(4) },
            { block: rule(width, { color: theme.ink, thickness: 1.1, before: sp(8) }), gap: 0 },
            { block: rule(width, { color: theme.ink, thickness: 0.4, before: sp(1.6) }), gap: 0 },
          ].filter(Boolean),
          { keepFirst: Infinity },
        ),
      heading: (title, width) => stack([kit.para(title, { width, style: s(12, { style: 'bold', color: theme.accent }), lh: 1.2 }), rule(width, { color: theme.accent, thickness: 0.5, before: sp(1.5) })], { keepFirst: Infinity }),
      titles: { achievements: 'Honors & Awards', education: 'Academic Qualifications' },
      firstSectionGap: sp(12),
      sectionGap: sp(12),
      headingGap: sp(6),
      entryGap: sp(7),
      section(key, { width }) {
        if (key === 'summary') return [kit.para(c.summary, { width, style: body })];
        if (key === 'skills') return [stack(skillLines(kit, printable.skills(c), { width, style: body, labelStyle: s(theme.body, { style: 'bold' }) }), { keepFirst: 1 })];
        if (key === 'coursework') return [kit.para(c.coursework.join('; '), { width, style: body })];
        return entriesFor(key, c).map((item) => entry(key, item, width));
      },
    });
  },
};
