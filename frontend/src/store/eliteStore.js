import { create } from 'zustand';
import { rankingApi } from '@/services/rankingApi';

const PAGE_SIZE = 15;

const INITIAL_STATE = {
  viewerId: null,
  // GET /rankings/elite: the three holders now and the viewer's own elite rank.
  overview: null,
  overviewStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
  // GET /rankings/hall-of-fame (transfers grow with "Show more").
  hall: null,
  hallStatus: 'idle',
  hallError: '',
  loadingMore: false,
  // Per student: { status, data, error } from GET /rankings/elite/students/:id.
  histories: {},
};

/**
 * Elite rank tokens and the Hall of Fame. Read-only: holders come from the server's ranking snapshots, and
 * "elite:updated" (Socket.IO, id-free) only says when to read them again.
 */
export const useEliteStore = create((set, get) => ({
  ...INITIAL_STATE,

  forViewer: (userId) => {
    if (get().viewerId === userId) return;
    set({ ...INITIAL_STATE, viewerId: userId });
  },

  fetchOverview: async () => {
    if (!get().overview) set({ overviewStatus: 'loading' });
    try {
      const overview = await rankingApi.elite();
      // A slower answer never replaces a newer snapshot.
      if ((get().overview?.seq ?? -1) <= overview.seq) set({ overview, overviewStatus: 'ready' });
    } catch {
      // The last holders shown stay (never guessed); a first failure shows nothing elite.
      set({ overviewStatus: get().overview ? 'ready' : 'error' });
    }
  },

  fetchHall: async () => {
    set({ hallStatus: get().hall ? 'ready' : 'loading', hallError: '' });
    try {
      const hall = await rankingApi.hallOfFame({ page: 1, limit: PAGE_SIZE });
      set({ hall, hallStatus: 'ready' });
      // The Hall of Fame starts with the same overview: keep the two in step.
      const { scope, status, seq, updatedAt, tiers, holders, you } = hall;
      if ((get().overview?.seq ?? -1) <= seq) set({ overview: { scope, status, seq, updatedAt, tiers, holders, you }, overviewStatus: 'ready' });
    } catch (error) {
      set({ hallStatus: get().hall ? 'ready' : 'error', hallError: error.message });
    }
  },

  loadMoreTransfers: async () => {
    const { hall, loadingMore } = get();
    if (!hall?.pagination?.hasMore || loadingMore) return;
    set({ loadingMore: true });
    try {
      const next = await rankingApi.hallOfFame({ page: hall.pagination.page + 1, limit: PAGE_SIZE });
      set((state) => {
        const shown = new Set(state.hall.transfers.map((row) => row.id));
        return {
          hall: { ...state.hall, transfers: [...state.hall.transfers, ...next.transfers.filter((row) => !shown.has(row.id))], pagination: next.pagination },
          loadingMore: false,
        };
      });
    } catch (error) {
      set({ loadingMore: false, hallError: error.message });
    }
  },

  fetchHistory: async (userId) => {
    if (!userId) return;
    const current = get().histories[userId];
    set((state) => ({ histories: { ...state.histories, [userId]: { status: current?.data ? 'ready' : 'loading', data: current?.data ?? null, error: '' } } }));
    try {
      const data = await rankingApi.eliteHistory(userId);
      set((state) => ({ histories: { ...state.histories, [userId]: { status: 'ready', data, error: '' } } }));
    } catch (error) {
      set((state) => ({ histories: { ...state.histories, [userId]: { status: 'error', data: current?.data ?? null, error: error.message } } }));
    }
  },

  /** "elite:updated" from the server: the tokens moved in snapshot `seq`, so read again what is shown. */
  applyRemoteUpdate: ({ seq } = {}) => {
    const { overview, hall, histories } = get();
    if (overview && typeof seq === 'number' && seq <= overview.seq) return;
    get().fetchOverview();
    if (hall) get().fetchHall();
    for (const userId of Object.keys(histories)) get().fetchHistory(userId);
  },

  reset: () => set(INITIAL_STATE),
}));
