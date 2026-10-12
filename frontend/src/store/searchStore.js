import { create } from 'zustand';
import { FILTER_DEFAULTS, MIN_QUERY_LENGTH, SEARCH_FILTER_KEYS, SEARCH_TYPES } from '@/constants/search';
import { searchApi } from '@/services/searchApi';
import { useFeedStore } from './feedStore';

const PAGE_SIZE = 20;
const RELEVANCE = 'relevance';

/** What is being searched. Mirrored in the /search URL by the search page. */
export const EMPTY_SEARCH = Object.freeze({ query: '', type: SEARCH_TYPES.ALL, filters: {}, sort: RELEVANCE, page: 1 });

/** Only the filters the category has, without empty values. */
function cleanFilters(type, filters = {}) {
  return Object.fromEntries(
    (SEARCH_FILTER_KEYS[type] ?? [])
      .map((key) => [key, String(filters[key] ?? '').trim()])
      .filter(([key, value]) => value !== '' && value !== (FILTER_DEFAULTS[key] ?? '')),
  );
}

export function normalizeSearch(search) {
  const type = Object.values(SEARCH_TYPES).includes(search.type) ? search.type : SEARCH_TYPES.ALL;
  const page = Math.max(1, Number.parseInt(search.page, 10) || 1);
  return {
    query: String(search.query ?? '').replace(/\s+/g, ' ').trim(),
    type,
    filters: type === SEARCH_TYPES.ALL ? {} : cleanFilters(type, search.filters),
    sort: type === SEARCH_TYPES.ALL ? RELEVANCE : search.sort || RELEVANCE,
    page: type === SEARCH_TYPES.ALL ? 1 : page,
  };
}

/** A stable key for comparing two searches. */
export const searchKey = (search) => JSON.stringify(normalizeSearch(search));

/** The API's query for one category: `kind` (the URL name) is the API's `type` filter. */
function categoryQuery({ query, filters, sort, page }) {
  const { kind, ...rest } = filters;
  return { q: query, page, limit: PAGE_SIZE, sort, ...rest, ...(kind && { type: kind }) };
}

const INITIAL_STATE = {
  viewerId: null,
  options: null,
  optionsStatus: 'idle',
  current: EMPTY_SEARCH,
  results: null, // "all": { counts, students, posts, ... } · a category: { results, pagination }
  status: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
  error: '',
  pagination: null,
  // Totals per category from the last "All" search, shown on the tabs while the query stays the same.
  counts: null, // { query, counts }
  suggestions: [],
  suggestionsFor: '',
  suggestionsStatus: 'idle',
  history: [],
  historyStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
};

/**
 * Search for the UI. All search API calls go through here (and services/searchApi.js). A newer search or
 * suggestion request cancels the one still running, so results never arrive out of order.
 */
