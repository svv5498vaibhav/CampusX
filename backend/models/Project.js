import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { SEARCH_TEXT_WEIGHTS, searchTextIndex } from '../data/searchOptions.js';
import {
  PROJECT_CATEGORY_IDS,
  PROJECT_RULES,
  PROJECT_STATUS_IDS,
  SHOWCASE_VISIBILITY_IDS,
  TEAM_ROLE_IDS,
  TEAM_STATUSES,
} from '../data/showcaseOptions.js';
import { moderationFields } from './moderationFields.js';

// Images live on Cloudinary; publicId is kept so files can be deleted with the project.
const imageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  width: { type: Number },
  height: { type: Number },
});

// Teammates are CampusX students (references, never typed names). The owner adds them; they
// appear on the project once they accept.
const teamMemberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: TEAM_ROLE_IDS, default: 'developer' },
    status: { type: String, enum: TEAM_STATUSES, default: 'invited' },
  },
  { _id: false },
);

const projectSchema = new mongoose.Schema(
  {
    // Always the signed-in student (req.user), never a value sent by the client.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: PROJECT_RULES.title.max },
    slug: { type: String, required: true, unique: true },
    shortDescription: { type: String, required: true, trim: true, maxlength: PROJECT_RULES.shortDescription.max },
    description: { type: String, required: true, trim: true, maxlength: PROJECT_RULES.description.max },
    category: { type: String, enum: PROJECT_CATEGORY_IDS, required: true },
    techStack: { type: [{ type: String, trim: true, maxlength: PROJECT_RULES.techStack.maxLength }], default: [] },
    githubUrl: { type: String, trim: true, maxlength: PROJECT_RULES.url.maxLength },
    liveUrl: { type: String, trim: true, maxlength: PROJECT_RULES.url.maxLength },
    demoUrl: { type: String, trim: true, maxlength: PROJECT_RULES.url.maxLength },
    // The first image is the project's thumbnail.
    images: { type: [imageSchema], default: [] },
    teamMembers: { type: [teamMemberSchema], default: [] },
    status: { type: String, enum: PROJECT_STATUS_IDS, default: 'in-progress' },
    visibility: { type: String, enum: SHOWCASE_VISIBILITY_IDS, default: 'public' },
    // The owner's pick to show first on their profile.
    featured: { type: Boolean, default: false },
    // The owner's college, kept in step by the server so "college" visibility is matched in the query.
    audience: { college: { type: String } },
    // Counted at most once per student every few hours; the owner's own visits never count.
    views: { type: Number, default: 0, min: 0 },
    // Student ids. Hidden from normal queries; responses only carry the count and the viewer's state.
    likes: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [], select: false },
    ...moderationFields(),
  },
  { timestamps: true },
);

projectSchema.index({ owner: 1, createdAt: -1 });
projectSchema.index({ category: 1, createdAt: -1 });
projectSchema.index({ status: 1 });
projectSchema.index({ visibility: 1, 'audience.college': 1 });
projectSchema.index({ createdAt: -1, _id: -1 });
projectSchema.index({ techStack: 1 });
projectSchema.index({ 'teamMembers.user': 1 });

// Search: weighted keywords, and titles for word-prefix matching ("rea" → "React Campus App").
projectSchema.index(...searchTextIndex(SEARCH_TEXT_WEIGHTS.project));
projectSchema.index({ title: 1 });

const Project = mongoose.model('Project', projectSchema);
watchIndexBuild(Project);

export default Project;
