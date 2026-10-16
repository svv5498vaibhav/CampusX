import { printable } from '../format';
import { columns, fixed, paragraph, rule, stack } from '../layout';
import { entriesFor, renderColumn } from './shared';
import { contactItems } from '../kit';

/**
 * Software Developer Fresher: a split header (name and contact on the left, GitHub/LinkedIn/portfolio
 * stacked on the right), headings marked by an accent bar, a two-column technical skills table, and
 * projects that lead with their repository links and a monospaced tech stack line.
 */
export default {
  id: 'software-developer-fresher',
  theme: { body: 9.8, small: 9, lh: 1.3 },
  render(ctx) {
    const { kit, theme, resume } = ctx;
    const { s, sp } = kit;
    const c = resume.content;
    const body = s(theme.body);
    const bold = s(10.4, { style: 'bold' });
    const muted = s(theme.small, { color: theme.muted });
    const mono = { ...s(8.6, { color: theme.muted }), font: 'courier' };
    const link = s(theme.small, { color: theme.accent });
    const contact = contactItems(c.personal);
    const plain = contact.filter((item) => item.kind !== 'link');
    const links = contact.filter((item) => item.kind === 'link');

    const heading = (title, width) => {
      const style = s(11.2, { style: 'bold', cs: 0.4 });
      const height = style.size * 1.45;
      const text = paragraph([{ text: title, style }], { width: width - sp(10), size: style.size, lineHeight: height });
      return fixed(height, (page, x, y) => {
        page.fg.push({ t: 'rect', x, y: y + height * 0.18, w: sp(3.2), h: height * 0.64, fill: theme.accent });
        text.draw(page, x + sp(9), y);
      });
    };

    const entry = (key, item, width) => {
      const isProject = key === 'projects';
      const titleRuns = [{ text: item.title, style: bold }];
      if (item.subtitle && key !== 'education') titleRuns.push({ text: `  —  ${item.subtitle}`, style: s(10, { style: 'italic', color: theme.muted }) });
      const right = isProject && item.links?.length ? kit.joined(item.links.map((entryLink) => ({ text: entryLink.label, url: entryLink.url })), { style: s(9, { style: 'bold', color: theme.accent }), separator: '  ·  ', separatorStyle: muted }) : [{ text: item.dates, style: muted }];
      const parts = [
        kit.row(titleRuns, right, { width, style: bold }),
        key === 'education' && kit.row([{ text: item.degree, style: s(10, { style: 'italic' }) }], [{ text: item.score, style: s(theme.small, { style: 'bold' }) }], { width }),
        isProject && (item.tech?.length || item.dates) && kit.row([{ text: item.tech?.length ? `Tech: ${item.tech.join(', ')}` : '', style: mono }], [{ text: item.dates, style: muted }], { width, style: mono }),
        !isProject && key !== 'education' && item.location && kit.para(item.location, { width, style: muted }),
        item.summary && kit.para(item.summary, { width, style: body }),
        item.coursework?.length && kit.para(kit.labelled('Relevant coursework', item.coursework.join(', '), { style: s(theme.small) }), { width, style: s(theme.small) }),
        !isProject && item.links?.length && kit.para(kit.joined(item.links.map((entryLink) => ({ text: entryLink.text, url: entryLink.url })), { style: link }), { width, style: link }),
        kit.bullets(item.bullets, { width, style: body, glyph: 'square', color: theme.accent, indent: sp(10) }),
      ].filter(Boolean);
      return stack(parts.map((block, index) => ({ block, gap: index ? sp(1.4) : 0 })), { keepFirst: 2 });
    };

    renderColumn(ctx, {
      margins: { top: 40, right: 44, bottom: 40, left: 44 },
      header: (width) => {
        const rightWidth = links.length ? Math.min(sp(190), width * 0.38) : 0;
        const leftWidth = width - rightWidth - (rightWidth ? sp(12) : 0);
        const left = stack(
          [
            kit.para(c.personal.fullName || 'Your Name', { width: leftWidth, style: s(22, { style: 'bold' }), lh: 1.12 }),
            c.personal.headline && { block: kit.para(c.personal.headline, { width: leftWidth, style: s(11, { color: theme.accent, style: 'bold' }) }), gap: sp(1) },
            plain.length && { block: kit.para(kit.joined(plain, { style: muted, separator: '  ·  ', linkStyle: muted }), { width: leftWidth, style: muted }), gap: sp(3) },
          ].filter(Boolean),
          { keepFirst: Infinity },
        );
        const right = links.length
          ? stack(
              links.map((item, index) => ({
                block: kit.para([{ text: item.label ? `${item.label}  ` : '', style: s(8.6, { style: 'bold', color: theme.muted }) }, { text: item.text, style: link, url: item.url }], { width: rightWidth, style: link, align: 'right' }),
                gap: index ? sp(1) : 0,
              })),
              { keepFirst: Infinity },
            )
          : null;
        return [right ? columns(left, right, { leftWidth, gap: sp(12) }) : left, rule(width, { color: theme.ink, thickness: 0.9, before: sp(8) })];
      },
      heading,
      firstSectionGap: sp(10),
      sectionGap: sp(11),
      headingGap: sp(4),
      entryGap: sp(7),
      section(key, { width }) {
        if (key === 'summary') return [kit.para(c.summary, { width, style: body })];
        if (key === 'coursework') return [kit.para(c.coursework.join('  ·  '), { width, style: body })];
        if (key === 'skills') {
          const labelWidth = sp(112);
          const rows = printable.skills(c).map((group) => columns(kit.para(group.label || 'Skills', { width: labelWidth, style: s(theme.body, { style: 'bold' }) }), kit.para(group.items.join(', '), { width: width - labelWidth - sp(8), style: body }), { leftWidth: labelWidth, gap: sp(8) }));
          return [stack(rows.map((block, index) => ({ block, gap: index ? sp(2.5) : 0 })), { keepFirst: 1 })];
        }
        return entriesFor(key, c).map((item) => entry(key, item, width));
      },
    });
  },
};
