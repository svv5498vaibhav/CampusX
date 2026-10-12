import {
  BRANCH_TRACKS,
  BRANCH_TRACK_IDS,
  CAREER_GOAL_IDS,
  CAREER_GOALS,
  DEFAULT_CAREER_GOAL,
  DIFFICULTIES,
  MILESTONE_CATEGORIES,
  MILESTONES,
  ROADMAP_SEMESTERS,
  ROADMAP_TEMPLATE_VERSION,
  SEMESTER_FOCUS,
} from '../data/roadmapOptions.js';
import StudentRoadmapProgress from '../models/StudentRoadmapProgress.js';
import ApiError from '../utils/ApiError.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';
import { getBranch, getCollege, getSemester as getSemesterOption } from './campusOptionsService.js';

/*
 * Semester Roadmap. The roadmap a student sees is resolved from data/roadmapOptions.js for their branch
 * track and career goal; their progress lives in StudentRoadmapProgress. Every function works on the
 * signed-in student only (the user document from authenticate), so one student can never read or change
 * another's progress.
 *
 * Progress is always calculated, never stored: a semester is complete when every required milestone in
 * it is complete, overall progress is completed required milestones / required milestones. Completion
 * events go to services/gamificationEvents.js, which awards (once per semester, ever) from the stored state.
 */

const goalsById = new Map(CAREER_GOALS.map((goal) => [goal.id, goal]));
const SEMESTER_NUMBERS = Array.from({ length: ROADMAP_SEMESTERS }, (_, index) => index + 1);
const percent = (done, total) => (total > 0 ? Math.floor((done / total) * 100) : 0);

// ----------------------------------------------------------------------------- resolving a roadmap

export const trackOf = (branchId) => BRANCH_TRACKS.find((track) => track.branches.includes(branchId))?.id ?? 'core';

/** The goal a student gets before choosing one: their first interest a goal lists, then their branch. */
export function suggestedGoalFor(user) {
  for (const interest of user.interests ?? []) {
    const goal = CAREER_GOALS.find((item) => item.interests.includes(interest));
    if (goal) return goal.id;
  }
  return CAREER_GOALS.find((item) => item.branches.includes(user.branch))?.id ?? DEFAULT_CAREER_GOAL;
}

const effectiveGoal = (user, progress) => (CAREER_GOAL_IDS.includes(progress?.careerGoal) ? progress.careerGoal : suggestedGoalFor(user));

const appliesTo = (milestone, goal, track) => (!milestone.goals || milestone.goals.includes(goal)) && (!milestone.tracks || milestone.tracks.includes(track));

function isRequired(milestone, goal, track) {
  if (milestone.requiredFor?.goals?.includes(goal)) return true;
  return !(milestone.optionalFor?.tracks?.includes(track) || milestone.optionalFor?.goals?.includes(goal));
}

/**
 * The milestones of one roadmap (goal + track), in catalog order, with the goal's variant applied.
 * Prerequisites outside this roadmap are dropped.
 */
export function resolveRoadmap(goal, track) {
  const milestones = MILESTONES.filter((milestone) => appliesTo(milestone, goal, track)).map((milestone) => {
    const variant = milestone.variants?.goals?.[goal] ?? {};
    return {
      id: milestone.id,
      semester: milestone.semester,
      title: variant.title ?? milestone.title,
      summary: variant.summary ?? milestone.summary,
      category: milestone.category,
      difficulty: milestone.difficulty,
      effortHours: milestone.effortHours,
      required: isRequired(milestone, goal, track),
      objectives: [...(variant.objectives ?? milestone.objectives ?? [])],
      skills: [...new Set([...(milestone.skills ?? []), ...(variant.skills ?? [])])],
      resources: (variant.resources ?? milestone.resources ?? []).map((resource) => ({ ...resource })),
      project: variant.project ?? milestone.project ?? null,
      prerequisites: [...new Set([...(milestone.prerequisites ?? []), ...(variant.prerequisites ?? [])])],
    };
  });
  const ids = new Set(milestones.map((milestone) => milestone.id));
  for (const milestone of milestones) milestone.prerequisites = milestone.prerequisites.filter((id) => ids.has(id));
  return milestones;
}

