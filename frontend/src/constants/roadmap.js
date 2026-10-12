import { BookOpen, Brain, Briefcase, ChartColumn, Dumbbell, Hammer, Layers, Monitor, Server, Shield, Smartphone, Target } from 'lucide-react';

/** Career goal icons (the server sends an icon name). */
export const GOAL_ICONS = { layers: Layers, monitor: Monitor, server: Server, brain: Brain, chart: ChartColumn, shield: Shield, smartphone: Smartphone };
export const goalIcon = (name) => GOAL_ICONS[name] ?? Target;

export const CATEGORY_META = {
  learn: { label: 'Learn', icon: BookOpen },
  practice: { label: 'Practice', icon: Dumbbell },
  build: { label: 'Build', icon: Hammer },
  career: { label: 'Career', icon: Briefcase },
};

export const DIFFICULTY_LABELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

/** Semester states from the server, and how each looks. Amber (never red) for "needs attention". */
export const SEMESTER_STATE_META = {
  completed: { label: 'Completed', badge: 'primary', node: 'border-primary bg-primary text-primary-fg' },
  'in-progress': { label: 'In progress', badge: 'outline', node: 'border-primary bg-surface text-primary' },
  'needs-attention': { label: 'Needs attention', badge: 'accent', node: 'border-sun-400 bg-accent-soft text-accent-fg' },
  upcoming: { label: 'Upcoming', badge: 'neutral', node: 'border-line-strong bg-surface text-ink-muted' },
};

export const NEXT_REASON_LABELS = {
  continue: 'Continue where you left off',
  current: 'Next in your current semester',
  'catch-up': 'Pick up from an earlier semester',
  'get-ahead': 'Get a head start',
};

export const RESOURCE_KIND_LABELS = { docs: 'Docs', course: 'Course', book: 'Free book', practice: 'Practice', campusx: 'On CampusX' };

export const formatHours = (hours) => (hours >= 1 ? `~${hours} h` : 'under an hour');

/**
 * Encouragement from the student's real progress (never invented achievements, never guilt). `semester` is
 * one semester from the roadmap.
 */
export function semesterMessage(semester) {
  const { completed, required } = semester.progress;
  const left = required - completed;
  if (semester.state === 'completed') return `Semester ${semester.semester} is complete. Great work!`;
  if (left === 1) return `One more milestone to complete Semester ${semester.semester}.`;
  if (semester.state === 'needs-attention') return 'A few milestones from this semester are still open. Pick them up whenever they help you.';
  if (completed === 0 && semester.progress.inProgress === 0) return semester.isCurrent ? 'Start with one milestone. Small steps add up.' : `Semester ${semester.semester} is ready whenever you are.`;
  return `Your Semester ${semester.semester} roadmap is taking shape.`;
}

/** The hero line, from overall progress. */
export function journeyMessage(roadmap) {
  const { completed, required } = roadmap.overall;
  if (required > 0 && completed === required) return 'Every required milestone is complete. Your roadmap is done. Keep building!';
  if (completed === 0) return roadmap.overall.inProgress ? 'You’ve started. Your first completed milestone is close.' : 'Your journey starts with a single milestone.';
  return 'Great progress! Your next milestone is waiting.';
}
