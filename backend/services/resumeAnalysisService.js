import env from '../config/env.js';
import { ACTION_VERBS, KEYWORD_TERMS, RESUME_LIMITS, RESUME_SECTIONS, TARGET_ROLES, WEAK_PHRASES } from '../data/resumeOptions.js';
import { templateById } from './resumeContent.js';

/*
 * The resume checker: plain rules, each with a reason and a fix, so a student can see exactly why
 * something was flagged. It reads only the resume it is given. It never claims that a resume will pass
 * any applicant tracking system or lead to an interview, and the keyword check only ever suggests adding
 * a skill "where it is true".
 *
 * Statuses: pass, warn (worth fixing), fail (important gap), info (a tip; not scored).
 */

const DISCLAIMER =
  'These checks follow common resume practice. No checker can promise how an applicant tracking system will read a resume, or guarantee an interview or a job. Only add skills and claims that are true.';
const DEVELOPER_ROLES = new Set(['software-developer', 'full-stack-developer', 'frontend-developer', 'backend-developer', 'ai-ml']);
const EARLY_CAREER_ROLES = new Set(['internship', 'fresher']);
const rolesById = new Map(TARGET_ROLES.map((role) => [role.id, role]));
const sectionTitles = new Map(RESUME_SECTIONS.map((section) => [section.key, section.title]));
const monthFormat = new Intl.DateTimeFormat('en-CA', { timeZone: env.gamificationTimezone, year: 'numeric', month: '2-digit' });

// ----------------------------------------------------------------------------- characters the PDF fonts can draw

// The PDF uses the standard PDF fonts (Helvetica, Times, Courier), which draw the Windows-1252 characters.
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const isWinAnsi = (char) => {
  const code = char.codePointAt(0);
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.includes(char);
};
// Characters the PDF swaps for a close equivalent (the frontend uses the same table).
const REPLACED = new Set(['₹', '→', '←', '↔', '⇒', '✓', '✔', '★', '☆', '−', '‐', '‑', '‒', '″', '′', '≥', '≤', '≈', '▪', '◦', '●', '○', '■', '□', '►', '▸', '\u2009', '\u202f', '\u2002', '\u2003', '\u2007']);
const drawable = (char) => isWinAnsi(char) || REPLACED.has(char) || /\s/.test(char) || [...char.normalize('NFD')].filter((part) => !/\p{M}/u.test(part)).every(isWinAnsi);

/** Characters in `text` that the PDF can't draw (emoji, non-Latin scripts), unique. */
export const unsupportedCharacters = (text) => [...new Set([...text].filter((char) => !drawable(char)))];

// ----------------------------------------------------------------------------- helpers

const words = (text) => text.trim().split(/\s+/).filter(Boolean);
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const listOf = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
const quote = (items, max = 6) => listOf(items.slice(0, max).map((item) => `“${item}”`)) + (items.length > max ? ` and ${items.length - max} more` : '');

