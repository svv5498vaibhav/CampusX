import { create } from 'zustand';
import { reportApi } from '@/services/reportApi';

const INITIAL_STATE = {
  viewerId: null,
  options: null,
  optionsStatus: 'idle',
  myReports: [],
  myPagination: null,
  myStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
  busy: {}, // { "<reportId>": true } while withdrawing
};

/** Reports for the UI: the report form's reasons and the student's own reports. All report calls go through here. */
export const useReportStore = create((set, get) => ({
  ...INITIAL_STATE,

  forViewer: (userId) => {
    if (get().viewerId === userId) return;
    const { options, optionsStatus } = get();
    set({ ...INITIAL_STATE, options, optionsStatus, viewerId: userId });
  },

  loadOptions: async () => {
    if (['loading', 'ready'].includes(get().optionsStatus)) return;
    set({ optionsStatus: 'loading' });
    try {
      set({ options: await reportApi.getOptions(), optionsStatus: 'ready' });
    } catch {
      set({ optionsStatus: 'error' });
    }
  },

  /** Rejects with the API error so the form can show it. */
  submitReport: async (report) => {
    const { report: saved } = await reportApi.create(report);
    set((state) => (state.myStatus === 'ready' ? { myReports: [saved, ...state.myReports] } : {}));
    return saved;
  },

  fetchMyReports: async ({ more = false } = {}) => {
    const { myPagination, myStatus } = get();
    if (myStatus === 'loading' || (more && !myPagination?.hasMore)) return;
    set({ myStatus: 'loading' });
    try {
      const { reports, pagination } = await reportApi.mine({ page: more ? myPagination.page + 1 : 1 });
      set((state) => ({ myReports: more ? [...state.myReports, ...reports.filter((report) => !state.myReports.some((item) => item.id === report.id))] : reports, myPagination: pagination, myStatus: 'ready' }));
    } catch {
      set({ myStatus: 'error' });
    }
  },

  withdrawReport: async (reportId) => {
    if (get().busy[reportId]) return;
    set((state) => ({ busy: { ...state.busy, [reportId]: true } }));
    try {
      await reportApi.withdraw(reportId);
      set((state) => ({ myReports: state.myReports.map((report) => (report.id === reportId ? { ...report, status: 'withdrawn' } : report)) }));
    } finally {
      set((state) => {
        const busy = { ...state.busy };
        delete busy[reportId];
        return { busy };
      });
    }
  },
}));
