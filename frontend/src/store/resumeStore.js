import { create } from 'zustand';
import { resumeApi } from '@/services/resumeApi';

const INITIAL_STATE = {
  viewerId: null,
  options: null,
  optionsError: null,
  resumes: [],
  summary: null,
  status: 'idle', // idle | loading | ready | error
  error: null,
};

let optionsRequest = null;

/**
 * The signed-in student's saved resumes (the list, without content) and the builder's options. The
 * editor keeps the open resume in its own state (hooks/useResumeEditor.js).
 */
export const useResumeStore = create((set, get) => ({
  ...INITIAL_STATE,

  forViewer: (userId) => {
    if (get().viewerId !== userId) set({ ...INITIAL_STATE, viewerId: userId, options: get().options });
  },

  loadOptions: async () => {
    if (get().options) return get().options;
    optionsRequest ??= resumeApi
      .options()
      .then((options) => {
        set({ options, optionsError: null });
        return options;
      })
      .catch((error) => {
        set({ optionsError: error.message });
        return null;
      })
      .finally(() => {
        optionsRequest = null;
      });
    return optionsRequest;
  },

  fetchResumes: async () => {
    set({ status: get().summary ? 'ready' : 'loading', error: null });
    try {
      const { resumes, summary } = await resumeApi.list();
      set({ resumes, summary, status: 'ready' });
    } catch (error) {
      set({ status: get().summary ? 'ready' : 'error', error: error.message });
    }
  },

  /** Keeps the list in step after a change made elsewhere (editor, dialogs). */
  upsert: (resume) =>
    set((state) => {
      const summaryItem = {
        id: resume.id,
        name: resume.name,
        targetRole: resume.targetRole,
        targetRoleLabel: resume.targetRoleLabel,
        template: resume.template,
        templateName: state.options?.templates.find((template) => template.id === resume.template)?.name ?? resume.template,
        isDefault: resume.isDefault,
        revision: resume.revision,
        lastExportedAt: resume.lastExportedAt,
        createdAt: resume.createdAt,
        updatedAt: resume.updatedAt,
      };
      const others = state.resumes.filter((item) => item.id !== resume.id).map((item) => (resume.isDefault ? { ...item, isDefault: false } : item));
      const resumes = [summaryItem, ...others].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || new Date(b.updatedAt) - new Date(a.updatedAt));
      return { resumes, summary: summarize(resumes, state.summary) };
    }),

  removeLocal: (resumeId, newDefaultId) =>
    set((state) => {
      const resumes = state.resumes.filter((item) => item.id !== resumeId).map((item) => (item.id === newDefaultId ? { ...item, isDefault: true } : item));
      return { resumes, summary: summarize(resumes, state.summary) };
    }),

  reset: () => set(INITIAL_STATE),
}));

function summarize(resumes, previous) {
  const defaultResume = resumes.find((item) => item.isDefault);
  return {
    count: resumes.length,
    max: previous?.max ?? 20,
    defaultResume: defaultResume ? { id: defaultResume.id, name: defaultResume.name, updatedAt: defaultResume.updatedAt } : null,
    lastUpdatedAt: resumes.reduce((latest, item) => (!latest || item.updatedAt > latest ? item.updatedAt : latest), null),
  };
}