function currentMonthIndex() {
  const parts = Object.fromEntries(monthFormat.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return Number(parts.year) * 12 + Number(parts.month) - 1;
}

/** YYYY or YYYY-MM as a month index; a year alone counts as January (start) or December (end). */
function monthIndex(value, { end = false } = {}) {
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(value ?? '');
  if (!match) return null;
  return Number(match[1]) * 12 + (match[2] ? Number(match[2]) - 1 : end ? 11 : 0);
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const AMBIGUOUS_SHORT = new Set(['Go', 'R']);

/** A matcher for one keyword term (all its spellings), following the rules in data/resumeOptions.js. */
function termMatcher(spellings) {
  const patterns = spellings.map((spelling) => {
    const body = escapeRegExp(spelling);
    if (spelling.length <= 2) {
      if (AMBIGUOUS_SHORT.has(spelling)) return new RegExp(`(?:[,/(]\\s*|\\b(?:and|or|in)\\s+)${body}(?=\\s*(?:[,/);]|\\.(?:\\s|$)|$))|(?:[,/(]\\s*)${body}(?![\\w+#])`);
      return new RegExp(`(?<![\\w+#.])${body}(?![\\w+#])`);
    }
    return new RegExp(`(?<![\\w+#.])${body}(?![\\w+#])`, 'i');
  });
  return (text) => patterns.some((pattern) => pattern.test(text));
}
const KEYWORD_MATCHERS = KEYWORD_TERMS.map(([term, ...aliases]) => ({ term, matches: termMatcher([term, ...aliases]) }));

/** Known skills and practices a job description mentions, in the order the list has them. */
export function keywordsIn(text) {
  return KEYWORD_MATCHERS.filter((item) => item.matches(text)).map((item) => item.term);
}

const hasContent = {
  summary: (c) => Boolean(c.summary),
  education: (c) => c.education.some((item) => item.institution || item.degree),
  skills: (c) => c.skills.some((group) => group.items.length),
  projects: (c) => c.projects.some((item) => item.name || item.summary || item.bullets.length),
  experience: (c) => c.experience.some((item) => item.role || item.organization),
  achievements: (c) => c.achievements.some((item) => item.title),
  certifications: (c) => c.certifications.some((item) => item.name),
  coursework: (c) => c.coursework.length > 0 || c.education.some((item) => item.coursework.length),
  volunteering: (c) => c.volunteering.some((item) => item.role || item.organization),
  'custom-1': (c) => Boolean(c.custom[0]?.items.some((item) => item.title || item.bullets.length)),
  'custom-2': (c) => Boolean(c.custom[1]?.items.some((item) => item.title || item.bullets.length)),
};

/** Every piece of text in the visible sections, with where it lives (for messages and "Fix" links). */
function textsOf(content, visible) {
  const out = [];
  const add = (text, where) => text && out.push({ text, ...where });
  add(content.personal.fullName, { step: 'personal', label: 'Name' });
  add(content.personal.headline, { step: 'personal', label: 'Headline' });
  if (visible.has('summary')) add(content.summary, { step: 'summary', label: 'Summary', prose: true });
  if (visible.has('education')) {
    for (const item of content.education) {
      for (const text of [item.institution, item.degree, item.field, item.score]) add(text, { step: 'education', label: item.institution || 'Education', itemId: item.id });
      for (const text of item.details) add(text, { step: 'education', label: item.institution || 'Education', itemId: item.id, bullet: true });
      for (const text of item.coursework) add(text, { step: 'education', label: 'Coursework', itemId: item.id });
    }
  }
  if (visible.has('skills')) for (const group of content.skills) for (const text of [group.label, ...group.items]) add(text, { step: 'skills', label: 'Skills', itemId: group.id });
  if (visible.has('projects')) {
    for (const item of content.projects) {
      const where = { step: 'projects', label: item.name || 'A project', itemId: item.id };
      for (const text of [item.name, item.role, ...item.tech]) add(text, where);
      add(item.summary, { ...where, prose: true });
      for (const text of item.bullets) add(text, { ...where, bullet: true });
    }
  }
  if (visible.has('experience')) {
    for (const item of content.experience) {
      const where = { step: 'experience', label: item.role || item.organization || 'An experience entry', itemId: item.id };
      for (const text of [item.role, item.organization, item.location]) add(text, where);
      for (const text of item.bullets) add(text, { ...where, bullet: true });
    }
  }
  if (visible.has('achievements')) for (const item of content.achievements) { add(item.title, { step: 'experience', label: item.title || 'An achievement', itemId: item.id }); add(item.organization, { step: 'experience', label: item.title, itemId: item.id }); add(item.description, { step: 'experience', label: item.title || 'An achievement', itemId: item.id, prose: true }); }
  if (visible.has('certifications')) for (const item of content.certifications) for (const text of [item.name, item.issuer]) add(text, { step: 'experience', label: item.name || 'A certification', itemId: item.id });
  if (visible.has('coursework')) for (const text of content.coursework) add(text, { step: 'education', label: 'Coursework' });
  if (visible.has('volunteering')) for (const item of content.volunteering) { for (const text of [item.role, item.organization]) add(text, { step: 'experience', label: item.role || 'Volunteering', itemId: item.id }); for (const text of item.bullets) add(text, { step: 'experience', label: item.role || 'Volunteering', itemId: item.id, bullet: true }); }
  content.custom.forEach((section, index) => {
    if (!visible.has(`custom-${index + 1}`)) return;
    for (const item of section.items) { for (const text of [item.title, item.subtitle, item.date]) add(text, { step: 'experience', label: section.title || 'Custom section', itemId: item.id }); for (const text of item.bullets) add(text, { step: 'experience', label: section.title || 'Custom section', itemId: item.id, bullet: true }); }
  });
  return out;
}

const linksOf = (content, visible) => [
  ...content.personal.links.map((link) => ({ url: link.url, label: link.label || 'Profile link', step: 'personal' })),
  ...(visible.has('projects') ? content.projects.flatMap((item) => [item.github && { url: item.github, label: `${item.name || 'Project'} code link`, step: 'projects', itemId: item.id }, item.live && { url: item.live, label: `${item.name || 'Project'} live link`, step: 'projects', itemId: item.id }]) : []),
  ...(visible.has('certifications') ? content.certifications.map((item) => item.url && { url: item.url, label: `${item.name || 'Certification'} link`, step: 'experience', itemId: item.id }) : []),
].filter((link) => link && link.url);

// ----------------------------------------------------------------------------- the checks

/**
 * Checks a resume (the owner's view from services/resumeService.js). `pageCount` is how many pages the
 * builder's layout produced (the browser measures it), when known.
 */
export function analyzeResume(resume, { jobDescription = '', pageCount = null } = {}) {
  const { content } = resume;
  const visible = new Set(resume.sections.order.filter((key) => !resume.sections.hidden.includes(key)));
  const role = rolesById.get(resume.targetRole);
  const developerRole = DEVELOPER_ROLES.has(resume.targetRole);
  const earlyCareer = EARLY_CAREER_ROLES.has(resume.targetRole) || !content.experience.some((item) => item.role || item.organization);
  const checks = [];
  const check = (category, id, status, title, detail, extra = {}) => checks.push({ category, id, status, title, detail, weight: extra.weight ?? 1, ...extra });

  // Contact ---------------------------------------------------------------------------------------
  const { personal } = content;
  check('contact', 'name', personal.fullName ? 'pass' : 'fail', personal.fullName ? 'Your name is at the top' : 'Add your full name', personal.fullName ? '' : 'Recruiters file resumes by name; it is the first line of every template.', { weight: 3, target: { step: 'personal' } });
  check('contact', 'email', personal.email ? 'pass' : 'fail', personal.email ? 'Email address included' : 'Add an email address', personal.email ? '' : 'Email is how most recruiters reply to applications. Use one you check often.', { weight: 3, target: { step: 'personal' } });
  check('contact', 'phone', personal.phone ? 'pass' : 'warn', personal.phone ? 'Phone number included' : 'Add a phone number', personal.phone ? '' : 'Recruiters often call shortlisted students to schedule interviews.', { target: { step: 'personal' } });
  if (!personal.location) check('contact', 'location', 'info', 'Consider adding your city', 'A city and state is enough (for example "Nagpur, Maharashtra"). Never include your full home address.', { target: { step: 'personal' } });
  const profileLinks = personal.links.filter((link) => link.url);
  check('contact', 'links', profileLinks.length ? 'pass' : 'warn', profileLinks.length ? 'Professional links included' : 'Add a professional link', profileLinks.length ? '' : 'A LinkedIn profile, GitHub or portfolio lets a recruiter see more of your work.', { target: { step: 'personal' } });
  if (developerRole && !profileLinks.some((link) => /(^|\.)github\.com$/i.test(hostOf(link.url)))) {
    check('contact', 'github', 'warn', 'Add your GitHub profile', `For ${role.label} roles, recruiters often look at your code. Link your GitHub profile if you have one.`, { target: { step: 'personal' } });
  }

  // Links -----------------------------------------------------------------------------------------
  const linkProblems = [];
  const seenUrls = new Map();
  for (const link of linksOf(content, visible)) {
    const host = hostOf(link.url);
    const key = link.url.replace(/\/+$/, '').toLowerCase();
    if (/^(localhost|127\.|10\.|192\.168\.|0\.0\.0\.0)/.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host)) linkProblems.push({ ...link, problem: 'points to a local or private address that recruiters can’t open', status: 'fail' });
    else if (link.url.toLowerCase().startsWith('http://')) linkProblems.push({ ...link, problem: 'uses http:// — use the https:// address if the site has one', status: 'warn' });
    else if (/linkedin\.com$/i.test(host) && !/linkedin\.com\/in\/[^/]+/i.test(link.url)) linkProblems.push({ ...link, problem: 'isn’t a LinkedIn profile address (they look like linkedin.com/in/your-name)', status: 'warn' });
    else if (/(^|\.)github\.com$/i.test(host) && link.step === 'personal' && !/github\.com\/[^/?#]+\/?$/i.test(link.url)) linkProblems.push({ ...link, problem: 'points inside GitHub rather than to your profile (github.com/your-username)', status: 'info' });
    if (seenUrls.has(key) && seenUrls.get(key) !== link.label) linkProblems.push({ ...link, problem: `is the same as ${seenUrls.get(key)}`, status: 'info' });
    seenUrls.set(key, link.label);
  }
  if (!linkProblems.length) {
    check('contact', 'link-format', 'pass', 'Links look well formed', 'We check the format of each link. We don’t open them, so do click each one in the downloaded PDF to make sure it loads.');
  } else {
    for (const item of linkProblems) check('contact', `link-${item.label}`, item.status, `Check the link: ${item.label}`, `${item.url} ${item.problem}.`, { weight: item.status === 'fail' ? 3 : 1, target: { step: item.step, itemId: item.itemId } });
  }

  // Education -------------------------------------------------------------------------------------
  const education = content.education.filter((item) => item.institution || item.degree || item.field);
  if (!education.length || !visible.has('education')) {
    check('education', 'education', 'fail', 'Add your education', 'For students and freshers, education is one of the first things a recruiter checks.', { weight: 3, target: { step: 'education' } });
  } else {
    check('education', 'education', 'pass', 'Education included', '', { weight: 3 });
    for (const item of education) {
      const label = item.institution || 'An education entry';
      if (!item.institution) check('education', `institution-${item.id}`, 'fail', 'Add the college or school name', `${item.degree || 'An entry'} has no institution.`, { weight: 3, target: { step: 'education', itemId: item.id } });
      if (!item.degree) check('education', `degree-${item.id}`, 'warn', `Add the degree for ${label}`, 'For example "B.Tech in Computer Science Engineering" or "B.E.".', { target: { step: 'education', itemId: item.id } });
      if (!item.endDate) check('education', `graduation-${item.id}`, 'warn', `Add the graduation date for ${label}`, 'Recruiters check when you graduate. For a course in progress, use the expected month and year; it shows as "Expected".', { target: { step: 'education', itemId: item.id } });
      if (!item.score) check('education', `score-${item.id}`, 'info', `Optional: add your CGPA or percentage for ${label}`, 'Many campus recruiters ask for it. Leave it out if you prefer; it is not required.', { target: { step: 'education', itemId: item.id } });
    }
  }

  // Projects and experience -----------------------------------------------------------------------
  const projects = visible.has('projects') ? content.projects.filter((item) => item.name || item.summary || item.bullets.length) : [];
  const experience = visible.has('experience') ? content.experience.filter((item) => item.role || item.organization) : [];
  if (!projects.length && !experience.length) {
    check('projects', 'projects', 'fail', 'Add at least one project', 'Without work experience, projects are the strongest proof of your skills. Course projects and hackathon builds count.', { weight: 3, target: { step: 'projects' } });
  } else {
    check('projects', 'projects', 'pass', projects.length ? plural(projects.length, 'project') + ' included' : 'Experience included', '', { weight: 3 });
    if (earlyCareer && projects.length === 1) check('projects', 'more-projects', 'info', 'Consider a second project', 'Two or three projects give recruiters more to discuss, if you have them.', { target: { step: 'projects' } });
  }
  if (earlyCareer && !experience.length) check('projects', 'experience-optional', 'pass', 'Work experience is optional for you', 'Freshers and internship applicants don’t need employment history; your education, projects and skills carry the resume.');
  for (const item of projects) {
    const where = { step: 'projects', itemId: item.id };
    if (!item.name) check('projects', `project-name-${item.id}`, 'fail', 'A project has no name', 'Give every project a short, clear name.', { weight: 3, target: where });
    if (!item.summary && !item.bullets.length) check('projects', `project-detail-${item.id}`, 'warn', `Describe ${item.name || 'this project'}`, 'Add two to four bullet points: what you built, how, and what it does or achieved.', { target: where });
    if (developerRole && !item.tech.length) check('projects', `project-tech-${item.id}`, 'warn', `List the technologies for ${item.name || 'this project'}`, 'Recruiters scan for the languages and tools you used.', { target: where });
  }
  for (const item of experience) {
    if (!item.role || !item.organization) check('projects', `experience-names-${item.id}`, 'warn', 'Complete an experience entry', `${item.role || item.organization} needs both a role and an organisation.`, { target: { step: 'experience', itemId: item.id } });
    if (!item.bullets.length) check('projects', `experience-detail-${item.id}`, 'warn', `Describe your work at ${item.organization || item.role}`, 'Add two to four bullet points about what you did.', { target: { step: 'experience', itemId: item.id } });
  }

  // Skills ----------------------------------------------------------------------------------------
  const allSkills = visible.has('skills') ? content.skills.flatMap((group) => group.items) : [];
  if (!allSkills.length) check('skills', 'skills', 'fail', 'Add your skills', 'List the languages, tools and technologies you can actually use.', { weight: 3, target: { step: 'skills' } });
  else check('skills', 'skills', allSkills.length >= 5 ? 'pass' : 'warn', allSkills.length >= 5 ? plural(allSkills.length, 'skill') + ' listed' : 'Add a few more skills', allSkills.length >= 5 ? '' : 'Five or more relevant skills help recruiters match you to a role. Only add ones you can discuss in an interview.', { weight: 3, target: { step: 'skills' } });
  const seenSkills = new Map();
  const duplicates = new Set();
  for (const skill of allSkills) {
    const key = skill.toLowerCase();
    if (seenSkills.has(key)) duplicates.add(skill);
    seenSkills.set(key, skill);
  }
  if (duplicates.size) check('skills', 'duplicate-skills', 'warn', 'Some skills appear twice', `${quote([...duplicates])} ${duplicates.size === 1 ? 'is' : 'are'} listed in more than one group.`, { target: { step: 'skills' } });
  if (role?.keywords.length && allSkills.length) {
    // Joined with commas so short list-only terms ("Go", "R") still read as list items.
    const resumeText = textsOf(content, visible).map((item) => item.text).join(', ');
    const common = role.keywords.filter((term) => !KEYWORD_MATCHERS.find((item) => item.term === term)?.matches(resumeText) && !resumeText.toLowerCase().includes(term.toLowerCase()));
    if (common.length) check('skills', 'role-keywords', 'info', `Often asked for in ${role.label} roles`, `${quote(common)}. Add any you genuinely know, in your skills or in the project where you used it. Leave out the rest.`, { target: { step: 'skills' } });
  }

  // Summary ---------------------------------------------------------------------------------------
  const summaryWords = words(content.summary).length;
  if (!visible.has('summary') || !content.summary) {
    check('summary', 'summary', earlyCareer ? 'warn' : 'info', 'Add a short summary or career objective', 'Two or three lines on who you are and the role you want help a recruiter place you quickly.', { target: { step: 'summary' } });
  } else if (summaryWords > 90) {
    check('summary', 'summary', 'warn', 'Shorten your summary', `It has ${summaryWords} words. Aim for 30 to 70 so recruiters read all of it.`, { target: { step: 'summary' } });
  } else if (summaryWords < 12) {
    check('summary', 'summary', 'warn', 'Expand your summary a little', `It has ${summaryWords} words. Say what you study, what you build and the role you want.`, { target: { step: 'summary' } });
  } else {
    check('summary', 'summary', 'pass', 'Summary is a good length', '');
  }

  // Dates -----------------------------------------------------------------------------------------
  const now = currentMonthIndex();
  const dated = [
    ...(visible.has('education') ? content.education.map((item) => ({ ...item, kind: 'education', step: 'education', label: item.institution || 'Education' })) : []),
    ...projects.map((item) => ({ ...item, kind: 'project', step: 'projects', label: item.name || 'A project' })),
    ...experience.map((item) => ({ ...item, kind: 'experience', step: 'experience', label: item.role || item.organization })),
    ...(visible.has('volunteering') ? content.volunteering.map((item) => ({ ...item, kind: 'volunteering', step: 'experience', label: item.role || 'Volunteering' })) : []),
  ];
  let dateIssues = 0;
  const styles = new Set();
  for (const item of dated) {
    const where = { step: item.step, itemId: item.id };
    const start = monthIndex(item.startDate);
    const end = item.endDate === 'present' ? now : monthIndex(item.endDate, { end: true });
    for (const value of [item.startDate, item.endDate]) if (value && value !== 'present') styles.add(value.length === 4 ? 'year' : 'month');
    if (start !== null && end !== null && start > end) {
      dateIssues += 1;
      check('dates', `order-${item.id}`, 'fail', `Dates are reversed for ${item.label}`, 'The start date is after the end date.', { weight: 3, target: where });
    }
    if (item.kind !== 'education' && start !== null && start > now) {
      dateIssues += 1;
      check('dates', `future-start-${item.id}`, 'warn', `Start date is in the future for ${item.label}`, 'Check the month and year.', { target: where });
    }
    if (item.kind !== 'education' && item.endDate && item.endDate !== 'present' && end !== null && end > now) {
      dateIssues += 1;
      check('dates', `future-end-${item.id}`, 'warn', `End date is in the future for ${item.label}`, 'For something still going on, choose "Present" instead.', { target: where });
    }
    if (item.kind === 'experience' && item.startDate && !item.endDate) {
      dateIssues += 1;
      check('dates', `open-${item.id}`, 'warn', `Add an end date for ${item.label}`, 'Use "Present" if you are still there.', { target: where });
    }
  }
  if (styles.size > 1) check('dates', 'date-style', 'info', 'Use one date style throughout', 'Some dates show a month and year and others only a year. Matching styles look tidier.');
  if (!dateIssues) check('dates', 'dates', 'pass', 'Dates are consistent', 'No reversed, future or open-ended dates found.');

  // Wording ---------------------------------------------------------------------------------------
  const texts = textsOf(content, visible);
  const bullets = texts.filter((item) => item.bullet);
  const weakFound = [];
  for (const { phrase, hint } of WEAK_PHRASES) {
    const pattern = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i');
    const where = texts.filter((item) => (item.bullet || item.prose) && pattern.test(item.text));
    if (where.length) weakFound.push({ phrase, hint, where });
  }
  for (const { phrase, hint, where } of weakFound) {
    check('wording', `weak-${phrase}`, 'warn', `Replace the vague phrase “${phrase}”`, `${hint} Found in: ${listOf([...new Set(where.map((item) => item.label))].slice(0, 4))}.`, { target: { step: where[0].step, itemId: where[0].itemId } });
  }
  const starts = new Map();
  for (const item of bullets) {
    const first = words(item.text)[0]?.replace(/[^\w-]/g, '').toLowerCase();
    if (first) starts.set(first, [...(starts.get(first) ?? []), item]);
  }
  for (const [word, items] of starts) {
    if (items.length >= 3) check('wording', `repeat-start-${word}`, 'warn', `${items.length} bullet points start with “${capitalise(word)}”`, 'Vary your opening verbs so each point reads as a different contribution.', { target: { step: items[0].step, itemId: items[0].itemId } });
  }
  const phrases = new Map();
  for (const item of texts.filter((entry) => entry.bullet || entry.prose)) {
    const tokens = words(item.text.toLowerCase().replace(/[^\w\s+#.-]/g, ' '));
    const seen = new Set();
    for (let index = 0; index + 3 <= tokens.length; index += 1) {
      const phrase = tokens.slice(index, index + 3).join(' ');
      if (seen.has(phrase) || /^(and|the|of|to|a|in|for|with)\b|\b(and|the|of|to|a|in|for|with)$/.test(phrase)) continue;
      seen.add(phrase);
      phrases.set(phrase, (phrases.get(phrase) ?? 0) + 1);
    }
  }
  const repeated = [...phrases].filter(([, count]) => count >= 3).map(([phrase]) => phrase);
  if (repeated.length) check('wording', 'repeated-phrases', 'warn', 'Some phrases repeat', `${quote(repeated, 3)} ${repeated.length === 1 ? 'appears' : 'appear'} three or more times. Repetition makes a resume read like a template.`);
  const verbs = new Set(ACTION_VERBS.map((verb) => verb.toLowerCase()));
  const strong = bullets.filter((item) => {
    const first = words(item.text)[0]?.replace(/[^\w]/g, '').toLowerCase() ?? '';
    return verbs.has(first) || /ed$/.test(first);
  }).length;
  if (bullets.length >= 3 && strong / bullets.length < 0.5) check('wording', 'action-verbs', 'info', 'Start bullet points with an action', `Only ${strong} of ${bullets.length} bullet points start with a verb such as “Built”, “Designed” or “Led”. Starting with what you did makes each point easier to scan.`);
  const firstPerson = texts.filter((item) => item.bullet && /\b(i|my|me)\b/i.test(item.text));
  if (firstPerson.length) check('wording', 'first-person', 'info', 'Drop “I” and “my” from bullet points', 'Resume bullet points usually leave out the first person: “Built a…” rather than “I built a…”.', { target: { step: firstPerson[0].step, itemId: firstPerson[0].itemId } });
  const unclear = bullets.filter((item) => words(item.text).length < 5);
  if (unclear.length) check('wording', 'short-bullets', 'warn', `${plural(unclear.length, 'bullet point')} ${unclear.length === 1 ? 'is' : 'are'} very short`, `For example ${quote(unclear.map((item) => item.text), 2)}. Say what you did and how, in one clear sentence.`, { target: { step: unclear[0].step, itemId: unclear[0].itemId } });
  const long = bullets.filter((item) => words(item.text).length > 45);
  if (long.length) check('wording', 'long-bullets', 'warn', `${plural(long.length, 'bullet point')} ${long.length === 1 ? 'is' : 'are'} long`, 'Keep each point to one or two lines; split a long one into two.', { target: { step: long[0].step, itemId: long[0].itemId } });
  if (!weakFound.length && !repeated.length && !unclear.length && !long.length) check('wording', 'wording', 'pass', 'Wording reads clearly', 'No vague phrases, repeated phrases or unclear bullet points found.');

  // Formatting ------------------------------------------------------------------------------------
  const unsupported = unsupportedCharacters(texts.map((item) => item.text).join(' '));
  if (unsupported.length) check('formatting', 'characters', 'warn', 'Some characters can’t be shown in the PDF', `${unsupported.slice(0, 8).join(' ')} will be left out of the PDF. Replace emoji and non-Latin letters with plain text.`, { target: { step: 'personal' } });
  const shouting = texts.filter((item) => (item.bullet || item.prose) && item.text.replace(/[^A-Za-z]/g, '').length > 20 && item.text.replace(/[^A-Z]/g, '').length / item.text.replace(/[^A-Za-z]/g, '').length > 0.7);
  if (shouting.length) check('formatting', 'all-caps', 'warn', 'Avoid writing whole sentences in capitals', 'Text in all capitals is harder to read. The templates already style headings for you.', { target: { step: shouting[0].step, itemId: shouting[0].itemId } });
  if (Number.isInteger(pageCount) && pageCount > 0) {
    if (resume.settings.pageMode === 'one' && pageCount > 1) check('formatting', 'pages', 'warn', `Doesn’t fit on one page yet (${pageCount} pages)`, 'Hide a section, shorten bullet points, or switch to “As many pages as needed”. Nothing is ever cut off.', { target: { step: 'design' } });
    else if (earlyCareer && pageCount > 2) check('formatting', 'pages', 'warn', `${pageCount} pages is long for a student resume`, 'One page is typical for students and two at most. Keep the projects and achievements most relevant to the role.', { target: { step: 'design' } });
    else if (earlyCareer && pageCount === 2) check('formatting', 'pages', 'info', 'Two pages', 'Fine when every line is relevant; many student resumes fit on one page.');
    else check('formatting', 'pages', 'pass', `${plural(pageCount, 'page')}`, '');
  }
  const emptyVisible = [...visible].filter((key) => !hasContent[key]?.(content) && key !== 'summary');
  if (emptyVisible.length) check('formatting', 'empty-sections', 'info', 'Some sections are empty', `${listOf(emptyVisible.map((key) => resume.sections.titles[key] || sectionTitles.get(key)))} won’t appear until you add something.`);
  const template = templateById(resume.template);
  if (template && !template.ats) check('formatting', 'template', 'info', `${template.name} is designed to be read by people`, 'Its layout uses colour or columns. For online application forms, a single-column template such as Fresher ATS Classic is read more consistently by applicant tracking systems.', { target: { step: 'design' } });

  // Keywords --------------------------------------------------------------------------------------
  let keywords = null;
  const description = (jobDescription ?? '').slice(0, RESUME_LIMITS.jobDescription.max).trim();
  if (description) {
    const wanted = keywordsIn(description);
    const resumeText = texts.map((item) => item.text).join(', ');
    const matched = wanted.filter((term) => KEYWORD_MATCHERS.find((item) => item.term === term).matches(resumeText));
    const missing = wanted.filter((term) => !matched.includes(term));
    keywords = { found: wanted.length, matched, missing, coverage: wanted.length ? Math.round((matched.length / wanted.length) * 100) : null };
    if (!wanted.length) check('keywords', 'keywords', 'info', 'No familiar skills found in that description', 'We look for well-known skills and practices (languages, frameworks, tools, methods). Try pasting the requirements part of the posting.');
    else if (!missing.length) check('keywords', 'keywords', 'pass', 'Your resume mentions every skill we recognised in the posting', `${quote(matched, 8)}.`);
    else check('keywords', 'keywords', 'warn', `${plural(missing.length, 'skill')} from the posting ${missing.length === 1 ? 'isn’t' : 'aren’t'} on your resume`, `${quote(missing, 10)}. If you genuinely have one, add it where it is true: your skills, or the project or role where you used it. Never add a skill you don’t have.`, { target: { step: 'skills' } });
  }

  // Score -----------------------------------------------------------------------------------------
  const scored = checks.filter((item) => item.status !== 'info');
  const possible = scored.reduce((sum, item) => sum + item.weight, 0);
  const earned = scored.reduce((sum, item) => sum + (item.status === 'pass' ? item.weight : item.status === 'warn' ? item.weight * 0.4 : 0), 0);
  const score = possible ? Math.round((earned / possible) * 100) : 0;
  const counts = { fail: 0, warn: 0, pass: 0, info: 0 };
  for (const item of checks) counts[item.status] += 1;

  return {
    checkedAt: new Date().toISOString(),
    score,
    label: score >= 85 && !counts.fail ? 'Strong' : score >= 65 ? 'Good start' : 'Needs work',
    counts,
    checks: checks.map(({ weight, ...item }) => item),
    keywords,
    disclaimer: DISCLAIMER,
  };
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

const capitalise = (word) => word.charAt(0).toUpperCase() + word.slice(1);