// Every goal on every track must have required milestones in every semester (checked once at start-up).
for (const goal of CAREER_GOAL_IDS) {
  for (const track of BRANCH_TRACK_IDS) {
    const roadmap = resolveRoadmap(goal, track);
    for (const semester of SEMESTER_NUMBERS) {
      if (!roadmap.some((milestone) => milestone.semester === semester && milestone.required)) throw new Error(`Roadmap catalog: ${goal}/${track} has no required milestone in semester ${semester}`);
    }
  }
}

// ----------------------------------------------------------------------------- progress maths

/** milestones as a plain object (lean documents give one; a Map is converted). */
const recordsOf = (progress) => {
  const records = progress?.milestones ?? {};
  return records instanceof Map ? Object.fromEntries(records) : records;
};
const statusOf = (records, id) => records[id]?.status ?? 'not-started';

/** Whether each semester is complete for this roadmap and these records: { [semester]: boolean }. */
export function semesterCompletion(roadmap, records) {
  return Object.fromEntries(
    SEMESTER_NUMBERS.map((semester) => {
      const required = roadmap.filter((milestone) => milestone.semester === semester && milestone.required);
      return [semester, required.length > 0 && required.every((milestone) => statusOf(records, milestone.id) === 'completed')];
    }),
  );
}

function semesterState({ semester, complete, started, currentSemester }) {
  if (complete) return 'completed';
  if (semester === currentSemester) return 'in-progress';
  if (semester < currentSemester) return 'needs-attention';
  return started ? 'in-progress' : 'upcoming';
}

/**
 * What to do next: a milestone already in progress this semester, then the next one this semester whose
 * prerequisites are done, then an open one from an earlier semester, then one from the next semesters.
 */
function pickNextMilestone(milestones, currentSemester) {
  const open = milestones.filter((milestone) => milestone.required && milestone.status !== 'completed');
  if (!open.length) return null;
  // Prerequisites are already resolved to { id, title, completed } here.
  const ready = (milestone) => milestone.prerequisites.every((item) => item.completed);
  const firstOf = (list) => list.find(ready) ?? list[0];
  const current = open.filter((milestone) => milestone.semester === currentSemester);
  const earlier = open.filter((milestone) => milestone.semester < currentSemester);
  let milestone = current.find((item) => item.status === 'in-progress');
  let reason = 'continue';
  if (!milestone && current.length) [milestone, reason] = [firstOf(current), 'current'];
  if (!milestone && earlier.length) [milestone, reason] = [firstOf(earlier), 'catch-up'];
  if (!milestone) [milestone, reason] = [firstOf(open), 'get-ahead'];
  return { id: milestone.id, semester: milestone.semester, title: milestone.title, category: milestone.category, effortHours: milestone.effortHours, status: milestone.status, reason };
}

const goalView = (goal, suggested) => ({ id: goal.id, title: goal.title, journey: goal.journey, tagline: goal.tagline, icon: goal.icon, suggested: goal.id === suggested });

/**
 * The full roadmap for a student and their progress record (or null before their first change). Only
 * the student's own data and published template content.
 */
