import { create } from 'zustand';
import { achievementUrl } from '@/constants/showcase';
import { achievementApi } from '@/services/achievementApi';
import { copyText } from '@/utils/clipboard';

const PAGE_SIZE = 12;

const INITIAL_STATE = {
  viewerId: null,
  achievements: [], // discovery list
  query: { type: 'all', verified: false, search: '' },
  pagination: null,
  loading: false,
  loadingMore: false,
  error: '',
  selectedAchievement: null,
  selectedStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'not-found' | 'error'
  selectedError: '',
  byUser: {}, // { [userId]: { achievements, total, status } } for profiles
  creating: false,
  editing: false,
  deleting: null,
  options: null,
  optionsStatus: 'idle',
};

const sameQuery = (a, b) => a.type === b.type && a.verified === b.verified && a.search === b.search;

/** Student achievements for the UI. All achievement API calls go through here (and services/achievementApi.js). */
export const useAchievementStore = create((set, get) => {
  const putAchievement = (achievement) =>
    set((state) => {
      const apply = (item) => (item.id === achievement.id ? { ...item, ...achievement } : item);
      return {
        achievements: state.achievements.map(apply),
        selectedAchievement: state.selectedAchievement?.id === achievement.id ? { ...state.selectedAchievement, ...achievement } : state.selectedAchievement,
        byUser: Object.fromEntries(Object.entries(state.byUser).map(([id, entry]) => [id, { ...entry, achievements: entry.achievements.map(apply) }])),
      };
    });

  return {
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
        set({ options: await achievementApi.getOptions(), optionsStatus: 'ready' });
      } catch {
        set({ optionsStatus: 'error' });
      }
    },

    fetchAchievements: async (query = {}) => {
      const next = { ...get().query, ...query };
      const changed = !sameQuery(next, get().query);
      set({ query: next, loading: true, error: '', ...(changed && { achievements: [], pagination: null }) });
      try {
        const { achievements, pagination } = await achievementApi.list({ ...next, page: 1, limit: PAGE_SIZE });
        if (sameQuery(get().query, next)) set({ achievements, pagination, loading: false });
      } catch (error) {
        if (sameQuery(get().query, next)) set({ loading: false, error: error.message });
      }
    },

    loadMore: async () => {
      const { pagination, loading, loadingMore, query } = get();
      if (!pagination?.hasMore || loading || loadingMore) return;
      set({ loadingMore: true });
      try {
        const page = await achievementApi.list({ ...query, page: pagination.page + 1, limit: PAGE_SIZE });
        if (!sameQuery(get().query, query)) return;
        set((state) => {
          const shown = new Set(state.achievements.map((item) => item.id));
          return { achievements: [...state.achievements, ...page.achievements.filter((item) => !shown.has(item.id))], pagination: page.pagination, loadingMore: false };
        });
      } catch (error) {
        set({ loadingMore: false, error: error.message });
      }
    },

    fetchUserAchievements: async (userId) => {
      set((state) => ({ byUser: { ...state.byUser, [userId]: { achievements: state.byUser[userId]?.achievements ?? [], total: state.byUser[userId]?.total ?? 0, status: 'loading' } } }));
      try {
        const { achievements, pagination } = await achievementApi.listByUser(userId, { limit: 6 });
        set((state) => ({ byUser: { ...state.byUser, [userId]: { achievements, total: pagination.total, status: 'ready' } } }));
      } catch {
        set((state) => ({ byUser: { ...state.byUser, [userId]: { achievements: [], total: 0, status: 'error' } } }));
      }
    },

    fetchAchievement: async (achievementId) => {
      const keep = get().selectedAchievement?.id === achievementId;
      set({ selectedStatus: keep ? 'ready' : 'loading', selectedError: '', ...(!keep && { selectedAchievement: null }) });
      try {
        set({ selectedAchievement: await achievementApi.get(achievementId), selectedStatus: 'ready' });
      } catch (error) {
        set({ selectedAchievement: null, selectedStatus: error.status === 404 ? 'not-found' : 'error', selectedError: error.message });
      }
    },

    // The actions below reject with the API error so forms can show it.

    createAchievement: async (fields) => {
      set({ creating: true });
      try {
        const achievement = await achievementApi.create(fields);
        set({ selectedAchievement: achievement, selectedStatus: 'ready' });
        return achievement;
      } finally {
        set({ creating: false });
      }
    },

    updateAchievement: async (achievementId, changes) => {
      set({ editing: true });
      try {
        const achievement = await achievementApi.update(achievementId, changes);
        putAchievement(achievement);
        return achievement;
      } finally {
        set({ editing: false });
      }
    },

    deleteAchievement: async (achievementId) => {
      if (get().deleting) return;
      set({ deleting: achievementId });
      try {
        await achievementApi.remove(achievementId);
        set((state) => ({
          achievements: state.achievements.filter((item) => item.id !== achievementId),
          selectedAchievement: state.selectedAchievement?.id === achievementId ? null : state.selectedAchievement,
          byUser: Object.fromEntries(Object.entries(state.byUser).map(([id, entry]) => [id, { ...entry, achievements: entry.achievements.filter((item) => item.id !== achievementId) }])),
        }));
      } finally {
        set({ deleting: null });
      }
    },

    addProof: async (achievementId, files, onProgress) => {
      const achievement = await achievementApi.addProof(achievementId, files, { onProgress });
      putAchievement(achievement);
      return achievement;
    },

    removeProof: async (achievementId, proofId) => {
      const achievement = await achievementApi.removeProof(achievementId, proofId);
      putAchievement(achievement);
      return achievement;
    },

    /** Copies the achievement's link. Resolves to true when copied. */
    shareAchievement: (achievementId) => copyText(achievementUrl(achievementId)),

    reset: () => set(INITIAL_STATE),
  };
});
