import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { DEFAULT_PROFILE_THEME, PROFILE_RULES, PROFILE_THEME_IDS } from '../data/profileOptions.js';

export const ROLES = Object.freeze({
  STUDENT: 'student',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
});

/**
 * active      can use CampusX (new accounts start here until email verification exists)
 * pending     reserved for accounts awaiting verification
 * suspended   temporarily barred by moderation
 * blocked     permanently barred
 * deactivated closed by the account owner
 * deleting    the owner confirmed deletion; locked while services/accountDeletionService.js removes its
 *             data (the document itself is deleted last, so this status is normally seen only for seconds)
 */
export const ACCOUNT_STATUSES = Object.freeze({
  PENDING: 'pending',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  BLOCKED: 'blocked',
  DEACTIVATED: 'deactivated',
  DELETING: 'deleting',
});

export const NAME_MAX_LENGTH = 50;
export const EMAIL_MAX_LENGTH = 254;

// Fields that must never leave the server, even if a document is serialised by mistake.
const PRIVATE_FIELDS = [
  'passwordHash',
  'failedLoginAttempts',
  'lockedUntil',
  'lastLoginIp',
  'registrationIp',
  'avatarPublicId',
  'coverImagePublicId',
  'moderation',
];

/**
 * Internal trust profile (Trust & Safety). Written only by services/moderationService.js; never sent to
 * anyone, the student included (no "your risk score is 73"). Missing on older accounts = all defaults.
 */
const trustSchema = new mongoose.Schema(
  {
    riskScore: { type: Number, default: 0, min: 0, max: 100 },
    riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
    warningCount: { type: Number, default: 0, min: 0 },
    violationCount: { type: Number, default: 0, min: 0 },
    // Recent violations, newest last (only the last few are kept), for progressive enforcement.
    violationDates: { type: [Date], default: [] },
    lastModerationAt: { type: Date, default: null },
    // Temporary restriction: no new posts, comments or other new content until then.
    restrictedUntil: { type: Date, default: null },
    reportsFiled: { type: Number, default: 0, min: 0 },
    reportsDismissed: { type: Number, default: 0, min: 0 },
    flags: { type: [String], default: [] },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: EMAIL_MAX_LENGTH,
    },
    passwordHash: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true, maxlength: NAME_MAX_LENGTH },
    lastName: { type: String, required: true, trim: true, maxlength: NAME_MAX_LENGTH },

    // Campus identity, collected during onboarding. college/branch/interests hold stable option
    // ids from data/campusOptions.js (e.g. "vnit-nagpur", "cse"), never display text. Fields stay
    // unset rather than null until provided, because MongoDB indexes explicit nulls and that would
    // clash with the unique roll-number index below.
    college: { type: String, trim: true, maxlength: 100 },
    branch: { type: String, trim: true, maxlength: 50 },
    semester: { type: Number, min: 1, max: 8 },
    rollNumber: { type: String, trim: true, uppercase: true, maxlength: 30 },
    interests: { type: [String], default: [] },
    skills: { type: [String], default: [] },

    role: { type: String, enum: Object.values(ROLES), default: ROLES.STUDENT },
    status: { type: String, enum: Object.values(ACCOUNT_STATUSES), default: ACCOUNT_STATUSES.ACTIVE },

    emailVerified: { type: Boolean, default: false },
    // Campus/student verification (separate from owning the email address).
    isVerified: { type: Boolean, default: false },
    onboardingCompleted: { type: Boolean, default: false },
    onboardingCompletedAt: { type: Date },

    // Profile. Images live on Cloudinary; only the display URL and the public id (needed to
    // replace or delete the file) are stored here.
    avatarUrl: { type: String },
    avatarPublicId: { type: String, select: false },
    coverImageUrl: { type: String },
    coverImagePublicId: { type: String, select: false },
    bio: { type: String, trim: true, maxlength: PROFILE_RULES.bio.maxLength, default: '' },
    profileTheme: { type: String, enum: PROFILE_THEME_IDS, default: DEFAULT_PROFILE_THEME },
    // Every profile-completion item filled (see utils/profileCompletion.js). The date marks the
    // first time the profile reached 100% and is kept even if something is removed later.
    profileCompleted: { type: Boolean, default: false },
    profileCompletedAt: { type: Date },

    // Login security; hidden from queries unless explicitly selected.
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null, select: false },
    registrationIp: { type: String, default: null, select: false },

    moderation: { type: trustSchema, default: () => ({}), select: false },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        for (const field of PRIVATE_FIELDS) delete ret[field];
        return ret;
      },
    },
  },
);

// One account per roll number at each college. The same number at another college is fine,
// and accounts that haven't onboarded yet (no roll number) are left out of the index.
userSchema.index(
  { college: 1, rollNumber: 1 },
  { unique: true, partialFilterExpression: { rollNumber: { $type: 'string' } } },
);

/**
 * The account owner's view of their own user. Built from an allow-list, so new
 * schema fields stay private until they are added here on purpose.
 */
export function toSafeUser(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    isVerified: user.isVerified,
    onboardingCompleted: user.onboardingCompleted,
    onboardingCompletedAt: user.onboardingCompletedAt ?? null,
    college: user.college ?? null,
    branch: user.branch ?? null,
    semester: user.semester ?? null,
    rollNumber: user.rollNumber ?? null,
    interests: [...(user.interests ?? [])],
    skills: [...(user.skills ?? [])],
    avatarUrl: user.avatarUrl ?? null,
    coverImageUrl: user.coverImageUrl ?? null,
    bio: user.bio,
    profileTheme: user.profileTheme ?? DEFAULT_PROFILE_THEME,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

// Search & Discovery: the student filters (college → branch → semester), the skill filter, and names
// for prefix matching, suggestions and A–Z order.
userSchema.index({ college: 1, branch: 1, semester: 1 });
userSchema.index({ skills: 1 });
// Recommendations: students who share an interest ("Students with similar interests").
userSchema.index({ interests: 1 });
userSchema.index({ firstName: 1, lastName: 1 });

const User = mongoose.model('User', userSchema);
watchIndexBuild(User);

export default User;
