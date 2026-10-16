import { tint } from '../kit';
import { printable } from '../format';
import { columns, fixed, paragraph, stack } from '../layout';
import { entriesFor, personalParts, renderColumn, skillLines } from './shared';

/**
 * Internship Applicant: name and target role on the left with contact details stacked on the right, the
 * career objective in a tinted box near the top, headings set in full-width tinted bands, and compact
 * entries with dash bullets.
 */
export default {
  id: 'internship-applicant',
  theme: { body: 9.8, small: 9, lh: 1.3 },
  render(ctx) {
    const { kit, theme, resume } = ctx;
    const { s, sp } = kit;
    const c = resume.content;
    const body = s(theme.body);
    const bold = s(10.2, { style: 'bold' });
    const muted = s(theme.small, { color: theme.muted });
    const band = tint(theme.accent, 0.87);
    const { name, headline, contact } = personalParts(resume);

    const heading = (title, width) => {
      const style = s(9.4, { style: 'bold', color: theme.accent, cs: 1.1 });
      const height = style.size + sp(8);
      const text = paragraph([{ text: title.toUpperCase(), style }], { width: width - sp(12), size: style.size, lineHeight: height });
      return fixed(height, (page, x, y) => {
        page.bg.push({ t: 'rect', x, y, w: width, h: height, fill: band, r: 2 });
        text.draw(page, x + sp(7), y);
      });
    };

    const entry = (key, item, width) => {
      const isEducation = key === 'education';
      const subtitle = isEducation ? [item.degree, item.score].filter(Boolean).join('  |  ') : item.subtitle;
      const parts = [
        kit.row(item.title, [{ text: item.dates, style: muted }], { width, style: bold }),
        (subtitle || item.location) && kit.row([{ text: subtitle, style: s(theme.body, { style: 'italic', color: theme.muted }) }], [{ text: item.location, style: muted }], { width }),
        item.tech?.length && kit.para(kit.labelled('Tools', item.tech.join(', '), { style: muted, labelStyle: s(theme.small, { style: 'bold', color: theme.muted }) }), { width, style: muted }),
        item.summary && kit.para(item.summary, { width, style: body }),
        item.coursework?.length && kit.para(kit.labelled('Coursework', item.coursework.join(', '), { style: muted }), { width, style: muted }),
        item.links?.length && kit.para(kit.joined(item.links.map((link) => ({ text: link.text, url: link.url })), { style: s(theme.small, { color: theme.accent }) }), { width, style: s(theme.small) }),
        kit.bullets(item.bullets, { width, style: body, glyph: 'dash', color: theme.accent, indent: sp(10) }),
      ].filter(Boolean);
      return stack(parts.map((block, index) => ({ block, gap: index ? sp(1.2) : 0 })), { keepFirst: 2 });
    };

    const objective = (width, title) => {
      const pad = sp(9);
      const inner = width - pad * 2;
      return stack(
        [kit.para(title.toUpperCase(), { width: inner, style: s(8.4, { style: 'bold', color: theme.accent, cs: 1.2 }) }), { block: kit.para(c.summary, { width: inner, style: body }), gap: sp(2) }],
        {
          keepFirst: Infinity,
          padTop: pad * 0.8,
          padBottom: pad * 0.8,
          padX: pad,
          decorate: (page, x, y, height) => {
            page.bg.push({ t: 'rect', x, y, w: width, h: height, fill: tint(theme.accent, 0.93), r: 4 });
            page.bg.push({ t: 'rect', x, y, w: sp(3), h: height, fill: theme.accent });
          },
        },
      );
    };

    renderColumn(ctx, {
      margins: { top: 40, right: 44, bottom: 40, left: 44 },
      header: (width) => {
        const rightWidth = contact.length ? Math.min(sp(200), width * 0.42) : 0;
        const leftWidth = width - rightWidth - (rightWidth ? sp(12) : 0);
        const left = stack([kit.para(name, { width: leftWidth, style: s(22, { style: 'bold' }), lh: 1.12 }), headline && { block: kit.para(headline, { width: leftWidth, style: s(11.5, { color: theme.accent }) }), gap: sp(2) }].filter(Boolean), { keepFirst: Infinity });
        if (!contact.length) return left;
        const right = stack(
          contact.map((item, index) => ({ block: kit.para([{ text: item.text, style: item.url && item.kind === 'link' ? s(9, { color: theme.accent }) : s(9, { color: theme.muted }), url: item.url }], { width: rightWidth, style: s(9), align: 'right' }), gap: index ? sp(0.5) : 0 })),
          { keepFirst: Infinity },
        );
        return columns(left, right, { leftWidth, gap: sp(12) });
      },
      heading,
      headless: ['summary'],
      titles: { summary: 'Career Objective', achievements: 'Achievements & Activities' },
      firstSectionGap: sp(12),
      sectionGap: sp(11),
      headingGap: sp(5),
      entryGap: sp(6),
      section(key, { width, title }) {
        if (key === 'summary') return [objective(width, title)];
        if (key === 'skills') return [stack(skillLines(kit, printable.skills(c), { width, style: body, labelStyle: s(theme.body, { style: 'bold' }) }), { keepFirst: 1 })];
        if (key === 'coursework') return [kit.para(c.coursework.join(', '), { width, style: body })];
        return entriesFor(key, c).map((item) => entry(key, item, width));
      },
    });
  },
};
