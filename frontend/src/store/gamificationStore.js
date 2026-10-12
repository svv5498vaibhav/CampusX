import { create } from 'zustand';
import { gamificationApi } from '@/services/gamificationApi';

const PAGE_SIZE = 20;

const INITIAL_STATE = {
  viewerId: null,
  profile: null, // points, level, streak, badges summary
  profileStatus: 'idle',
  badges: [],
  badgeSummary: null, // { earnedCount, total }
  badgesStatus: 'idle',
  transactions: [],
  transactionsPagination: null,
  transactionsStatus: 'idle',
  rules: null,
  rulesStatus: 'idle',
};

/** The signed-in student's points, level, badges and history. Read-only: the server awards everything. */
export const useGamificationStore = create((set, get) => ({
  ...INITIAL_STATE,

  forViewer: (userId) => {
    if (get().viewerId === userId) return;
    const { rules, rulesStatus } = get();
    set({ ...INITIAL_STATE, rules, rulesStatus, viewerId: userId });
  },

  fetchProfile: async () => {
    set({ profileStatus: get().profile ? 'ready' : 'loading' });
    try {
      set({ profile: await gamificationApi.me(), profileStatus: 'ready' });
    } catch {
      set({ profileStatus: 'error' });
    }
  },

  fetchBadges: async () => {
    set({ badgesStatus: get().badges.length ? 'ready' : 'loading' });
    try {
      const { badges, earnedCount, total } = await gamificationApi.badges();
      set({ badges, badgeSummary: { earnedCount, total }, badgesStatus: 'ready' });
    } catch {
      set({ badgesStatus: 'error' });
    }
  },

  fetchTransactions: async ({ more = false } = {}) => {
    const { transactionsPagination } = get();
    if (more && !transactionsPagination?.hasMore) return;
    set({ transactionsStatus: more ? 'loading-more' : 'loading' });
    try {
      const page = more ? transactionsPagination.page + 1 : 1;
      const { transactions, pagination } = await gamificationApi.transactions({ page, limit: PAGE_SIZE });
      set((state) => ({
        transactions: more ? [...state.transactions, ...transactions.filter((item) => !state.transactions.some((shown) => shown.id === item.id))] : transactions,
        transactionsPagination: pagination,
        transactionsStatus: 'ready',
      }));
    } catch {
      set({ transactionsStatus: 'error' });
    }
  },

  loadRules: async () => {
    if (['loading', 'ready'].includes(get().rulesStatus)) return;
    set({ rulesStatus: 'loading' });
    try {
      set({ rules: await gamificationApi.rules(), rulesStatus: 'ready' });
    } catch {
      set({ rulesStatus: 'error' });
    }
  },

  reset: () => set(INITIAL_STATE),
}));
