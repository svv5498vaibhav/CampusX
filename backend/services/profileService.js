import mongoose from 'mongoose';
import { BYTES_PER_MB, MEDIA_PRESETS } from '../config/media.js';
import { DEFAULT_PROFILE_THEME, PROFILE_RULES, PROFILE_THEMES } from '../data/profileOptions.js';
import User, { ACCOUNT_STATUSES } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { calculateProfileCompletion } from '../utils/profileCompletion.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';
import { getBranch, getCollege, getInterest, getOnboardingOptions, getSemester } from './campusOptionsService.js';
import { ROLL_NUMBER_TAKEN, assertIdentityUnlocked } from './onboardingService.js';

const STUDENT_NOT_FOUND = "We couldn't find that student.";

/** Campus ids resolved to display labels, so any screen (or a future post) can show them directly. */
async function describeCampus(user) {
  const [college, branch, interests] = await Promise.all([
    user.college ? getCollege(user.college) : null,
    user.branch ? getBranch(user.branch) : null,
    Promise.all((user.interests ?? []).map(getInterest)),
  ]);
  const semester = user.semester ? getSemester(user.semester) : null;

  return {
    college: college ? { id: college.id, name: college.name } : null,
    branch: branch ? { id: branch.id, name: branch.name } : null,
    semester: semester ? { value: semester.value, label: semester.label } : null,
    interests: interests.filter(Boolean).map(({ id, name }) => ({ id, name })),
  };
}

/** The short identity shown on posts and comments: name, photo and campus. Nothing private. */
export async function toStudentSummary(user) {
  const [college, branch] = await Promise.all([
    user.college ? getCollege(user.college) : null,
    user.branch ? getBranch(user.branch) : null,
  ]);
  const semester = user.semester ? getSemester(user.semester) : null;

  return {
    id: user._id.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl ?? null,
    college: college ? { id: college.id, name: college.name, shortName: college.aliases?.[0] ?? college.name } : null,
    branch: branch ? { id: branch.id, name: branch.name, shortName: branch.shortName ?? branch.name } : null,
    semester: semester ? { value: semester.value, label: semester.label } : null,
  };
}

/**
 * Summaries for a set of student ids, keyed by id. Only active accounts are included, so content
 * from suspended or closed accounts can be left out by the caller.
 */
