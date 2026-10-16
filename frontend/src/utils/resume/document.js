import { printableSections } from './format';
import { createKit } from './kit';
import { A4, createDocument, paragraph } from './layout';
import { TEMPLATE_LAYOUTS } from './templates';

/**
 * Lays out a whole resume: picks the template, builds its theme from the resume's settings, and, in
 * "fit on one page" mode, tightens spacing (and type, never below 9 pt for body text) until it fits.
 * When it still doesn't fit, the most compact version is kept on as many pages as it needs; nothing is
 * ever cut. Returns { pages, pageCount, fitted, overflow, templateId }.
 */

const ACCENT_FALLBACK = { ink: '#111827', green: '#166534', blue: '#1d4ed8', teal: '#0f766e', navy: '#1e3a8a', maroon: '#9f1239', slate: '#334155', purple: '#6d28d9' };
const DENSITY = { compact: { type: 0.96, space: 0.84 }, standard: { type: 1, space: 1 }, relaxed: { type: 1.04, space: 1.16 } };
// Successively tighter attempts for "fit on one page".
const FIT_STEPS = [
  { type: 1, space: 0.86, lh: 0.97 },
  { type: 0.97, space: 0.74, lh: 0.95 },
  { type: 0.94, space: 0.64, lh: 0.93 },
  { type: 0.91, space: 0.56, lh: 0.92 },
];
const MIN_BODY_SIZE = 9;

export const DEFAULT_TEMPLATE_ID = 'fresher-ats-classic';

function buildTheme(template, resume, { accents, step }) {
  const settings = resume.settings ?? {};
  const density = DENSITY[settings.density] ?? DENSITY.standard;
  const accentId = template.accentFor ? template.accentFor(settings) : settings.accent;
  const accent = accents?.[accentId] ?? ACCENT_FALLBACK[accentId] ?? ACCENT_FALLBACK.ink;
  const base = template.theme;
  // Body text never drops below MIN_BODY_SIZE, whatever the density and fitting ask for.
  const typeScale = Math.max(density.type * step.type, Math.min(1, MIN_BODY_SIZE / base.body));
  return {
    font: settings.font === 'serif' ? 'times' : 'helvetica',
    ink: '#111827',
    muted: '#4b5563',
    subtle: '#6b7280',
    rule: '#d1d5db',
    accent,
    boldStyle: 'bold',
    body: base.body,
    small: base.small,
    lh: base.lh * step.lh,
    scale: typeScale,
    space: density.space * step.space,
  };
}

function render(template, resume, options, step) {
  const doc = createDocument();
  const theme = buildTheme(template, resume, { ...options, step });
  const kit = createKit(theme);
  template.render({ doc, kit, theme, resume, sections: printableSections(resume) });
  if (!doc.pages.length) doc.page(0);
  addPageNumbers(doc, resume, theme, template.footerArea);
  return doc;
}

/** "Asha Rao · Page 2 of 3" at the foot of every page of a multi-page resume. */
function addPageNumbers(doc, resume, theme, area = { x: 0, width: A4.width }) {
  const total = doc.pages.length;
  if (total < 2) return;
  const name = resume.content?.personal?.fullName?.trim();
  const style = { font: theme.font, style: 'normal', size: 7.6, color: '#6b7280', cs: 0 };
  doc.pages.forEach((page, index) => {
    const text = `${name ? `${name}  ·  ` : ''}Page ${index + 1} of ${total}`;
    paragraph([{ text, style }], { width: area.width, size: style.size, lineHeight: style.size * 1.2, align: 'center' })?.draw(page, area.x, A4.height - 22);
  });
}

/**
 * The laid-out pages for `resume` ({ template, settings, sections, content }). `accents` maps accent ids
 * to colours (from the options); `templateId` draws the same resume with another template (thumbnails).
 */
export function layoutResume(resume, { accents, templateId } = {}) {
  const id = TEMPLATE_LAYOUTS[templateId ?? resume.template] ? (templateId ?? resume.template) : DEFAULT_TEMPLATE_ID;
  const template = TEMPLATE_LAYOUTS[id];
  const options = { accents };
  let doc = render(template, resume, options, { type: 1, space: 1, lh: 1 });
  let fitted = doc.pages.length === 1;
  if (!fitted && resume.settings?.pageMode === 'one') {
    for (const step of FIT_STEPS) {
      const attempt = render(template, resume, options, step);
      doc = attempt;
      if (attempt.pages.length === 1) {
        fitted = true;
        break;
      }
    }
  }
  return { pages: doc.pages, pageCount: doc.pages.length, fitted, overflow: doc.overflow, templateId: id };
}
