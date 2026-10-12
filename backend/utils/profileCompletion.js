/**
 * Profile completeness: eight equal parts. After onboarding a student already has most of them
 * (name, college, branch, semester, interests), so a photo and a short bio are usually all
 * that's left. Completeness should encourage, not gatekeep.
 */
const CHECKS = [
  { id: 'name', label: 'Your name', isDone: (user) => Boolean(user.firstName && user.lastName) },
  { id: 'college', label: 'College', isDone: (user) => Boolean(user.college) },
  { id: 'branch', label: 'Branch', isDone: (user) => Boolean(user.branch) },
  { id: 'semester', label: 'Semester', isDone: (user) => Boolean(user.semester) },
  { id: 'photo', label: 'Profile photo', isDone: (user) => Boolean(user.avatarUrl) },
  { id: 'bio', label: 'A short bio', isDone: (user) => Boolean(user.bio?.trim()) },
  { id: 'skills', label: 'At least one skill', isDone: (user) => (user.skills?.length ?? 0) > 0 },
  { id: 'interests', label: 'Interests', isDone: (user) => (user.interests?.length ?? 0) > 0 },
];

/** { percent: 0–100, isComplete, items: [{ id, label, done }] } */
export function calculateProfileCompletion(user) {
  const items = CHECKS.map(({ id, label, isDone }) => ({ id, label, done: isDone(user) }));
  const doneCount = items.filter((item) => item.done).length;
  const percent = Math.round((doneCount / items.length) * 100);
  return { percent, isComplete: doneCount === items.length, items };
}
