import { contactItems, entriesFor } from '../kit';
import { sectionTitle } from '../format';
import { A4, Flow, columns, offset } from '../layout';

/**
 * The single-column renderer most templates use. A template describes its look as a `design`:
 *   margins                    { top, right, bottom, left } in points (scaled by the theme's spacing)
 *   header(width)              block(s) at the top of page 1, or drawHeader(page, margins) → y where text starts
 *   heading(title, width)      a section heading block
 *   side                       { width, gap, label(title) } to put section names in a side margin instead
 *   divider(width)             a block between sections (side-heading layouts)
 *   section(key, { width })    the section's blocks (entries), in order
 *   headless                   section keys drawn without a heading (they bring their own label)
 *   titles                     the template's own default section names
 *   sectionGap, headingGap, entryGap
 */
export function renderColumn(ctx, design) {
  const { doc, kit, resume, sections } = ctx;
  const m = scaledMargins(kit, design.margins);
  const width = A4.width - m.left - m.right;
  const firstTop = design.drawHeader ? design.drawHeader(doc.page(0), m, width) : m.top;
  const flow = new Flow(doc, (page) => ({ x: m.left, top: page === 0 ? firstTop : m.top, bottom: A4.height - m.bottom }));
  for (const block of [].concat(design.header?.(width) ?? [])) {
    flow.add(block);
  }
  const side = design.side;
  const contentWidth = side ? width - side.width - side.gap : width;
  let first = true;
  for (const key of sections) {
    const title = design.titles?.[key] && !resume.sections?.titles?.[key] ? design.titles[key] : sectionTitle(key, resume);
    const blocks = design.section(key, { width: contentWidth, title }).filter((block) => block && block.height > 0);
    if (!blocks.length) continue;
    flow.gap(first ? (design.firstSectionGap ?? design.sectionGap) : design.sectionGap);
    if (!first && design.divider) {
      flow.add(design.divider(width));
      flow.gap(design.dividerGap ?? 0);
    }
    first = false;
    const [head, ...rest] = blocks;
    if (side) {
      flow.add(columns(side.label(title), head, { leftWidth: side.width, gap: side.gap }));
      for (const block of rest) {
        flow.gap(design.entryGap);
        flow.add(offset(block, side.width + side.gap));
      }
    } else {
      if (design.headless?.includes(key)) flow.add(head);
      else flow.keep([design.heading(title, width), head], [0, design.headingGap]);
      for (const block of rest) {
        flow.gap(design.entryGap);
        flow.add(block);
      }
    }
  }
}

export const scaledMargins = (kit, margins) => Object.fromEntries(Object.entries(margins).map(([side, value]) => [side, Math.max(26, kit.sp(value))]));

/** The parts of a resume's personal details most headers use. */
export function personalParts(resume) {
  const { personal } = resume.content;
  return { name: personal.fullName || 'Your Name', headline: personal.headline, contact: contactItems(personal) };
}

/** Comma list of skills per group: "Languages: Java, Python". */
export function skillLines(kit, groups, { width, style, labelStyle, gap = kit.sp(2) }) {
  return groups.map((group, index) => ({ block: kit.para(kit.labelled(group.label, group.items.join(', '), { style, labelStyle }), { width, style }), gap: index ? gap : 0 }));
}

export { entriesFor };
