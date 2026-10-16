import { printable } from '../format';
import { columns, rule, stack } from '../layout';
import { entriesFor, personalParts, renderColumn } from './shared';

/**
 * ATS Classic: the traditional left-aligned resume. Name on the left with contact details stacked on the
 * right, bold headings over a fine grey rule, "Role | Organisation" lines with dates on the right, and
 * skills set inline with bullet separators. Experience leads by default.
 */
export default {
  id: 'ats-classic',
  theme: { body: 10, small: 9.4, lh: 1.3 },
  render(ctx) {
    const { kit, theme, resume } = ctx;
    const { s, sp } = kit;
    const c = resume.content;
    const body = s(theme.body);
    const bold = s(10.4, { style: 'bold' });
    const muted = s(theme.small, { color: theme.muted });
    const { name, headline, contact } = personalParts(resume);

    const entry = (key, item, width) => {
      const isEducation = key === 'education';
      const title = isEducation ? [item.degree, item.institution].filter(Boolean).join(' | ') : [item.title, item.subtitle].filter(Boolean).join(' | ');
      const parts = [
        kit.row(title, [{ text: item.dates, style: s(theme.small, { style: 'bold' }) }], { width, style: bold }),
        (item.location || item.score || item.tech?.length) && kit.para([item.location, item.score, item.tech?.length ? item.tech.join(', ') : ''].filter(Boolean).join('  ·  '), { width, style: s(theme.small, { style: 'italic', color: theme.muted }) }),
        item.summary && kit.para(item.summary, { width, style: body }),
        item.coursework?.length && kit.para(kit.labelled('Relevant coursework', item.coursework.join(', '), { style: body }), { width, style: body }),
        item.links?.length && kit.para(kit.joined(item.links.map((link) => ({ text: `${link.label}: ${link.text}`, url: link.url })), { style: muted }), { width, style: muted }),
        kit.bullets(item.bullets, { width, style: body, glyph: 'dot', color: theme.ink }),
      ].filter(Boolean);
      return stack(parts.map((block, index) => ({ block, gap: index ? sp(1.2) : 0 })), { keepFirst: 2 });
    };

    renderColumn(ctx, {
      margins: { top: 42, right: 46, bottom: 42, left: 46 },
      header: (width) => {
        const rightWidth = contact.length ? Math.min(sp(210), width * 0.42) : 0;
        const leftWidth = width - rightWidth - (rightWidth ? sp(12) : 0);
        const left = stack([kit.para(name, { width: leftWidth, style: s(21, { style: 'bold', color: theme.accent }), lh: 1.12 }), headline && { block: kit.para(headline, { width: leftWidth, style: s(11, { color: theme.muted }) }), gap: sp(2) }].filter(Boolean), { keepFirst: Infinity });
        const right = contact.length ? stack(contact.map((item, index) => ({ block: kit.para([{ text: item.text, style: s(9.2), url: item.url }], { width: rightWidth, style: s(9.2), align: 'right' }), gap: index ? sp(0.4) : 0 })), { keepFirst: Infinity }) : null;
        return [right ? columns(left, right, { leftWidth, gap: sp(12) }) : left, rule(width, { color: theme.ink, thickness: 1.2, before: sp(7) })];
      },
      heading: (title, width) => stack([kit.para(title.toUpperCase(), { width, style: s(10.4, { style: 'bold', color: theme.accent, cs: 0.5 }), lh: 1.2 }), rule(width, { color: '#9ca3af', thickness: 0.5, before: sp(1.5) })], { keepFirst: Infinity }),
      firstSectionGap: sp(10),
      sectionGap: sp(11),
      headingGap: sp(5),
      entryGap: sp(7),
      section(key, { width }) {
        if (key === 'summary') return [kit.para(c.summary, { width, style: body })];
        if (key === 'skills') {
          const lines = printable.skills(c).map((group) => kit.para(kit.labelled(group.label, group.items.join('  •  '), { style: body, labelStyle: s(theme.body, { style: 'bold' }) }), { width, style: body }));
          return [stack(lines.map((block, index) => ({ block, gap: index ? sp(2) : 0 })), { keepFirst: 1 })];
        }
        if (key === 'coursework') return [kit.para(c.coursework.join('  •  '), { width, style: body })];
        return entriesFor(key, c).map((item) => entry(key, item, width));
      },
    });
  },
};
