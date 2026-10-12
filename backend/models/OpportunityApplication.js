import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { OPPORTUNITY_RULES, TRACKING_STATUS_IDS } from '../data/opportunityOptions.js';

/**
 * A student's own tracking of one opportunity: saved, interested, applied, and what happened next.
 * Every status is set by the student (CampusX can't see external applications) and is private to them.
 * `user` is always the signed-in student; one record per student per opportunity.
 */
const opportunityApplicationSchema = new mongoose.Schema(
  {
    opportunity: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: TRACKING_STATUS_IDS, default: 'saved' },
    // When the student first marked it as applied (kept if they later move on to an outcome).
    appliedAt: { type: Date },
    statusChangedAt: { type: Date, default: Date.now },
    notes: { type: String, trim: true, maxlength: OPPORTUNITY_RULES.notes.max, default: '' },
  },
  { timestamps: true },
);

opportunityApplicationSchema.index({ opportunity: 1, user: 1 }, { unique: true });
opportunityApplicationSchema.index({ user: 1, status: 1, updatedAt: -1 });
// For later phases (e.g. deadline reminders to everyone tracking an opportunity).
opportunityApplicationSchema.index({ opportunity: 1, status: 1 });

const OpportunityApplication = mongoose.model('OpportunityApplication', opportunityApplicationSchema);
watchIndexBuild(OpportunityApplication);

export default OpportunityApplication;