export async function buildRoadmapView(user, progress) {
  const records = recordsOf(progress);
  const suggested = suggestedGoalFor(user);
  const goalId = effectiveGoal(user, progress);
  const track = trackOf(user.branch);
  const currentSemester = user.semester;
  const roadmap = resolveRoadmap(goalId, track);
  const titles = new Map(roadmap.map((milestone) => [milestone.id, milestone.title]));
  const goal = goalsById.get(goalId);

  const milestones = roadmap.map((milestone) => {
    const record = records[milestone.id];
    return {
      ...milestone,
      prerequisites: milestone.prerequisites.map((id) => ({ id, title: titles.get(id), completed: statusOf(records, id) === 'completed' })),
      status: record?.status ?? 'not-started',
      startedAt: record?.startedAt ?? null,
      completedAt: record?.status === 'completed' ? (record.completedAt ?? null) : null,
    };
  });

  const semesters = SEMESTER_NUMBERS.map((semester) => {
    const items = milestones.filter((milestone) => milestone.semester === semester);
    const required = items.filter((milestone) => milestone.required);
    const optional = items.filter((milestone) => !milestone.required);
    const completed = required.filter((milestone) => milestone.status === 'completed');
    const complete = required.length > 0 && completed.length === required.length;
    const started = items.some((milestone) => milestone.status !== 'not-started');
    const focus = SEMESTER_FOCUS[semester];
    return {
      semester,
      title: focus.title,
      summary: focus.summary.replace('{journey}', goal.journey),
      state: semesterState({ semester, complete, started, currentSemester }),
      isCurrent: semester === currentSemester,
      progress: {
        completed: completed.length,
        required: required.length,
        inProgress: items.filter((milestone) => milestone.status === 'in-progress').length,
        optionalCompleted: optional.filter((milestone) => milestone.status === 'completed').length,
        optional: optional.length,
        percentage: percent(completed.length, required.length),
      },
      // When the last required milestone was completed.
      completedAt: complete ? new Date(Math.max(...completed.map((milestone) => new Date(milestone.completedAt ?? 0).getTime()))) : null,
      effortHoursRemaining: required.filter((milestone) => milestone.status !== 'completed').reduce((sum, milestone) => sum + milestone.effortHours, 0),
      milestones: items,
    };
  });

  const required = milestones.filter((milestone) => milestone.required);
  const completedRequired = required.filter((milestone) => milestone.status === 'completed').length;
  const profileSkills = new Set((user.skills ?? []).map((skill) => skill.toLowerCase()));
  const skills = new Map();
  for (const milestone of milestones) {
    for (const name of milestone.skills) {
      const entry = skills.get(name) ?? { name, completed: 0, total: 0, onProfile: profileSkills.has(name.toLowerCase()), firstSemester: milestone.semester };
      entry.total += 1;
      if (milestone.status === 'completed') entry.completed += 1;
      skills.set(name, entry);
    }
  }
  const inRoadmap = new Set(roadmap.map((milestone) => milestone.id));
  const [college, branch] = await Promise.all([getCollege(user.college), getBranch(user.branch)]);

  return {
    template: { version: ROADMAP_TEMPLATE_VERSION, note: 'Suggested by CampusX for your branch and goal. Not an official university syllabus.' },
    student: {
      college: college ? { id: college.id, name: college.name } : null,
      branch: branch ? { id: branch.id, name: branch.name, shortName: branch.shortName } : null,
      track: BRANCH_TRACKS.find((item) => item.id === track) ? { id: track, label: BRANCH_TRACKS.find((item) => item.id === track).label } : null,
      currentSemester,
      semesterLabel: getSemesterOption(currentSemester)?.label ?? null,
      totalSemesters: ROADMAP_SEMESTERS,
    },
    careerGoal: { ...goalView(goal, suggested), source: progress?.goalChosenAt ? 'chosen' : 'suggested' },
    goals: CAREER_GOALS.map((item) => goalView(item, suggested)),
    selectedSemester: progress?.selectedSemester ?? null,
    semesters,
    overall: {
      completed: completedRequired,
      required: required.length,
      remaining: required.length - completedRequired,
      percentage: percent(completedRequired, required.length),
      inProgress: milestones.filter((milestone) => milestone.status === 'in-progress').length,
      optionalCompleted: milestones.filter((milestone) => !milestone.required && milestone.status === 'completed').length,
      semestersCompleted: semesters.filter((semester) => semester.state === 'completed').length,
    },
    nextMilestone: pickNextMilestone(milestones, currentSemester),
    skills: [...skills.values()].sort((a, b) => a.firstSemester - b.firstSemester || a.name.localeCompare(b.name)).map(({ firstSemester, ...skill }) => skill),
    // Completed milestones kept from another goal (or an older template): they count again if they come back.
    savedElsewhere: Object.entries(records).filter(([id, record]) => record.status === 'completed' && !inRoadmap.has(id)).length,
    lastActivityAt: progress?.lastActivityAt ?? null,
  };
}

// ----------------------------------------------------------------------------- reads

