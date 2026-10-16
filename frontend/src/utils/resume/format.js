/**
 * Turning saved resume content into the words templates print: dates, link labels, contact details,
 * section titles and which sections have something to show. Shared by every template, so the same
 * resume reads the same way whichever template draws it.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const clean = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/** "2024-05" → "May 2024", "2024" → "2024", "present" → "Present". */
export function formatDate(value) {
  const text = clean(value);
  if (!text) return '';
  if (text.toLowerCase() === 'present') return 'Present';
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(text);
  if (!match) return text;
  return match[2] ? `${MONTHS[Number(match[2]) - 1]} ${match[1]}` : match[1];
}

const monthIndex = (value) => {
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(value ?? '');
  return match ? Number(match[1]) * 12 + (match[2] ? Number(match[2]) - 1 : 11) : null;
};
const now = new Date();
const currentMonth = now.getFullYear() * 12 + now.getMonth();

/**
 * A date range as printed: "Aug 2022 – May 2026", "Jun 2024 – Present", "Ongoing" (no start, still going),
 * or one date. With `expected`, an end date still in the future reads "Expected May 2027" (education).
 */
export function dateRange(start, end, { expected = false } = {}) {
  const from = formatDate(start);
  const isFuture = expected && end && end !== 'present' && monthIndex(end) !== null && monthIndex(end) > currentMonth;
  const to = isFuture ? `Expected ${formatDate(end)}` : formatDate(end);
  if (from && to) return `${from} – ${to}`;
  if (!from && end === 'present') return 'Ongoing';
  return from || to;
}

/** "https://www.github.com/asha/" → "github.com/asha". */
export const displayUrl = (url) => clean(url).replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');

/** Contact details in print order: email, phone, location, then each link. */
export function contactItems(personal) {
  const items = [];
  if (clean(personal.email)) items.push({ kind: 'email', text: clean(personal.email), url: `mailto:${clean(personal.email)}` });
  if (clean(personal.phone)) items.push({ kind: 'phone', text: clean(personal.phone) });
  if (clean(personal.location)) items.push({ kind: 'location', text: clean(personal.location) });
  for (const link of personal.links ?? []) {
    if (!clean(link.url)) continue;
    items.push({ kind: 'link', label: clean(link.label), text: displayUrl(link.url), url: clean(link.url) });
  }
  return items;
}

const hasText = (...values) => values.some((value) => clean(value));

/** Whether each section has anything to print. */
export const SECTION_HAS_CONTENT = {
  summary: (c) => hasText(c.summary),
  education: (c) => c.education.some((item) => hasText(item.institution, item.degree, item.field)),
  skills: (c) => c.skills.some((group) => group.items.length),
  projects: (c) => c.projects.some((item) => hasText(item.name, item.summary) || item.bullets.length),
  experience: (c) => c.experience.some((item) => hasText(item.role, item.organization)),
  achievements: (c) => c.achievements.some((item) => hasText(item.title)),
  certifications: (c) => c.certifications.some((item) => hasText(item.name)),
  coursework: (c) => c.coursework.length > 0,
  volunteering: (c) => c.volunteering.some((item) => hasText(item.role, item.organization)),
  'custom-1': (c) => Boolean(c.custom?.[0]?.items.some((item) => hasText(item.title, item.subtitle) || item.bullets.length)),
  'custom-2': (c) => Boolean(c.custom?.[1]?.items.some((item) => hasText(item.title, item.subtitle) || item.bullets.length)),
};

export const DEFAULT_SECTION_TITLES = {
  summary: 'Professional Summary',
  education: 'Education',
  skills: 'Technical Skills',
  projects: 'Projects',
  experience: 'Experience',
  achievements: 'Achievements',
  certifications: 'Certifications',
  coursework: 'Relevant Coursework',
  volunteering: 'Volunteering & Leadership',
  'custom-1': 'Additional Information',
  'custom-2': 'Interests',
};

/** The printed title of a section: the student's own name for it, else the default. */
export function sectionTitle(key, resume) {
  if (key.startsWith('custom-')) {
    const custom = resume.content.custom?.[Number(key.slice(7)) - 1];
    if (clean(custom?.title)) return clean(custom.title);
  }
  return clean(resume.sections?.titles?.[key]) || DEFAULT_SECTION_TITLES[key] || key;
}

/** Sections to print, in the student's order: visible and not empty. */
export function printableSections(resume) {
  const hidden = new Set(resume.sections?.hidden ?? []);
  const order = resume.sections?.order?.length ? resume.sections.order : Object.keys(DEFAULT_SECTION_TITLES);
  return order.filter((key) => !hidden.has(key) && SECTION_HAS_CONTENT[key]?.(resume.content));
}

/** Education entries, with education-level coursework kept and empty entries dropped. */
export const printable = {
  education: (c) => c.education.filter((item) => hasText(item.institution, item.degree, item.field)),
  projects: (c) => c.projects.filter((item) => hasText(item.name, item.summary) || item.bullets.length),
  experience: (c) => c.experience.filter((item) => hasText(item.role, item.organization)),
  achievements: (c) => c.achievements.filter((item) => hasText(item.title)),
  certifications: (c) => c.certifications.filter((item) => hasText(item.name)),
  volunteering: (c) => c.volunteering.filter((item) => hasText(item.role, item.organization)),
  skills: (c) => c.skills.filter((group) => group.items.length),
  custom: (c, index) => (c.custom?.[index]?.items ?? []).filter((item) => hasText(item.title, item.subtitle) || item.bullets.length),
};

/** "B.Tech in Computer Science" from a degree and a field (either may be missing). */
export const degreeLine = (item) => [clean(item.degree), clean(item.field)].filter(Boolean).join(clean(item.degree) && clean(item.field) ? ' in ' : '');

/** A file name for the PDF: "Full-Stack-Developer-Resume.pdf" from the resume's name. */
export function pdfFileName(resume) {
  const base = clean(resume.name) || `${clean(resume.content?.personal?.fullName) || 'My'} Resume`;
  const slug = base
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${slug || 'Resume'}${/resume$/i.test(slug) ? '' : '-Resume'}.pdf`;
}

export { clean };
