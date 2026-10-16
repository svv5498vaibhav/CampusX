import {
  PAGE_MODES,
  RESUME_ACCENTS,
  RESUME_AI_TASKS,
  RESUME_DENSITIES,
  RESUME_FONTS,
  RESUME_LIMITS,
  RESUME_SECTIONS,
  RESUME_TEMPLATES,
  SKILL_GROUPS,
  SUMMARY_TITLES,
  TARGET_ROLES,
  TEMPLATE_CATEGORIES,
} from '../data/resumeOptions.js';
import Resume from '../models/Resume.js';
import ApiError from '../utils/ApiError.js';
import { analyzeResume } from './resumeAnalysisService.js';
import { aiStatus, runResumeAiTask } from './resumeAiService.js';
import { Problems, normalizeContent, normalizeSections, normalizeSettings, templateById } from './resumeContent.js';
import { buildProfileImport } from './resumeImportService.js';

/*
 * Resume Builder. Every function works on the signed-in student's own resumes only: each query is
 * filtered on `owner: user._id` (the user document from authenticate), never on an id from the request,
 * so a student can't read, change, copy, export or delete anyone else's resume; an id that isn't theirs
 * gets the same 404 as one that doesn't exist. Resumes never appear on profiles or in any other API.
 */

const rolesById = new Map(TARGET_ROLES.map((role) => [role.id, role]));
const NOT_FOUND = 'Resume not found.';
const NAME_TAKEN = 'You already have a resume with this name. Please choose another.';
const isDuplicateKey = (error, field) => error?.code === 11000 && (!field || Boolean(error.keyPattern?.[field]));

/** Resume Builder needs the campus profile set up in onboarding (college and branch feed the import). */
export function assertReady(user) {
  if (!user?.onboardingCompleted) throw ApiError.conflict('Finish setting up your CampusX profile to use the Resume Builder.');
}

const own = (user, resumeId) => ({ _id: resumeId, owner: user._id });

// ----------------------------------------------------------------------------- views

const roleLabel = (resume) => (resume.targetRole === 'custom' && resume.customRole ? resume.customRole : (rolesById.get(resume.targetRole)?.label ?? 'Resume'));

