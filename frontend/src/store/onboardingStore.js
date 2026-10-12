import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { onboardingApi } from '@/services/onboardingApi';
import { useAuthStore } from '@/store/authStore';
import { ONBOARDING_STEPS, normaliseRollNumber } from '@/utils/onboarding';

const EMPTY_DRAFT = { college: '', branch: '', semester: null, rollNumber: '', interests: [], skills: [] };

// Draft lives in sessionStorage: it survives a reload in this tab but never reaches the
// database until the student completes setup. Storage failures (private mode) are ignored.
const safeSessionStorage = {
  getItem: (key) => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  removeItem: (key) => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

const fieldErrorsFrom = (error) =>
  Object.fromEntries((error.errors ?? []).filter((item) => item.field).map((item) => [item.field, item.message]));

/**
 * Temporary onboarding state, kept separate from authentication. `ownerId` ties a saved
 * draft to the student who started it, so another account on the same browser never sees it.
 */
export const useOnboardingStore = create(
  persist(
    (set, get) => ({
      ownerId: null,
      stepIndex: 0,
      direction: 1,
      draft: EMPTY_DRAFT,
      fieldErrors: {},
      justCompleted: false,

      options: null,
      optionsStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
      optionsError: '',

      /** Resumes this student's draft, or starts fresh (prefilled with anything already saved). */
      startFor: (user) => {
        if (get().ownerId === user.id) return;
        set({
          ownerId: user.id,
          stepIndex: 0,
          direction: 1,
          fieldErrors: {},
          draft: {
            ...EMPTY_DRAFT,
            college: user.college ?? '',
            branch: user.branch ?? '',
            semester: user.semester ?? null,
            rollNumber: user.rollNumber ?? '',
            interests: user.interests ?? [],
            skills: user.skills ?? [],
          },
        });
      },

      loadOptions: async () => {
        if (get().optionsStatus === 'loading' || get().optionsStatus === 'ready') return;
        set({ optionsStatus: 'loading', optionsError: '' });
        try {
          set({ options: await onboardingApi.getOptions(), optionsStatus: 'ready' });
        } catch (error) {
          set({ optionsStatus: 'error', optionsError: error.message });
        }
      },

      setField: (field, value) =>
        set((state) => {
          const draft = { ...state.draft, [field]: value };
          // A new college may not offer the chosen branch.
          if (field === 'college' && value !== state.draft.college) draft.branch = '';
          const { [field]: _cleared, ...fieldErrors } = state.fieldErrors;
          return { draft, fieldErrors };
        }),

      goTo: (stepIndex) =>
        set((state) => ({
          stepIndex: Math.max(0, Math.min(stepIndex, ONBOARDING_STEPS.length - 1)),
          direction: stepIndex >= state.stepIndex ? 1 : -1,
        })),
      next: () => get().goTo(get().stepIndex + 1),
      back: () => get().goTo(get().stepIndex - 1),

      /** Sends the whole draft once. On success the signed-in user is updated and the draft cleared. */
      submit: async () => {
        const { draft } = get();
        try {
          const { user } = await onboardingApi.save({ ...draft, rollNumber: normaliseRollNumber(draft.rollNumber) });
          get().reset();
          set({ justCompleted: true });
          useAuthStore.getState().updateUser(user);
          return user;
        } catch (error) {
          set({ fieldErrors: fieldErrorsFrom(error) });
          throw error;
        }
      },

      clearJustCompleted: () => set({ justCompleted: false }),

      reset: () => set({ ownerId: null, stepIndex: 0, direction: 1, draft: EMPTY_DRAFT, fieldErrors: {} }),
    }),
    {
      name: 'campusx-onboarding',
      storage: createJSONStorage(() => safeSessionStorage),
      partialize: ({ ownerId, stepIndex, draft }) => ({ ownerId, stepIndex, draft }),
    },
  ),
);
