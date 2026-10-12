import { create } from 'zustand';
import { roadmapApi } from '@/services/roadmapApi';
import { toast } from '@/store/toastStore';

const INITIAL_STATE = {
  viewerId: null,
  roadmap: null,
  status: 'idle', // idle | loading | ready | error
  error: null,
  errorStatus: 0,
  // Milestone id → the status being saved. One request per milestone at a time (no double clicks).
  pending: {},
  // The last change this tab made ({ id, status, at }), for the card's success animation.
  lastChange: null,
  // A semester this tab just completed ({ semester, at }); cleared when dismissed.
  celebration: null,
  savingGoal: false,
  templates: null,
  // The profile page's short summary.
  summary: null,
  summaryStatus: 'idle',
};

/** The short summary the profile card shows, taken from a full roadmap (same shape as GET /roadmap/progress). */
const summaryOf = (roadmap) => ({
  careerGoal: roadmap.careerGoal,
  currentSemester: roadmap.student.currentSemester,
  totalSemesters: roadmap.student.totalSemesters,
  overall: roadmap.overall,
  semesters: roadmap.semesters.map(({ semester, state, isCurrent, progress }) => ({ semester, state, isCurrent, progress })),
  nextMilestone: roadmap.nextMilestone,
  lastActivityAt: roadmap.lastActivityAt,
});

/**
 * The signed-in student's Semester Roadmap. Every number shown comes from the server's answer: a change
 * is shown (and animated) only after the server saved it.
 */
export const useRoadmapStore = create((set, get) => ({
  ...INITIAL_STATE,

  forViewer: (userId) => {
    if (get().viewerId !== userId) set({ ...INITIAL_STATE, viewerId: userId });
  },

  fetchRoadmap: async () => {
    set({ status: get().roadmap ? 'ready' : 'loading', error: null, errorStatus: 0 });
    try {
      const roadmap = await roadmapApi.me();
      set({ roadmap, status: 'ready', summary: summaryOf(roadmap), summaryStatus: 'ready' });
    } catch (error) {
      set({ status: get().roadmap ? 'ready' : 'error', error: error.message, errorStatus: error.status });
    }
  },

  fetchSummary: async () => {
    set({ summaryStatus: get().summary ? 'ready' : 'loading' });
    try {
      set({ summary: await roadmapApi.progress(), summaryStatus: 'ready' });
    } catch {
      set({ summaryStatus: 'error' });
    }
  },

  loadTemplates: async () => {
    if (get().templates) return;
    try {
      set({ templates: await roadmapApi.templates() });
    } catch {
      /* the goal picker works without the counts */
    }
  },

  /** Saves a milestone's status. Returns true when the server saved it. */
  setMilestoneStatus: async (milestoneId, status) => {
    if (get().pending[milestoneId]) return false;
    set((state) => ({ pending: { ...state.pending, [milestoneId]: status } }));
    try {
      const result = await roadmapApi.setMilestoneStatus(milestoneId, status);
      set((state) => ({
        roadmap: result.roadmap,
        summary: summaryOf(result.roadmap),
        lastChange: result.changed ? { id: milestoneId, status, category: result.milestone?.category, at: Date.now() } : state.lastChange,
        celebration: result.semesterCompleted ? { semester: result.milestone.semester, at: Date.now() } : state.celebration,
      }));
      return true;
    } catch (error) {
      toast.error(error.status === 404 ? error.message : `Couldn't save that change. ${error.message}`);
      return false;
    } finally {
      set((state) => {
        const { [milestoneId]: _done, ...rest } = state.pending;
        return { pending: rest };
      });
    }
  },

  /** Switches career goal. Completed milestones are kept on the server either way. */
  changeGoal: async (careerGoal) => {
    set({ savingGoal: true });
    try {
      const { roadmap, goalChange } = await roadmapApi.updatePreferences({ careerGoal });
      set({ roadmap, summary: summaryOf(roadmap), savingGoal: false, celebration: null });
      if (goalChange) {
        const parts = [`Your goal is now ${roadmap.careerGoal.title}.`];
        if (goalChange.carriedOver) parts.push(`${goalChange.carriedOver} completed ${goalChange.carriedOver === 1 ? 'milestone carries' : 'milestones carry'} over.`);
        if (goalChange.saved) parts.push(`${goalChange.saved} saved for if you switch back.`);
        toast.success(parts.join(' '));
      }
      return true;
    } catch (error) {
      set({ savingGoal: false });
      toast.error(`Couldn't change your goal. ${error.message}`);
      return false;
    }
  },

  /** Remembers the semester the student is looking at (quietly; the URL already keeps it for this tab). */
  saveSelectedSemester: async (selectedSemester) => {
    if (get().roadmap?.selectedSemester === selectedSemester) return;
    try {
      await roadmapApi.updatePreferences({ selectedSemester });
      set((state) => (state.roadmap ? { roadmap: { ...state.roadmap, selectedSemester } } : {}));
    } catch {
      /* not worth interrupting the student for */
    }
  },

  dismissCelebration: () => set({ celebration: null }),

  reset: () => set(INITIAL_STATE),
}));