/** One saved resume as its owner sees it (the only view of a resume that exists). */
export function resumeView(doc) {
  const sections = doc.sections ?? {};
  return {
    id: doc._id.toString(),
    name: doc.name,
    targetRole: doc.targetRole,
    targetRoleLabel: roleLabel(doc),
    customRole: doc.customRole ?? '',
    template: doc.template,
    isDefault: Boolean(doc.isDefault),
    settings: normalizeSettings(doc.settings, doc.template),
    sections: normalizeSections({ ...sections, titles: sections.titles }, doc.template),
    content: normalizeContent(doc.content, new Problems(), { throwOnError: false }),
    revision: doc.revision ?? 0,
    importedAt: doc.importedAt ?? null,
    lastExportedAt: doc.lastExportedAt ?? null,
    exportCount: doc.exportCount ?? 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** The list view: no content. */
function summaryView(doc) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    targetRole: doc.targetRole,
    targetRoleLabel: roleLabel(doc),
    template: doc.template,
    templateName: templateById(doc.template)?.name ?? doc.template,
    isDefault: Boolean(doc.isDefault),
    revision: doc.revision ?? 0,
    lastExportedAt: doc.lastExportedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ----------------------------------------------------------------------------- options

/** Everything the builder's screens need, from data/resumeOptions.js. */
export function getOptions() {
  return {
    categories: TEMPLATE_CATEGORIES,
    templates: RESUME_TEMPLATES,
    targetRoles: TARGET_ROLES.map(({ id, label, template }) => ({ id, label, template })),
    sections: RESUME_SECTIONS,
    summaryTitles: SUMMARY_TITLES,
    accents: RESUME_ACCENTS,
    fonts: RESUME_FONTS,
    densities: RESUME_DENSITIES,
    pageModes: PAGE_MODES,
    limits: RESUME_LIMITS,
    skillSuggestions: SKILL_GROUPS.flatMap((group) => group.items),
    ai: { ...aiStatus(), tasks: RESUME_AI_TASKS },
  };
}

// ----------------------------------------------------------------------------- reading

export async function listResumes(user) {
  assertReady(user);
  const docs = await Resume.find({ owner: user._id }).select('-content').sort({ isDefault: -1, updatedAt: -1 }).lean();
  const resumes = docs.map(summaryView);
  const defaultResume = resumes.find((resume) => resume.isDefault) ?? null;
  return {
    resumes,
    summary: {
      count: resumes.length,
      max: RESUME_LIMITS.perStudent,
      defaultResume: defaultResume && { id: defaultResume.id, name: defaultResume.name, updatedAt: defaultResume.updatedAt },
      lastUpdatedAt: resumes.reduce((latest, resume) => (!latest || resume.updatedAt > latest ? resume.updatedAt : latest), null),
    },
  };
}

async function findOwn(user, resumeId) {
  const doc = await Resume.findOne(own(user, resumeId)).lean();
  if (!doc) throw ApiError.notFound(NOT_FOUND);
  return doc;
}

export async function getResume(user, resumeId) {
  assertReady(user);
  return resumeView(await findOwn(user, resumeId));
}

export async function getProfileImport(user) {
  assertReady(user);
  return buildProfileImport(user);
}

// ----------------------------------------------------------------------------- writing

const nameKeyOf = (name) => name.toLowerCase();

/** `base`, or `base (2)`, `base (3)` ... whichever the student doesn't use yet. */
async function freeName(user, base) {
  const trimmed = base.slice(0, RESUME_LIMITS.name.max - 5).trim();
  const taken = new Set((await Resume.find({ owner: user._id }).select('nameKey').lean()).map((doc) => doc.nameKey));
  if (!taken.has(nameKeyOf(trimmed))) return trimmed;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${trimmed} (${index})`;
    if (!taken.has(nameKeyOf(candidate))) return candidate;
  }
  return `${trimmed} (${Date.now() % 10000})`;
}

async function assertRoom(user) {
  if ((await Resume.countDocuments({ owner: user._id })) >= RESUME_LIMITS.perStudent) {
    throw ApiError.conflict(`You can keep up to ${RESUME_LIMITS.perStudent} resumes. Delete one you no longer need to create another.`);
  }
}

/** Inserts a resume; the first one a student has becomes their default. */
async function insert(user, fields) {
  const isFirst = !(await Resume.exists({ owner: user._id }));
  try {
    return await Resume.create({ ...fields, owner: user._id, nameKey: nameKeyOf(fields.name), isDefault: isFirst });
  } catch (error) {
    if (isDuplicateKey(error, 'nameKey')) throw ApiError.conflict(NAME_TAKEN, [{ field: 'name', location: 'body', message: NAME_TAKEN }]);
    // Two first resumes created at once: only one can be the default.
    if (isDuplicateKey(error, 'isDefault')) return Resume.create({ ...fields, owner: user._id, nameKey: nameKeyOf(fields.name), isDefault: false });
    throw error;
  }
}

/**
 * A new resume. Starts empty apart from the student's own name and account email (unless `content` is
 * sent), with the template suggested for the target role.
 */
export async function createResume(user, data) {
  assertReady(user);
  await assertRoom(user);
  const role = rolesById.get(data.targetRole);
  const template = data.template ?? role.template;
  const customRole = data.targetRole === 'custom' ? (data.customRole ?? '') : '';
  const name = data.name ?? (await freeName(user, `${customRole || role.label} Resume`));
  const content = normalizeContent(data.content ?? {});
  if (!data.content) {
    content.personal.fullName = `${user.firstName} ${user.lastName}`.trim();
    content.personal.email = user.email;
  }
  const doc = await insert(user, {
    name,
    targetRole: data.targetRole,
    customRole,
    template,
    settings: normalizeSettings(data.settings, template),
    sections: normalizeSections(data.sections, template),
    content,
  });
  return resumeView(doc.toObject());
}

/**
 * Changes a resume. `revision` must be the revision the change was based on: if the resume changed since
 * (another tab, another device), the change is refused with 409 rather than overwriting it.
 */
export async function updateResume(user, resumeId, changes) {
  assertReady(user);
  const current = await findOwn(user, resumeId);
  if (changes.revision !== (current.revision ?? 0)) {
    throw ApiError.conflict('This resume was changed somewhere else (another tab or device). Reload it to get the latest version.', [{ field: 'revision', location: 'body', message: 'Out of date' }]);
  }

  const set = {};
  const template = changes.template ?? current.template;
  if (changes.name !== undefined) Object.assign(set, { name: changes.name, nameKey: nameKeyOf(changes.name) });
  if (changes.targetRole !== undefined) set.targetRole = changes.targetRole;
  const targetRole = changes.targetRole ?? current.targetRole;
  if (changes.customRole !== undefined || changes.targetRole !== undefined) set.customRole = targetRole === 'custom' ? (changes.customRole ?? current.customRole ?? '') : '';
  if (changes.template !== undefined) set.template = template;
  if (changes.content !== undefined) set.content = normalizeContent(changes.content);
  if (changes.settings !== undefined || changes.template !== undefined) set.settings = normalizeSettings({ ...current.settings, ...changes.settings }, template);
  if (changes.sections !== undefined) {
    set.sections = normalizeSections(changes.sections, template);
  } else if (changes.template !== undefined && changes.template !== current.template && !current.sections?.customOrder) {
    // A new template brings its own recommended section order unless the student arranged their own.
    const sections = normalizeSections({ ...current.sections, order: [] }, template);
    set.sections = sections;
  }
  if (changes.markImported) set.importedAt = new Date();

  let doc;
  try {
    doc = await Resume.findOneAndUpdate({ ...own(user, resumeId), revision: current.revision ?? 0 }, { $set: set, $inc: { revision: 1 } }, { new: true }).lean();
  } catch (error) {
    if (isDuplicateKey(error, 'nameKey')) throw ApiError.conflict(NAME_TAKEN, [{ field: 'name', location: 'body', message: NAME_TAKEN }]);
    throw error;
  }
  if (!doc) throw ApiError.conflict('This resume was changed somewhere else (another tab or device). Reload it to get the latest version.', [{ field: 'revision', location: 'body', message: 'Out of date' }]);
  return resumeView(doc);
}

/** A copy with a new name ("Copy of …" unless named), never the default. */
export async function duplicateResume(user, resumeId, { name } = {}) {
  assertReady(user);
  const source = await findOwn(user, resumeId);
  await assertRoom(user);
  const copyName = name ?? (await freeName(user, `Copy of ${source.name}`));
  try {
    const doc = await Resume.create({
      owner: user._id,
      name: copyName,
      nameKey: nameKeyOf(copyName),
      targetRole: source.targetRole,
      customRole: source.customRole ?? '',
      template: source.template,
      isDefault: false,
      settings: normalizeSettings(source.settings, source.template),
      sections: normalizeSections(source.sections, source.template),
      content: normalizeContent(source.content, new Problems(), { throwOnError: false }),
      importedAt: source.importedAt ?? null,
    });
    return resumeView(doc.toObject());
  } catch (error) {
    if (isDuplicateKey(error, 'nameKey')) throw ApiError.conflict(NAME_TAKEN, [{ field: 'name', location: 'body', message: NAME_TAKEN }]);
    throw error;
  }
}

/** Makes one resume the student's default (the one the profile card opens). Doesn't change its revision. */
export async function setDefaultResume(user, resumeId) {
  assertReady(user);
  await findOwn(user, resumeId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await Resume.updateMany({ owner: user._id, isDefault: true, _id: { $ne: resumeId } }, { $set: { isDefault: false } }, { timestamps: false });
    try {
      const doc = await Resume.findOneAndUpdate(own(user, resumeId), { $set: { isDefault: true } }, { new: true, timestamps: false }).lean();
      if (!doc) throw ApiError.notFound(NOT_FOUND);
      return resumeView(doc);
    } catch (error) {
      // Another request made a different resume the default between the two steps: try again.
      if (!isDuplicateKey(error, 'isDefault')) throw error;
    }
  }
  throw ApiError.conflict('Your default resume is being changed elsewhere. Please try again.');
}

/** Deletes a resume. When it was the default, the most recently edited remaining resume takes over. */
export async function deleteResume(user, resumeId) {
  assertReady(user);
  const deleted = await Resume.findOneAndDelete(own(user, resumeId)).lean();
  if (!deleted) throw ApiError.notFound(NOT_FOUND);
  let newDefault = null;
  if (deleted.isDefault) {
    const doc = await Resume.findOneAndUpdate({ owner: user._id }, { $set: { isDefault: true } }, { sort: { updatedAt: -1 }, new: true, timestamps: false }).catch((error) => {
      if (isDuplicateKey(error, 'isDefault')) return null;
      throw error;
    });
    newDefault = doc ? doc._id.toString() : null;
  }
  return { id: deleted._id.toString(), newDefaultId: newDefault };
}

/**
 * Before the browser builds a PDF: the saved resume (owner-checked), with the download counted. The PDF
 * itself is made in the student's browser from exactly this copy.
 */
export async function exportResume(user, resumeId) {
  assertReady(user);
  const doc = await Resume.findOneAndUpdate(own(user, resumeId), { $set: { lastExportedAt: new Date() }, $inc: { exportCount: 1 } }, { new: true, timestamps: false }).lean();
  if (!doc) throw ApiError.notFound(NOT_FOUND);
  return resumeView(doc);
}

// ----------------------------------------------------------------------------- checking and AI

export async function analyze(user, resumeId, { jobDescription = '', pageCount = null } = {}) {
  const resume = await getResume(user, resumeId);
  return analyzeResume(resume, { jobDescription, pageCount });
}

export async function assist(user, resumeId, request) {
  const resume = await getResume(user, resumeId);
  return runResumeAiTask(resume, request);
}
