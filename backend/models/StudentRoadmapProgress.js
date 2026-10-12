import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { CAREER_GOAL_IDS, ROADMAP_SEMESTERS, ROADMAP_TEMPLATE_VERSION } from '../data/roadmapOptions.js';

/** One milestone the student started or finished. Milestones without a record are "not started". */
const milestoneProgressSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['in-progress', 'completed'], required: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
    updatedAt: { type: Date },
  },
  { _id: false },
);

/**
 * A student's Semester Roadmap progress: one record per student, written only by
 * services/roadmapService.js for the signed-in student (req.user), never for a user id from a request.
 * Campus details (college, branch, current semester) are read from the User, not copied here.
 *
 * `milestones` is keyed by milestone id (data/roadmapOptions.js). Records are never removed when the
 * student changes career goal or a template changes: milestones outside the current roadmap simply don't
 * count, and count again if they come back. Semester completion and overall progress are always
 * calculated from these records and the current roadmap, never stored.
 */
const roadmapProgressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Null until the record exists; set from the suggestion on the first change, then by the student.
    careerGoal: { type: String, enum: [...CAREER_GOAL_IDS, null], default: null },
    // When the student picked the goal themselves (null = still the suggested goal).
    goalChosenAt: { type: Date, default: null },
    // The semester the student last looked at, so the roadmap reopens there.
    selectedSemester: { type: Number, min: 1, max: ROADMAP_SEMESTERS, default: null },
    milestones: { type: Map, of: milestoneProgressSchema, default: () => new Map() },
    templateVersion: { type: Number, default: ROADMAP_TEMPLATE_VERSION },
    lastActivityAt: { type: Date, default: null },
  },
  { timestamps: true },
);

roadmapProgressSchema.index({ user: 1 }, { unique: true });

const StudentRoadmapProgress = mongoose.model('StudentRoadmapProgress', roadmapProgressSchema);
watchIndexBuild(StudentRoadmapProgress);

export default StudentRoadmapProgress;
