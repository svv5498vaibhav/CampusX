import { create } from 'zustand';
import { RECOMMENDATION_TYPES } from '@/constants/recommendations';
import { recommendationApi } from '@/services/recommendationApi';

const TYPES = Object.values(RECOMMENDATION_TYPES);

const INITIAL_STATE = {
  viewerId: null,
  // "For you": a mix of kinds (the home page's, or Discover's once loaded).
  personalized: [],
  // One list per kind (GET /recommendations/<type>), and the sections + trending of home / Discover.
  posts: [],
  projects: [],
  communities: [],
  opportunities: [],
  students: [],
  achievements: [],
  home: null, // { sections, trending }
  discovery: null, // { sections, trending }
  personalization: null, // { basedOn, isNew, message? }
  status: {}, // { home | discovery | <type>: 'loading' | 'ready' | 'error' }
  loading: false,
  error: null,
  lastUpdated: null,
};

const keyOf = (type, id) => `${type}:${id}`;
const isLoading = (status) => Object.values(status).includes('loading');
// Shown or opened once per page load is enough for the server's light analytics.
const seen = new Set();
const IMPRESSION_BATCH = 30; // the server's maximum per request
const IMPRESSION_DELAY_MS = 1500;
const pendingImpressions = [];
let impressionTimer = null;

/** Removes one item everywhere it is shown (lists, sections, trending). */
function withoutItem(state, type, id) {
  const drop = (list) => (list ?? []).filter((item) => !(item.id === id && (item.recommendationType ?? type) === type));
  const dropSections = (block) =>
    block && {
      ...block,
      sections: Object.fromEntries(Object.entries(block.sections ?? {}).map(([key, list]) => [key, key === type ? drop(list) : list])),
      trending: block.trending && Object.fromEntries(Object.entries(block.trending).map(([key, list]) => [key, list.filter((item) => item.id !== id)])),
    };
  return { personalized: drop(state.personalized), [type]: drop(state[type]), home: dropSections(state.home), discovery: dropSections(state.discovery) };
}

/**
 * Recommendations for the UI. Every call goes through recommendationApi; the server decides what to
 * recommend and why. "Not interested" removes the item right away and only puts it back if the request fails.
 */
export const useRecommendationStore = create((set, get) => {
  const load = async (key, request, apply) => {
    set((state) => ({ status: { ...state.status, [key]: 'loading' }, loading: true, error: null }));
    try {
      const data = await request();
      set((state) => {
        const status = { ...state.status, [key]: 'ready' };
        return { ...apply(data, state), personalization: data.personalization ?? state.personalization, status, loading: isLoading(status), lastUpdated: data.generatedAt ?? new Date().toISOString() };
      });
      return data;
    } catch (error) {
      set((state) => {
        const status = { ...state.status, [key]: 'error' };
        return { status, loading: isLoading(status), error: error.message };
      });
      return null;
    }
  };

  // One kind; `limit` up to 20 (the server's page size).
  const fetchType = (type) => (options) => load(type, () => recommendationApi.list(type, options), (data) => ({ [type]: data.recommendations }));

  return {
    ...INITIAL_STATE,

    /** Clears everything when a different student signs in. */
    forViewer: (userId) => {
      if (get().viewerId === userId) return;
      seen.clear();
      clearTimeout(impressionTimer);
      pendingImpressions.length = 0;
      set({ ...INITIAL_STATE, viewerId: userId });
    },

    /** The home page: "Recommended for you", a few sections and trending. */
    fetchRecommendations: () =>
      load('home', recommendationApi.home, (data) => ({ personalized: data.recommendations, home: { sections: data.sections, trending: data.trending } })),

    /** Discover: "For you", every section and trending. */
    fetchDiscovery: () =>
      load('discovery', recommendationApi.discover, (data) => ({ personalized: data.recommendations, discovery: { sections: data.sections, trending: data.trending } })),

    fetchPosts: fetchType(RECOMMENDATION_TYPES.POSTS),
    fetchProjects: fetchType(RECOMMENDATION_TYPES.PROJECTS),
    fetchCommunities: fetchType(RECOMMENDATION_TYPES.COMMUNITIES),
    fetchOpportunities: fetchType(RECOMMENDATION_TYPES.OPPORTUNITIES),
    fetchStudents: fetchType(RECOMMENDATION_TYPES.STUDENTS),
    fetchAchievements: fetchType(RECOMMENDATION_TYPES.ACHIEVEMENTS),

    /** Reloads whatever is already on screen. */
    refreshRecommendations: async () => {
      const { status } = get();
      const jobs = [];
      if (status.home) jobs.push(get().fetchRecommendations());
      if (status.discovery) jobs.push(get().fetchDiscovery());
      for (const type of TYPES) if (status[type]) jobs.push(fetchType(type)());
      await Promise.all(jobs);
    },

    /** "Not interested": gone at once; back (with the error) if the server refuses. Returns the server's message. */
    dismissRecommendation: async (type, id, action = 'not_interested') => {
      const before = get();
      const snapshot = { personalized: before.personalized, [type]: before[type], home: before.home, discovery: before.discovery };
      set((state) => withoutItem(state, type, id));
      try {
        return await recommendationApi.dismiss(type, id, action);
      } catch (error) {
        set(snapshot);
        throw error;
      }
    },

    /**
     * Lets the server know which recommendations were shown, once per item per page load. Sections report
     * as they render; one batched request goes out shortly after. Never throws.
     */
    recordImpressions: (items) => {
      const fresh = items.filter((item) => item?.id && !seen.has(keyOf(item.recommendationType, item.id)));
      if (fresh.length === 0) return;
      for (const item of fresh) {
        seen.add(keyOf(item.recommendationType, item.id));
        pendingImpressions.push({ type: item.recommendationType, id: item.id });
      }
      clearTimeout(impressionTimer);
      impressionTimer = setTimeout(() => {
        const batch = pendingImpressions.splice(0);
        for (let start = 0; start < batch.length; start += IMPRESSION_BATCH) {
          recommendationApi.interactions('impression', batch.slice(start, start + IMPRESSION_BATCH)).catch(() => {});
        }
      }, IMPRESSION_DELAY_MS);
    },

    /** A recommendation was opened. Never throws. */
    recordClick: (type, id) => {
      recommendationApi.interactions('click', [{ type, id }]).catch(() => {});
    },

    /** Applies a change made elsewhere (e.g. joining a community from a card). */
    patchItem: (type, id, patch) =>
      set((state) => {
        const apply = (list) => (list ?? []).map((item) => (item.id === id && (item.recommendationType ?? type) === type ? { ...item, ...patch } : item));
        const applySections = (block) => block && { ...block, sections: Object.fromEntries(Object.entries(block.sections ?? {}).map(([key, list]) => [key, key === type ? apply(list) : list])) };
        return { personalized: apply(state.personalized), [type]: apply(state[type]), home: applySections(state.home), discovery: applySections(state.discovery) };
      }),
  };
});