/** The roadmap needs the campus details from onboarding (branch and current semester). */
function assertReady(user) {
  if (!user?.onboardingCompleted || !user.branch || !user.semester) throw ApiError.conflict('Finish onboarding to see your semester roadmap.');
}

const loadProgress = (userId) => StudentRoadmapProgress.findOne({ user: userId }).lean();

export async function getMyRoadmap(user) {
  assertReady(user);
  return buildRoadmapView(user, await loadProgress(user._id));
}

export async function getSemester(user, semester) {
  const view = await getMyRoadmap(user);
  return { careerGoal: view.careerGoal, student: view.student, semester: view.semesters[semester - 1] };
}

/** The short summary the profile page shows. */
export async function getProgressSummary(user) {
  const view = await getMyRoadmap(user);
  return {
    careerGoal: { id: view.careerGoal.id, title: view.careerGoal.title, journey: view.careerGoal.journey, source: view.careerGoal.source },
    currentSemester: view.student.currentSemester,
    totalSemesters: view.student.totalSemesters,
    overall: view.overall,
    semesters: view.semesters.map(({ semester, state, isCurrent, progress }) => ({ semester, state, isCurrent, progress })),
    nextMilestone: view.nextMilestone,
    lastActivityAt: view.lastActivityAt,
  };
}

/** The published templates for the student's branch track: each goal with its milestone counts per semester. */
export async function getTemplates(user) {
  assertReady(user);
  const track = trackOf(user.branch);
  const suggested = suggestedGoalFor(user);
  return {
    version: ROADMAP_TEMPLATE_VERSION,
    track: { id: track, label: BRANCH_TRACKS.find((item) => item.id === track).label },
    goals: CAREER_GOALS.map((goal) => {
      const roadmap = resolveRoadmap(goal.id, track);
      return {
        ...goalView(goal, suggested),
        milestones: roadmap.filter((milestone) => milestone.required).length,
        optionalMilestones: roadmap.filter((milestone) => !milestone.required).length,
        effortHours: roadmap.filter((milestone) => milestone.required).reduce((sum, milestone) => sum + milestone.effortHours, 0),
        semesters: SEMESTER_NUMBERS.map((semester) => ({ semester, milestones: roadmap.filter((milestone) => milestone.semester === semester && milestone.required).length })),
      };
    }),
    categories: MILESTONE_CATEGORIES,
    difficulties: DIFFICULTIES,
  };
}

// ----------------------------------------------------------------------------- changes

/**
 * The student's record, created on their first change with the goal they currently see (so a later
 * change of interests never swaps the roadmap under them). Simultaneous first changes share one record.
 */
async function ensureProgress(user) {
  const create = () =>
    StudentRoadmapProgress.findOneAndUpdate(
      { user: user._id },
      { $setOnInsert: { user: user._id, careerGoal: suggestedGoalFor(user), templateVersion: ROADMAP_TEMPLATE_VERSION } },
      { upsert: true, returnDocument: 'after', lean: true },
    );
  try {
    return await create();
  } catch (error) {
    if (error?.code === 11000) return create();
    throw error;
  }
}

const changed = (userId, semesters) => emitCampusEvent(CAMPUS_EVENTS.ROADMAP_PROGRESS_CHANGED, { userId: userId.toString(), semesters });

/**
 * Sets one milestone of the student's current roadmap to not-started, in-progress or completed. The
 * update is conditional on the milestone not already being in that state, so double clicks, retries and
 * simultaneous requests change it once (`changed: false` for the rest). `semesterCompleted` is true only
 * for the one change that completed the semester.
 */
