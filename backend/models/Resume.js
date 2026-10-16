import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import {
  DEFAULT_RESUME_TEMPLATE,
  PAGE_MODE_IDS,
  RESUME_ACCENT_IDS,
  RESUME_DENSITY_IDS,
  RESUME_FONT_IDS,
  RESUME_LIMITS,
  RESUME_TEMPLATE_IDS,
  TARGET_ROLE_IDS,
} from '../data/resumeOptions.js';

const settingsSchema = new mongoose.Schema(
  {
    accent: { type: String, enum: RESUME_ACCENT_IDS, default: 'ink' },
    font: { type: String, enum: RESUME_FONT_IDS, default: 'sans' },
    density: { type: String, enum: RESUME_DENSITY_IDS, default: 'standard' },
    pageMode: { type: String, enum: PAGE_MODE_IDS, default: 'multi' },
  },
  { _id: false },
);

/**
 * A student's resume. Private to its owner: written and read only by services/resumeService.js for the
 * signed-in student (req.user), and never part of any profile, search, recommendation or admin view.
 *
 * `content` holds what the resume says (personal details, education, skills, projects, ...). Its shape
 * is checked field by field by services/resumeContent.js before every write, so it is stored as one
 * object rather than a schema per section. `sections` holds the order, the hidden sections and any
 * renamed section titles. `revision` goes up on every change; an update names the revision it was based
 * on, so two tabs can't silently overwrite each other.
 */
const resumeSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: RESUME_LIMITS.name.max },
    // Lower-cased name: one resume per name per student (unique index below).
    nameKey: { type: String, required: true },
    targetRole: { type: String, enum: TARGET_ROLE_IDS, required: true },
    customRole: { type: String, trim: true, maxlength: RESUME_LIMITS.customRole.max, default: '' },
    template: { type: String, enum: RESUME_TEMPLATE_IDS, default: DEFAULT_RESUME_TEMPLATE },
    isDefault: { type: Boolean, default: false },
    settings: { type: settingsSchema, default: () => ({}) },
    sections: {
      order: { type: [String], default: [] },
      hidden: { type: [String], default: [] },
      titles: { type: Map, of: String, default: () => new Map() },
      customOrder: { type: Boolean, default: false },
    },
    content: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    revision: { type: Number, default: 0, min: 0 },
    importedAt: { type: Date, default: null },
    lastExportedAt: { type: Date, default: null },
    exportCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, minimize: false },
);

resumeSchema.index({ owner: 1, updatedAt: -1 });
resumeSchema.index({ owner: 1, nameKey: 1 }, { unique: true });
// At most one default resume per student.
resumeSchema.index({ owner: 1, isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

const Resume = mongoose.model('Resume', resumeSchema);
watchIndexBuild(Resume);

export default Resume;
