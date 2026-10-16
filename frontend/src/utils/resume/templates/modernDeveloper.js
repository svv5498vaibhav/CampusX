import { tint } from '../kit';
import { printable } from '../format';
import { A4, chips, fixed, paragraph, stack } from '../layout';
import { entriesFor, personalParts, renderColumn } from './shared';

/**
 * Modern Developer: a full-width colour band with the name and every link, bold headings underlined by a
 * short accent bar, skills as outlined tags, and each project in its own light card.
 */
export default {
  id: 'modern-developer',
  theme: { body: 9.8, small: 9, lh: 1.32 },
  render(ctx) {
    const { kit, theme, resume } = ctx;
    const { s, sp } = kit;
    const c = resume.content;
    const body = s(theme.body);
    const bold = s(10.6, { style: 'bold' });
    const muted = s(theme.small, { color: theme.muted });
    const { name, headline, contact } = personalParts(resume);
    const onBand = tint(theme.accent, 0.82);

    const heading = (title, width) => {
      const style = s(12.5, { style: 'bold' });
      const text = paragraph([{ text: title, style }], { width, size: style.size, lineHeight: style.size * 1.25 });
      const height = text.height + sp(5);
      return fixed(height, (page, x, y) => {
        text.draw(page, x, y);
        page.fg.push({ t: 'rect', x, y: y + text.height + sp(1.5), w: sp(26), h: sp(2.4), fill: theme.accent, r: 1 });
      });
    };

    const card = (parts, width, pad) =>
      stack(parts.map((block, index) => ({ block, gap: index ? sp(1.5) : 0 })), {
        keepFirst: 2,
        padTop: pad,
        padBottom: pad,
        padX: pad,
        decorate: (page, x, y, height) => page.bg.push({ t: 'rect', x, y, w: width, h: height, fill: '#f4f5f7', r: 5 }),
      });

    const entry = (key, item, width) => {
      const isProject = key === 'projects';
      const pad = isProject ? sp(8) : 0;
      const inner = width - pad * 2;
      const right = isProject && item.links?.length ? kit.joined(item.links.map((link) => ({ text: link.label, url: link.url })), { style: s(9, { style: 'bold', color: theme.accent }), separator: '  ·  ', separatorStyle: muted }) : [{ text: item.dates, style: muted }];
      const title = key === 'education' ? item.degree || item.institution : item.title;
      const subtitle = key === 'education' ? [item.degree ? item.institution : '', item.score].filter(Boolean).join('  ·  ') : [item.subtitle, item.location, isProject ? item.dates : ''].filter(Boolean).join('  ·  ');
      const parts = [
        kit.row(title, right, { width: inner, style: bold }),
        subtitle && kit.para(subtitle, { width: inner, style: s(theme.small, { color: theme.accent, style: 'bold' }) }),
        item.tech?.length && chips(item.tech, { width: inner, style: s(8, { color: theme.accent }), fill: '#ffffff', stroke: tint(theme.accent, 0.55), padX: sp(4), padY: sp(1.8), gapX: sp(3), gapY: sp(3), radius: 6 }),
        item.summary && kit.para(item.summary, { width: inner, style: body }),
        item.coursework?.length && kit.para(kit.labelled('Coursework', item.coursework.join(', '), { style: muted }), { width: inner, style: muted }),
        !isProject && item.links?.length && kit.para(kit.joined(item.links.map((link) => ({ text: link.text, url: link.url })), { style: s(theme.small, { color: theme.accent }) }), { width: inner, style: muted }),
        kit.bullets(item.bullets, { width: inner, style: body, glyph: 'dot', color: theme.accent }),
      ].filter(Boolean);
      if (!isProject) return stack(parts.map((block, index) => ({ block, gap: index ? sp(1.5) : 0 })), { keepFirst: 2 });
      return card(parts, width, pad);
    };

    renderColumn(ctx, {
      margins: { top: 38, right: 42, bottom: 40, left: 42 },
      drawHeader(page, m, width) {
        const left = m.left;
        const nameBlock = kit.para(name, { width, style: s(25, { style: 'bold', color: '#ffffff' }), lh: 1.1 });
        const headlineBlock = headline ? kit.para(headline, { width, style: s(11.5, { color: onBand }) }) : null;
        const contactBlock = contact.length ? kit.para(kit.joined(contact, { style: s(9, { color: '#ffffff' }), separator: '   |   ', separatorStyle: s(9, { color: onBand }) }), { width, style: s(9) }) : null;
        const top = sp(30);
        let y = top;
        const parts = [[nameBlock, 0], [headlineBlock, sp(2)], [contactBlock, sp(7)]];
        const height = parts.reduce((sum, [block, gap]) => sum + (block ? block.height + gap : 0), 0) + top + sp(22);
        page.bg.push({ t: 'rect', x: 0, y: 0, w: A4.width, h: height, fill: theme.accent });
        for (const [block, gap] of parts) {
          if (!block) continue;
          y += gap;
          block.draw(page, left, y);
          y += block.height;
        }
        return height + sp(16);
      },
      heading,
      firstSectionGap: 0,
      sectionGap: sp(14),
      headingGap: sp(6),
      entryGap: sp(7),
      section(key, { width }) {
        if (key === 'summary') return [kit.para(c.summary, { width, style: s(10.2) })];
        if (key === 'skills') {
          const rows = printable.skills(c).map((group) =>
            stack([kit.para(group.label, { width, style: s(8.4, { style: 'bold', color: theme.muted, cs: 0.8 }) }), { block: chips(group.items, { width, style: s(8.6, { color: theme.ink }), fill: '#ffffff', stroke: tint(theme.accent, 0.45), padX: sp(5), padY: sp(2.2), radius: 7 }), gap: sp(2.5) }], { keepFirst: 2 }),
          );
          return [stack(rows.map((block, index) => ({ block, gap: index ? sp(6) : 0 })), { keepFirst: 1 })];
        }
        if (key === 'coursework') return [chips(c.coursework, { width, style: s(8.6, { color: theme.ink }), fill: '#f4f5f7', padX: sp(5), padY: sp(2.2), radius: 7 })];
        return entriesFor(key, c).map((item) => entry(key, item, width));
      },
    });
  },
};
