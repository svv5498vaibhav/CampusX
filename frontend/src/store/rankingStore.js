import { create } from 'zustand';
import { rankingApi } from '@/services/rankingApi';

const PAGE_SIZE = 20;

const INITIAL_STATE = {
  viewerId: null,
  query: { scope: 'overall', period: 'all' },
  leaderboard: [],
  meta: null, // { scope, period }
  currentUser: null, // { rank, points }
  pagination: null,
  status: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
  loadingMore: false,
  error: '',
  myRanks: null,
  myRanksStatus: 'idle',
};

const sameQuery = (a, b) => a.scope === b.scope && a.period === b.period;

/** Campus leaderboards and the signed-in student's own positions. */
export const useRankingStore = create((set, get) => ({
  ...INITIAL_STATE,

  forViewer: (userId) => {
    if (get().viewerId === userId) return;
    set({ ...INITIAL_STATE, viewerId: userId });
  },

  fetchLeaderboard: async (query = {}) => {
    const next = { ...get().query, ...query };
    const changed = !sameQuery(next, get().query);
    set({ query: next, status: 'loading', error: '', ...(changed && { leaderboard: [], pagination: null, currentUser: null }) });
    try {
      const data = await rankingApi.leaderboard(next.scope, { period: next.period, page: 1, limit: PAGE_SIZE });
      if (sameQuery(get().query, next)) {
        set({ leaderboard: data.leaderboard, meta: { scope: data.scope, period: data.period }, currentUser: data.currentUser, pagination: data.pagination, status: 'ready' });
      }
    } catch (error) {
      if (sameQuery(get().query, next)) set({ status: 'error', error: error.message });
    }
  },

  loadMore: async () => {
    const { pagination, loadingMore, query } = get();
    if (!pagination?.hasMore || loadingMore) return;
    set({ loadingMore: true });
    try {
      const data = await rankingApi.leaderboard(query.scope, { period: query.period, page: pagination.page + 1, limit: PAGE_SIZE });
      if (!sameQuery(get().query, query)) return;
      set((state) => {
        const shown = new Set(state.leaderboard.map((entry) => entry.student.id));
        return { leaderboard: [...state.leaderboard, ...data.leaderboard.filter((entry) => !shown.has(entry.student.id))], pagination: data.pagination, loadingMore: false };
      });
    } catch (error) {
      set({ loadingMore: false, error: error.message });
    }
  },

  fetchMyRanks: async () => {
    set({ myRanksStatus: get().myRanks ? 'ready' : 'loading' });
    try {
      set({ myRanks: await rankingApi.me(), myRanksStatus: 'ready' });
    } catch {
      set({ myRanksStatus: 'error' });
    }
  },

  reset: () => set(INITIAL_STATE),
}));
