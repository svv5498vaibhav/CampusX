import crypto from 'node:crypto';
import {
  PAGE_MODE_IDS,
  RESUME_DENSITY_IDS,
  RESUME_LIMITS as L,
  RESUME_SECTION_KEYS,
  RESUME_TEMPLATES,
  SECTION_TITLE_MAX,
} from '../data/resumeOptions.js';
import ApiError from '../utils/ApiError.js';

/*
 * Resume content checking. Every write goes through here: only the fields below are kept, every string
 * is trimmed and length-checked, links must be http(s), dates must be YYYY or YYYY-MM, and list sizes
 * are capped (data/resumeOptions.js RESUME_LIMITS). Anything else is refused with field-level messages,
 * never stored. Nothing here invents content: blank items stay blank until the student fills them.
 */

const templatesById = new Map(RESUME_TEMPLATES.map((template) => [template.id, template]));
export const templateById = (id) => templatesById.get(id) ?? null;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‍⁠﻿]/g;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;
const SOURCE_PATTERN = /^[pam]:[A-Za-z0-9_-]{1,40}$/;
const DATE_PATTERN = /^(\d{4})(?:-(0[1-9]|1[0-2]))?$/;
const EMAIL_PATTERN = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;
const PHONE_PATTERN = /^\+?[\d\s().-]{6,25}$/;
export const MIN_YEAR = 1950;
export const MAX_YEAR = 2100;

export const newItemId = () => crypto.randomBytes(5).toString('hex');

/** Collects field errors while checking a whole resume, so the student sees every problem at once. */
export class Problems {
  constructor() {
    this.list = [];
  }

  add(field, message) {
    if (this.list.length < 50) this.list.push({ field, location: 'body', message });
  }

  throwIfAny() {
    if (this.list.length) throw ApiError.unprocessable('Please fix the highlighted resume fields.', this.list);
  }
}

// ----------------------------------------------------------------------------- values

/** One line of text: whitespace collapsed, control characters removed. */
function line(value, max, field, problems) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    problems.add(field, 'Must be text.');
    return '';
  }
  const text = value.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
  if (text.length > max) problems.add(field, `Keep this under ${max} characters (it has ${text.length}).`);
  return text.slice(0, max);
}

/** A date as YYYY or YYYY-MM; `allowPresent` also accepts "present" (an end date). */
function date(value, field, problems, { allowPresent = false } = {}) {
  const text = line(value, 10, field, problems).toLowerCase();
  if (!text) return '';
  if (allowPresent && text === 'present') return 'present';
  const match = DATE_PATTERN.exec(text);
  const year = Number(match?.[1]);
  if (!match || year < MIN_YEAR || year > MAX_YEAR) {
    problems.add(field, allowPresent ? 'Use a month and year (YYYY-MM), a year, or "present".' : 'Use a month and year (YYYY-MM) or a year.');
    return '';
  }
  return text;
}

/**
 * A web link. "github.com/asha" becomes "https://github.com/asha"; anything that isn't http(s) with a
 * real host name (javascript:, data:, mailto:, credentials in the address) is refused.
 */
