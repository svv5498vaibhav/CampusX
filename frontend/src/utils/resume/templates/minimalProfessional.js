import { printable } from '../format';
import { rule, stack } from '../layout';
import { entriesFor, personalParts, renderColumn, skillLines } from './shared';

/**
 * Minimal Professional: generous white space, a light (not bold) name, section names in a side margin
 * beside their content, and fine rules between sections.
 */
export default {
  id: 'minimal-professional',
  theme: { body: 9.8, small: 9, lh: 1.36 },
  render(ctx) {
    const { kit, theme, resume } = ctx;
    const { s, sp } = kit;
    const c = resume.content;
    const body = s(theme.body);
    const bold = s(10.2, { style: 'bold' });
    const muted = s(theme.small, { color: theme.muted });
    const { name, headline, contact } = personalParts(resume);
    const labelWidth = sp(104);
    const labelGap = sp(16);

    const entry = (key, item, width) => {
      const isEducation = key === 'education';
      const subtitle = isEducation ? [item.degree, item.location].filter(Boolean).join(', ') : [item.subtitle, item.location].filter(Boolean).join(', ');
      const parts = [
        kit.row(item.title, [{ text: item.dates, style: muted }], { width, style: bold }),
        subtitle && kit.para(subtitle, { width, style: s(theme.body, { color: theme.muted }) }),
        item.score && kit.para(item.score, { width, style: muted }),
        item.tech?.length && kit.para(item.tech.join(' / '), { width, style: s(theme.small, { color: theme.accent }) }),
        item.summary && kit.para(item.summary, { width, style: body }),
        item.coursework?.length && kit.para(kit.labelled('Coursework', item.coursework.join(', '), { style: muted }), { width, style: muted }),
        item.links?.length && kit.para(kit.joined(item.links.map((link) => ({ text: link.text, url: link.url })), { style: s(theme.small, { color: theme.accent }), separator: '   /   ' }), { width, style: muted }),
        kit.bullets(item.bullets, { width, style: body, glyph: 'dash', color: theme.subtle, indent: sp(11) }),
      ].filter(Boolean);
      return stack(parts.map((block, index) => ({ block, gap: index ? sp(1.6) : 0 })), { keepFirst: 2 });
    };

    renderColumn(ctx, {
      margins: { top: 54, right: 54, bottom: 50, left: 54 },
      header: (width) =>
        stack(
          [
            kit.para(name, { width, style: s(27, { color: theme.ink, cs: -0.3 }), lh: 1.1 }),
            headline && { block: kit.para(headline, { width, style: s(11.5, { color: theme.accent }) }), gap: sp(3) },
            contact.length && { block: kit.para(kit.joined(contact, { style: muted, separator: '   /   ', linkStyle: s(theme.small, { color: theme.ink }) }), { width, style: muted }), gap: sp(6) },
          ].filter(Boolean),
          { keepFirst: Infinity },
        ),
      side: {
        width: labelWidth,
        gap: labelGap,
        label: (title) => kit.para(title.toUpperCase(), { width: labelWidth, style: s(8.2, { style: 'bold', color: theme.accent === theme.ink ? theme.muted : theme.accent, cs: 1.5 }), lh: 1.55 }),
      },
      divider: (width) => rule(width, { color: '#e5e7eb', thickness: 0.6 }),
      dividerGap: sp(12),
      firstSectionGap: sp(20),
      sectionGap: sp(12),
      entryGap: sp(9),
      section(key, { width }) {
        if (key === 'summary') return [kit.para(c.summary, { width, style: body })];
        if (key === 'skills') return [stack(skillLines(kit, printable.skills(c), { width, style: body, labelStyle: s(theme.body, { style: 'bold' }), gap: sp(3) }), { keepFirst: 1 })];
        if (key === 'coursework') return [kit.para(c.coursework.join(', '), { width, style: body })];
        return entriesFor(key, c).map((item) => entry(key, item, width));
      },
    });
  },
};