export async function getStudentSummaries(ids) {
  const uniqueIds = [...new Set(ids.map(String))];
  if (uniqueIds.length === 0) return new Map();
  const users = await User.find({ _id: { $in: uniqueIds }, status: ACCOUNT_STATUSES.ACTIVE }).select(
    'firstName lastName avatarUrl college branch semester',
  );
  const summaries = await Promise.all(users.map(toStudentSummary));
  return new Map(summaries.map((summary) => [summary.id, summary]));
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Finds active, onboarded students by name (e.g. to add a teammate). Returns the same short public
 * summaries shown on posts: never emails, roll numbers or account details.
 */
export async function searchStudents(search, { excludeId, limit = 8 } = {}) {
  const words = search.trim().split(/\s+/).filter(Boolean).slice(0, 3);
  if (words.length === 0) return [];
  const conditions = words.map((word) => {
    const pattern = new RegExp(`^${escapeRegex(word)}`, 'i');
    return { $or: [{ firstName: pattern }, { lastName: pattern }] };
  });
  const users = await User.find({
    $and: [{ status: ACCOUNT_STATUSES.ACTIVE, onboardingCompleted: true, ...(excludeId && { _id: { $ne: excludeId } }) }, ...conditions],
  })
    .select('firstName lastName avatarUrl college branch semester')
    .sort({ firstName: 1, lastName: 1 })
    .limit(limit);
  return Promise.all(users.map(toStudentSummary));
}

/** What any signed-in student may see. No email, roll number or account/security data. */
async function toPublicProfile(user, viewerId) {
  return {
    id: user._id.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    ...(await describeCampus(user)),
    bio: user.bio ?? '',
    skills: [...(user.skills ?? [])],
    avatarUrl: user.avatarUrl ?? null,
    coverImageUrl: user.coverImageUrl ?? null,
    theme: user.profileTheme ?? DEFAULT_PROFILE_THEME,
    memberSince: user.createdAt,
    isOwner: Boolean(viewerId) && user._id.toString() === String(viewerId),
  };
}

/** The owner's view: the public profile plus their own private details and completeness. */
export async function toOwnProfile(user) {
  return {
    ...(await toPublicProfile(user, user._id)),
    email: user.email,
    rollNumber: user.rollNumber ?? null,
    // Once verified, college and roll number can only be changed by CampusX staff.
    campusIdentityLocked: Boolean(user.isVerified),
    completion: calculateProfileCompletion(user),
  };
}

/**
 * Keeps the stored profileCompleted flag in step with the live calculation.
 * profileCompletedAt records the first time the profile reached 100% and is never cleared.
 */
export async function syncProfileCompletion(user) {
  const { isComplete } = calculateProfileCompletion(user);
  if (isComplete === Boolean(user.profileCompleted)) return;

  const changes = { profileCompleted: isComplete };
  if (isComplete && !user.profileCompletedAt) changes.profileCompletedAt = new Date();
  await User.updateOne({ _id: user._id }, { $set: changes });
  Object.assign(user, changes);
  emitCampusEvent(CAMPUS_EVENTS.STUDENT_PROFILE_CHANGED, { userId: user._id.toString() });
}

export async function getOwnProfile(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.unauthorized('Please log in to continue.');
  await syncProfileCompletion(user);
  return toOwnProfile(user);
}

/** Another student's public profile. Unknown, malformed or inactive accounts all look the same: not found. */
export async function getPublicProfile(targetId, viewerId) {
  if (!mongoose.isValidObjectId(targetId)) throw ApiError.notFound(STUDENT_NOT_FOUND);
  const user = await User.findById(targetId);
  if (!user || user.status !== ACCOUNT_STATUSES.ACTIVE) throw ApiError.notFound(STUDENT_NOT_FOUND);
  return toPublicProfile(user, viewerId);
}

/**
 * Applies validated changes to the signed-in student's own profile. `userId` always comes from
 * the session. College and roll number are campus identity: editable until the account is
 * verified, then locked.
 */
export async function updateProfile(userId, changes) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.unauthorized('Please log in to continue.');

  assertIdentityUnlocked(user, changes);

  for (const [field, value] of Object.entries(changes)) {
    if (value !== undefined) user[field] = value;
  }

  try {
    await user.save();
  } catch (error) {
    if (error?.code === 11000 && error.keyPattern?.rollNumber) {
      throw ApiError.conflict(ROLL_NUMBER_TAKEN, [{ field: 'rollNumber', message: ROLL_NUMBER_TAKEN }]);
    }
    throw error;
  }

  await syncProfileCompletion(user);
  // College, branch or semester may have changed: leaderboards follow the profile.
  emitCampusEvent(CAMPUS_EVENTS.STUDENT_PROFILE_CHANGED, { userId: user._id.toString() });
  return toOwnProfile(user);
}

const mediaRules = (presetName) => {
  const preset = MEDIA_PRESETS[presetName];
  return { maxBytes: preset.maxFileSize, maxMegabytes: preset.maxFileSize / BYTES_PER_MB, mimeTypes: preset.allowedMimeTypes };
};

/** Everything the profile editor needs: campus options, styles and limits, from one source. */
export async function getProfileEditorOptions() {
  return {
    ...(await getOnboardingOptions()),
    profileThemes: PROFILE_THEMES,
    profileRules: PROFILE_RULES,
    media: { avatar: mediaRules('profilePhoto'), cover: mediaRules('coverImage') },
  };
}
