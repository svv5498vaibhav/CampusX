import api from './api';

const unwrap = (response) => response.data.data;

/**
 * Semester Roadmap of the signed-in student. No call sends a user id: the server always uses the session.
 * Changes answer with the whole updated roadmap, so the page never calculates progress itself.
 */
export const roadmapApi = {
  /** { student, careerGoal, goals, selectedSemester, semesters[8], overall, nextMilestone, skills, savedElsewhere, lastActivityAt, template } */
  me: () => api.get('/roadmap/me').then(unwrap),
  /** Short summary for the profile page: { careerGoal, currentSemester, totalSemesters, overall, semesters, nextMilestone } */
  progress: () => api.get('/roadmap/progress').then(unwrap),
  /** Every career goal for the student's branch track, with milestone counts. */
  templates: () => api.get('/roadmap/templates').then(unwrap),
  /** { careerGoal?, selectedSemester? } → { roadmap, goalChange } */
  updatePreferences: (changes) => api.put('/roadmap/preferences', changes).then(unwrap),
  /** status: 'not-started' | 'in-progress' | 'completed' → { milestone, changed, semesterCompleted, roadmap } */
  setMilestoneStatus: (milestoneId, status) =>
    status === 'completed'
      ? api.patch(`/roadmap/milestones/${encodeURIComponent(milestoneId)}/complete`).then(unwrap)
      : api.patch(`/roadmap/milestones/${encodeURIComponent(milestoneId)}/progress`, { status }).then(unwrap),
};