export async function setMilestoneStatus(user, milestoneId, status) {
  assertReady(user);
  const progress = await ensureProgress(user);
  const roadmap = resolveRoadmap(effectiveGoal(user, progress), trackOf(user.branch));
  const milestone = roadmap.find((item) => item.id === milestoneId);
  if (!milestone) {
    throw ApiError.notFound(MILESTONES.some((item) => item.id === milestoneId) ? 'This milestone is not part of your current roadmap.' : 'Milestone not found.');
  }

  const now = new Date();
  const path = `milestones.${milestoneId}`;
  const common = { lastActivityAt: now, templateVersion: ROADMAP_TEMPLATE_VERSION };
  let filter;
  let update;
  if (status === 'completed') {
    filter = { [`${path}.status`]: { $ne: 'completed' } };
    update = { $set: { ...common, [`${path}.status`]: 'completed', [`${path}.completedAt`]: now, [`${path}.updatedAt`]: now } };
  } else if (status === 'in-progress') {
    filter = { [`${path}.status`]: { $ne: 'in-progress' } };
    update = { $set: { ...common, [`${path}.status`]: 'in-progress', [`${path}.startedAt`]: now, [`${path}.updatedAt`]: now }, $unset: { [`${path}.completedAt`]: 1 } };
  } else {
    filter = { [path]: { $exists: true } };
    update = { $set: common, $unset: { [path]: 1 } };
  }

  const before = await StudentRoadmapProgress.findOneAndUpdate({ user: user._id, ...filter }, update, { returnDocument: 'before', lean: true });
  let semesterCompleted = false;
  if (before) {
    // Completion is judged on this change alone (the state just before it, plus it), so when two
    // requests finish a semester together exactly one of them reports it.
    const recordsBefore = recordsOf(before);
    const recordsAfter = { ...recordsBefore };
    if (status === 'not-started') delete recordsAfter[milestoneId];
    else recordsAfter[milestoneId] = { status };
    semesterCompleted = !semesterCompletion(roadmap, recordsBefore)[milestone.semester] && semesterCompletion(roadmap, recordsAfter)[milestone.semester];
    changed(user._id, [milestone.semester]);
  }

  const roadmapView = await buildRoadmapView(user, await loadProgress(user._id));
  const current = roadmapView.semesters[milestone.semester - 1].milestones.find((item) => item.id === milestoneId);
  return { milestone: current, changed: Boolean(before), semesterCompleted, roadmap: roadmapView };
}

/**
 * Career goal and/or the semester to reopen. Changing the goal never deletes progress: milestones shared
 * by both goals stay complete, the others are kept and count again if the student switches back.
 */
export async function updatePreferences(user, { careerGoal, selectedSemester }) {
  assertReady(user);
  const previous = await ensureProgress(user);
  const previousGoal = effectiveGoal(user, previous);
  const now = new Date();
  const $set = { lastActivityAt: now };
  if (selectedSemester !== undefined) $set.selectedSemester = selectedSemester;
  const goalChanged = careerGoal !== undefined && careerGoal !== previousGoal;
  if (careerGoal !== undefined) {
    $set.careerGoal = careerGoal;
    // Picking the goal you already have still makes it your own choice.
    if (goalChanged || !previous.goalChosenAt) $set.goalChosenAt = now;
  }
  await StudentRoadmapProgress.updateOne({ user: user._id }, { $set });
  if (goalChanged) changed(user._id, SEMESTER_NUMBERS);

  const roadmap = await buildRoadmapView(user, await loadProgress(user._id));
  let goalChange = null;
  if (goalChanged) {
    const records = recordsOf(previous);
    const completed = Object.keys(records).filter((id) => records[id].status === 'completed');
    const nowIn = new Set(roadmap.semesters.flatMap((semester) => semester.milestones.map((milestone) => milestone.id)));
    goalChange = { from: previousGoal, to: careerGoal, carriedOver: completed.filter((id) => nowIn.has(id)).length, saved: completed.filter((id) => !nowIn.has(id)).length };
  }
  return { roadmap, goalChange };
}

/**
 * For services/gamificationEvents.js: which semesters of the student's roadmap are complete right now,
 * read from the database. Null when the student has no roadmap record or can't have a roadmap.
 */
export async function completedSemestersOf(userId, user) {
  const progress = await loadProgress(userId);
  if (!progress || !user?.branch || !user.semester) return null;
  return semesterCompletion(resolveRoadmap(effectiveGoal(user, progress), trackOf(user.branch)), recordsOf(progress));
}

export { SEMESTER_NUMBERS as ROADMAP_SEMESTER_NUMBERS };