export const useSearchStore = create((set, get) => {
  let searchController = null;
  let suggestionController = null;
  const isCanceled = (error) => error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED';

  /** Campus posts in the results are shared with the feed store, so the post card's actions update them. */
  const sharePosts = (data) => {
    const posts = data.type === SEARCH_TYPES.POSTS ? data.results : (data.posts ?? []);
    const campusPosts = posts.filter((post) => !post.anonymous);
    if (campusPosts.length) useFeedStore.getState().showExternal(campusPosts);
  };

  return {
    ...INITIAL_STATE,

    /** Clears everything when a different student signs in on this tab. */
    forViewer: (userId) => {
      if (get().viewerId === userId) return;
      searchController?.abort();
      suggestionController?.abort();
      const { options, optionsStatus } = get();
      set({ ...INITIAL_STATE, options, optionsStatus, viewerId: userId });
    },

    loadOptions: async () => {
      if (['loading', 'ready'].includes(get().optionsStatus)) return;
      set({ optionsStatus: 'loading' });
      try {
        set({ options: await searchApi.getOptions(), optionsStatus: 'ready' });
      } catch {
        set({ optionsStatus: 'error' });
      }
    },

    /**
     * Runs a search. `changes` is merged into the current one ({ query, type, filters, sort, page }).
     * A query shorter than 2 characters clears the results instead of asking the server.
     */
    search: async (changes = {}) => {
      const current = normalizeSearch({ ...get().current, ...changes });
      set({ current });
      searchController?.abort();
      if (current.query.length < MIN_QUERY_LENGTH) {
        searchController = null;
        set({ results: null, pagination: null, status: 'idle', error: '' });
        return;
      }
      const controller = new AbortController();
      searchController = controller;
      set({ status: 'loading', error: '' });
      try {
        const data =
          current.type === SEARCH_TYPES.ALL
            ? await searchApi.searchAll(current.query, { signal: controller.signal })
            : await searchApi.searchType(current.type, categoryQuery(current), { signal: controller.signal });
        if (searchController !== controller) return;
        sharePosts(data);
        // A new search was saved to recent searches on the server: refresh the list next time it shows.
        set((state) => ({
          results: data,
          pagination: data.pagination ?? null,
          status: 'ready',
          ...(data.counts && { counts: { query: current.query, counts: data.counts } }),
          historyStatus: state.historyStatus === 'ready' ? 'stale' : state.historyStatus,
        }));
      } catch (error) {
        if (isCanceled(error) || searchController !== controller) return;
        set({ status: 'error', error: error.message });
      }
    },

    /** Another category tab: its own filters and sort start fresh. */
    setType: (type) => get().search({ type, filters: {}, sort: RELEVANCE, page: 1 }),
    setFilters: (filters) => get().search({ filters: { ...get().current.filters, ...filters }, page: 1 }),
    clearFilters: () => get().search({ filters: {}, page: 1 }),
    setSort: (sort) => get().search({ sort, page: 1 }),
    setPage: (page) => get().search({ page }),
    retry: () => get().search({}),

    /** Patches one result in place (e.g. a community after joining it from the results). */
    patchResult: (type, id, patch) =>
      set((state) => {
        if (!state.results) return {};
        const apply = (list) => list?.map((item) => (item.id === id ? { ...item, ...patch } : item));
        return state.results.results
          ? { results: { ...state.results, results: apply(state.results.results) } }
          : { results: { ...state.results, [type]: apply(state.results[type]) } };
      }),

    /** Suggestions while typing. The input debounces; this also drops answers for older text. */
    fetchSuggestions: async (text) => {
      const query = String(text ?? '').replace(/\s+/g, ' ').trim();
      suggestionController?.abort();
      if (query.length < MIN_QUERY_LENGTH) {
        suggestionController = null;
        set({ suggestions: [], suggestionsFor: '', suggestionsStatus: 'idle' });
        return;
      }
      const controller = new AbortController();
      suggestionController = controller;
      set({ suggestionsStatus: 'loading' });
      try {
        const { suggestions } = await searchApi.suggestions(query, { signal: controller.signal });
        if (suggestionController !== controller) return;
        set({ suggestions, suggestionsFor: query, suggestionsStatus: 'ready' });
      } catch (error) {
        if (isCanceled(error) || suggestionController !== controller) return;
        // Suggestions are a convenience: a failure (or a rate limit) just hides them.
        set({ suggestions: [], suggestionsFor: query, suggestionsStatus: 'error' });
      }
    },

    clearSuggestions: () => {
      suggestionController?.abort();
      set({ suggestions: [], suggestionsFor: '', suggestionsStatus: 'idle' });
    },

    fetchHistory: async ({ force = false } = {}) => {
      const { historyStatus } = get();
      if (!force && ['loading', 'ready'].includes(historyStatus)) return;
      set({ historyStatus: 'loading' });
      try {
        const { history } = await searchApi.history();
        set({ history, historyStatus: 'ready' });
      } catch {
        set({ historyStatus: 'error' });
      }
    },

    /** Rejects with the API error so the UI can show it; the entry comes back if the server says no. */
    deleteHistory: async (id) => {
      const before = get().history;
      set({ history: before.filter((entry) => entry.id !== id) });
      try {
        await searchApi.deleteHistory(id);
      } catch (error) {
        // Already gone on the server: nothing to restore.
        if (error.status !== 404) set({ history: before });
        if (error.status !== 404) throw error;
      }
    },

    clearHistory: async () => {
      const before = get().history;
      set({ history: [] });
      try {
        await searchApi.clearHistory();
      } catch (error) {
        set({ history: before });
        throw error;
      }
    },
  };
});
