import { contactItems, entriesFor, tint } from '../kit';
import { printable, sectionTitle } from '../format';
import { A4, Flow, rule, stack } from '../layout';

// Sections that go in the sidebar; everything else goes in the main column. Each column keeps the
// student's section order.
const SIDEBAR = new Set(['skills', 'certifications', 'coursework']);

/**
 * Two-Column Professional: a tinted sidebar on every page with contact details, skills, certifications and
 * coursework; the main column carries the name, summary, experience, projects and education under bold
 * headings with an accent rule.
 */
export default {
  id: 'two-column-professional',
  // Page numbers centre under the main column, clear of the sidebar.
  footerArea: { x: 184, width: A4.width - 184 },
  theme: { body: 9.6, small: 8.8, lh: 1.32 },
  render(ctx) {
    const { doc, kit, theme, resume, sections } = ctx;
    const { s, sp } = kit;
    const c = resume.content;
    const body = s(theme.body);
    const muted = s(theme.small, { color: theme.muted });
    const sidebarWidth = 184;
    const top = Math.max(28, sp(40));
    const bottom = A4.height - Math.max(28, sp(36));
    const side = { x: 20, width: sidebarWidth - 38 };
    const main = { x: sidebarWidth + 24, width: A4.width - sidebarWidth - 24 - 34 };
    const sideFlow = new Flow(doc, () => ({ x: side.x, top, bottom }));
    const mainFlow = new Flow(doc, () => ({ x: main.x, top, bottom }));

    // Sidebar --------------------------------------------------------------------------------------
    const sideHeading = (title) => kit.para(title.toUpperCase(), { width: side.width, style: s(8.6, { style: 'bold', color: theme.accent, cs: 1.4 }), lh: 1.4 });
    const sideSection = (title, blocks) => {
      const list = blocks.filter(Boolean);
      if (!list.length) return;
      sideFlow.gap(sp(14));
      sideFlow.keep([sideHeading(title), list[0]], [0, sp(4)]);
      for (const block of list.slice(1)) {
        sideFlow.gap(sp(5));
        sideFlow.add(block);
      }
    };
    const contact = contactItems(c.personal);
    sideSection(
      'Contact',
      contact.map((item) =>
        stack(
          [
            item.label && kit.para(item.label, { width: side.width, style: s(8.2, { style: 'bold', color: theme.muted }) }),
            kit.para([{ text: item.text, style: s(8.8, { color: item.kind === 'link' || item.kind === 'email' ? theme.accent : theme.ink }), url: item.url }], { width: side.width, style: s(8.8) }),
          ].filter(Boolean),
          { keepFirst: Infinity },
        ),
      ),
    );
    for (const key of sections.filter((section) => SIDEBAR.has(section))) {
      const title = sectionTitle(key, resume);
      if (key === 'skills') {
        sideSection(
          title === 'Technical Skills' ? 'Skills' : title,
          printable.skills(c).map((group) => stack([kit.para(group.label, { width: side.width, style: s(9, { style: 'bold' }) }), { block: kit.para(group.items.join(', '), { width: side.width, style: s(8.8) }), gap: sp(1) }], { keepFirst: 2 })),
        );
      } else if (key === 'coursework') {
        sideSection(title, [kit.bullets(c.coursework, { width: side.width, style: s(8.8), glyph: 'dot', color: theme.accent, indent: sp(8), gap: sp(1) })]);
      } else {
        sideSection(
          title,
          entriesFor(key, c).map((item) =>
            stack(
              [
                kit.para(item.title, { width: side.width, style: s(9, { style: 'bold' }) }),
                (item.subtitle || item.dates) && kit.para([item.subtitle, item.dates].filter(Boolean).join(', '), { width: side.width, style: s(8.6, { color: theme.muted }) }),
                item.links?.length && kit.para([{ text: item.links[0].text, style: s(8.4, { color: theme.accent }), url: item.links[0].url }], { width: side.width, style: s(8.4) }),
              ].filter(Boolean),
              { keepFirst: Infinity },
            ),
          ),
        );
      }
    }

    // Main column ----------------------------------------------------------------------------------
    const W = main.width;
    mainFlow.add(
      stack(
        [
          kit.para(c.personal.fullName || 'Your Name', { width: W, style: s(24, { style: 'bold' }), lh: 1.1 }),
          c.personal.headline && { block: kit.para(c.personal.headline, { width: W, style: s(12, { color: theme.accent }) }), gap: sp(2) },
        ].filter(Boolean),
        { keepFirst: Infinity },
      ),
    );
    const heading = (title) => stack([kit.para(title, { width: W, style: s(12.2, { style: 'bold' }), lh: 1.2 }), rule(W, { color: theme.accent, thickness: 1.1, before: sp(2) })], { keepFirst: Infinity });
    const entry = (key, item) => {
      const isEducation = key === 'education';
      const subtitle = isEducation ? item.degree : item.subtitle;
      const meta = [item.location, isEducation ? item.score : '', item.tech?.length ? item.tech.join(', ') : ''].filter(Boolean).join('  ·  ');
      const parts = [
        kit.row(isEducation ? item.institution : item.title, [{ text: item.dates, style: muted }], { width: W, style: s(10.2, { style: 'bold' }) }),
        subtitle && kit.para(subtitle, { width: W, style: s(9.4, { style: 'bold', color: theme.accent }) }),
        meta && kit.para(meta, { width: W, style: muted }),
        item.summary && kit.para(item.summary, { width: W, style: body }),
        item.coursework?.length && kit.para(kit.labelled('Coursework', item.coursework.join(', '), { style: muted }), { width: W, style: muted }),
        item.links?.length && kit.para(kit.joined(item.links.map((link) => ({ text: link.text, url: link.url })), { style: s(theme.small, { color: theme.accent }) }), { width: W, style: muted }),
        kit.bullets(item.bullets, { width: W, style: body, glyph: 'dot', color: theme.accent }),
      ].filter(Boolean);
      return stack(parts.map((block, index) => ({ block, gap: index ? sp(1.4) : 0 })), { keepFirst: 2 });
    };
    for (const key of sections.filter((section) => !SIDEBAR.has(section))) {
      const blocks = key === 'summary' ? [kit.para(c.summary, { width: W, style: body })] : entriesFor(key, c).map((item) => entry(key, item));
      if (!blocks.length) continue;
      mainFlow.gap(sp(14));
      mainFlow.keep([heading(sectionTitle(key, resume)), blocks[0]], [0, sp(5)]);
      for (const block of blocks.slice(1)) {
        mainFlow.gap(sp(7));
        mainFlow.add(block);
      }
    }

    // The sidebar's tint runs the full height of every page.
    const fill = tint(theme.accent, 0.91);
    for (const page of doc.pages) page.bg.unshift({ t: 'rect', x: 0, y: 0, w: sidebarWidth, h: A4.height, fill });
  },
};