export function normalizeUrl(value) {
  const text = typeof value === 'string' ? value.replace(CONTROL_CHARS, '').trim() : '';
  if (!text) return { url: '', ok: true };
  if (/\s/.test(text)) return { url: text, ok: false, reason: 'Links can’t contain spaces.' };
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(text);
  if (hasScheme && !/^https?:\/\//i.test(text)) return { url: text, ok: false, reason: 'Links must start with https:// or http://.' };
  const candidate = hasScheme ? text : `https://${text.replace(/^\/+/, '')}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.username || parsed.password) return { url: text, ok: false, reason: 'Links can’t include a user name or password.' };
    if (!parsed.hostname.includes('.') || parsed.hostname.endsWith('.')) return { url: text, ok: false, reason: 'This doesn’t look like a web address.' };
    return { url: candidate, ok: true };
  } catch {
    return { url: text, ok: false, reason: 'This doesn’t look like a web address.' };
  }
}

function url(value, field, problems) {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    problems.add(field, 'Must be text.');
    return '';
  }
  const { url: normalized, ok, reason } = normalizeUrl(value);
  if (!ok) {
    problems.add(field, reason);
    return '';
  }
  if (normalized.length > L.url.max) {
    problems.add(field, `Keep links under ${L.url.max} characters.`);
    return '';
  }
  return normalized;
}

function list(value, max, field, problems, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    problems.add(field, 'Must be a list.');
    return [];
  }
  if (value.length > max) problems.add(field, `You can add up to ${max} ${label}.`);
  return value.slice(0, max);
}

/** A list of short texts (bullets, tech, coursework): blanks dropped, duplicates removed when `unique`. */
function texts(value, { max, length, field, problems, label, unique = false }) {
  const seen = new Set();
  const result = [];
  list(value, max, field, problems, label).forEach((item, index) => {
    const text = line(item, length, `${field}[${index}]`, problems);
    if (!text) return;
    const key = text.toLowerCase();
    if (unique && seen.has(key)) return;
    seen.add(key);
    result.push(text);
  });
  return result;
}

const plainObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

/** Item ids are only for keeping track of items between the editor and the server; repairs are silent. */
function itemId(value, used) {
  let id = typeof value === 'string' && ID_PATTERN.test(value) && !used.has(value) ? value : newItemId();
  while (used.has(id)) id = newItemId();
  used.add(id);
  return id;
}

const source = (value) => (typeof value === 'string' && SOURCE_PATTERN.test(value) ? value : '');

// ----------------------------------------------------------------------------- sections of content

function items(value, { max, field, problems, label }, read) {
  const used = new Set();
  return list(value, max, field, problems, label).map((raw, index) => {
    const item = plainObject(raw);
    return { id: itemId(item.id, used), ...read(item, `${field}[${index}]`) };
  });
}

const bulletsOf = (value, field, problems, max) => texts(value, { max, length: L.bullet.max, field, problems, label: 'bullet points' });

/**
 * The checked content of a resume. `input` may be partial (missing sections become empty), but whatever
 * it contains must be valid.
 */
export function normalizeContent(input, problems = new Problems(), { throwOnError = true } = {}) {
  const content = plainObject(input);
  const t = L.text;
  const personalIn = plainObject(content.personal);
  const personal = {
    fullName: line(personalIn.fullName, t.short, 'content.personal.fullName', problems),
    headline: line(personalIn.headline, t.short, 'content.personal.headline', problems),
    email: line(personalIn.email, L.email.max, 'content.personal.email', problems),
    phone: line(personalIn.phone, L.phone.max, 'content.personal.phone', problems),
    location: line(personalIn.location, t.short, 'content.personal.location', problems),
    links: list(personalIn.links, L.links.max, 'content.personal.links', problems, 'links').map((raw, index) => {
      const link = plainObject(raw);
      return { label: line(link.label, 30, `content.personal.links[${index}].label`, problems), url: url(link.url, `content.personal.links[${index}].url`, problems) };
    }),
  };
  if (personal.email && !EMAIL_PATTERN.test(personal.email)) problems.add('content.personal.email', 'Please enter a valid email address.');
  if (personal.phone && (!PHONE_PATTERN.test(personal.phone) || personal.phone.replace(/\D/g, '').length < 7 || personal.phone.replace(/\D/g, '').length > 15)) {
    problems.add('content.personal.phone', 'Please enter a phone number with 7 to 15 digits (+, spaces, dashes and brackets are fine).');
  }

  const result = {
    personal,
    summary: line(content.summary, L.summary.max, 'content.summary', problems),
    education: items(content.education, { max: L.education.max, field: 'content.education', problems, label: 'education entries' }, (item, field) => ({
      institution: line(item.institution, t.medium, `${field}.institution`, problems),
      degree: line(item.degree, t.short, `${field}.degree`, problems),
      field: line(item.field, t.short, `${field}.field`, problems),
      location: line(item.location, t.short, `${field}.location`, problems),
      startDate: date(item.startDate, `${field}.startDate`, problems),
      endDate: date(item.endDate, `${field}.endDate`, problems, { allowPresent: true }),
      score: line(item.score, 60, `${field}.score`, problems),
      coursework: texts(item.coursework, { max: L.education.coursework, length: L.coursework.itemLength, field: `${field}.coursework`, problems, label: 'courses', unique: true }),
      details: bulletsOf(item.details, `${field}.details`, problems, L.education.details),
    })),
    skills: items(content.skills, { max: L.skills.groups, field: 'content.skills', problems, label: 'skill groups' }, (item, field) => ({
      label: line(item.label, 40, `${field}.label`, problems),
      items: texts(item.items, { max: L.skills.items, length: L.skills.itemLength, field: `${field}.items`, problems, label: 'skills in a group', unique: true }),
    })),
    projects: items(content.projects, { max: L.projects.max, field: 'content.projects', problems, label: 'projects' }, (item, field) => ({
      name: line(item.name, t.short, `${field}.name`, problems),
      role: line(item.role, 60, `${field}.role`, problems),
      tech: texts(item.tech, { max: L.projects.tech, length: L.skills.itemLength, field: `${field}.tech`, problems, label: 'technologies', unique: true }),
      startDate: date(item.startDate, `${field}.startDate`, problems),
      endDate: date(item.endDate, `${field}.endDate`, problems, { allowPresent: true }),
      github: url(item.github, `${field}.github`, problems),
      live: url(item.live, `${field}.live`, problems),
      summary: line(item.summary, L.description.max, `${field}.summary`, problems),
      bullets: bulletsOf(item.bullets, `${field}.bullets`, problems, L.projects.bullets),
      source: source(item.source),
    })),
    experience: items(content.experience, { max: L.experience.max, field: 'content.experience', problems, label: 'experience entries' }, (item, field) => ({
      role: line(item.role, t.short, `${field}.role`, problems),
      organization: line(item.organization, t.medium, `${field}.organization`, problems),
      location: line(item.location, t.short, `${field}.location`, problems),
      startDate: date(item.startDate, `${field}.startDate`, problems),
      endDate: date(item.endDate, `${field}.endDate`, problems, { allowPresent: true }),
      bullets: bulletsOf(item.bullets, `${field}.bullets`, problems, L.experience.bullets),
      source: source(item.source),
    })),
    achievements: items(content.achievements, { max: L.achievements.max, field: 'content.achievements', problems, label: 'achievements' }, (item, field) => ({
      title: line(item.title, t.medium, `${field}.title`, problems),
      organization: line(item.organization, t.medium, `${field}.organization`, problems),
      date: date(item.date, `${field}.date`, problems),
      description: line(item.description, L.description.max, `${field}.description`, problems),
      source: source(item.source),
    })),
    certifications: items(content.certifications, { max: L.certifications.max, field: 'content.certifications', problems, label: 'certifications' }, (item, field) => ({
      name: line(item.name, t.medium, `${field}.name`, problems),
      issuer: line(item.issuer, t.short, `${field}.issuer`, problems),
      date: date(item.date, `${field}.date`, problems),
      url: url(item.url, `${field}.url`, problems),
      source: source(item.source),
    })),
    volunteering: items(content.volunteering, { max: L.volunteering.max, field: 'content.volunteering', problems, label: 'volunteering entries' }, (item, field) => ({
      role: line(item.role, t.short, `${field}.role`, problems),
      organization: line(item.organization, t.medium, `${field}.organization`, problems),
      startDate: date(item.startDate, `${field}.startDate`, problems),
      endDate: date(item.endDate, `${field}.endDate`, problems, { allowPresent: true }),
      bullets: bulletsOf(item.bullets, `${field}.bullets`, problems, L.volunteering.bullets),
    })),
    coursework: texts(content.coursework, { max: L.coursework.max, length: L.coursework.itemLength, field: 'content.coursework', problems, label: 'courses', unique: true }),
    custom: items(content.custom, { max: L.custom.sections, field: 'content.custom', problems, label: 'custom sections' }, (item, field) => ({
      title: line(item.title, SECTION_TITLE_MAX, `${field}.title`, problems),
      items: items(item.items, { max: L.custom.items, field: `${field}.items`, problems, label: 'entries' }, (entry, entryField) => ({
        title: line(entry.title, t.medium, `${entryField}.title`, problems),
        subtitle: line(entry.subtitle, t.medium, `${entryField}.subtitle`, problems),
        date: line(entry.date, 40, `${entryField}.date`, problems),
        bullets: bulletsOf(entry.bullets, `${entryField}.bullets`, problems, L.custom.bullets),
      })),
    })),
  };

  if (throwOnError) problems.throwIfAny();
  return result;
}

export const emptyContent = () => normalizeContent({});

// ----------------------------------------------------------------------------- layout and settings

/** Section order (every section exactly once, unknown keys dropped), hidden sections and renamed titles. */
export function normalizeSections(input, templateId, problems = new Problems()) {
  const value = plainObject(input);
  const template = templateById(templateId);
  const order = [];
  for (const key of Array.isArray(value.order) ? value.order : []) {
    if (RESUME_SECTION_KEYS.includes(key) && !order.includes(key)) order.push(key);
  }
  for (const key of template?.order ?? RESUME_SECTION_KEYS) if (!order.includes(key)) order.push(key);
  const hidden = (Array.isArray(value.hidden) ? value.hidden : []).filter((key, index, all) => RESUME_SECTION_KEYS.includes(key) && all.indexOf(key) === index);
  const titles = {};
  const titlesIn = value.titles instanceof Map ? Object.fromEntries(value.titles) : plainObject(value.titles);
  for (const [key, title] of Object.entries(titlesIn)) {
    if (!RESUME_SECTION_KEYS.includes(key)) continue;
    const text = line(title, SECTION_TITLE_MAX, `sections.titles.${key}`, problems);
    if (text) titles[key] = text;
  }
  problems.throwIfAny();
  // customOrder: the student arranged the sections themselves, so a template change keeps their order.
  return { order, hidden, titles, customOrder: value.customOrder === true };
}

/** Settings a template offers: an accent or font it doesn't offer falls back to the template's default. */
export function normalizeSettings(input, templateId) {
  const value = plainObject(input);
  const template = templateById(templateId);
  return {
    accent: template.accents.includes(value.accent) ? value.accent : template.accents[0],
    font: template.fonts.includes(value.font) ? value.font : template.fonts[0],
    density: RESUME_DENSITY_IDS.includes(value.density) ? value.density : template.density,
    pageMode: PAGE_MODE_IDS.includes(value.pageMode) ? value.pageMode : template.pageMode,
  };
}

export const defaultSections = (templateId) => normalizeSections({}, templateId);
export const defaultSettings = (templateId) => normalizeSettings({}, templateId);
