import { create } from 'zustand';
import { opportunityUrl } from '@/constants/opportunities';
import { opportunityApi } from '@/services/opportunityApi';
import { copyText } from '@/utils/clipboard';

const PAGE_SIZE = 12;
const SECTION_SIZE = 6;
const MY_PAGE_SIZE = 20;

/** Discovery filters (kept in the page URL). Eligibility never comes from here: the server uses the profile. */
export const DEFAULT_FILTERS = Object.freeze({
  search: '',
  type: 'all',
  mode: '',
  location: '',
  skills: '',
  deadline: 'any',
  college: '',
  branch: '',
  semester: '',
  eligible: '',
  sort: 'deadline',
});

const INITIAL_STATE = {
  viewerId: null,
  options: null,
  optionsStatus: 'idle',
  // discovery
  opportunities: [],
  filters: DEFAULT_FILTERS,
  pagination: null,
  loading: false,
  loadingMore: false,
  error: '',
  recommended: [],
  recommendedStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
  upcoming: [],
  upcomingStatus: 'idle',
  // one opportunity
  selectedOpportunity: null,
  selectedStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'not-found' | 'error'
  selectedError: '',
  // the student's own list
  saved: [],
  savedStatus: 'idle',
  myOpportunities: [],
  myCounts: null,
  myFilter: 'all',
  myPagination: null,
  myStatus: 'idle',
  busy: {}, // { "<opportunityId>": true } while a save/status change is running
  // moderators and admins
  managed: [],
  managedCounts: null,
  managedPagination: null,
  managedQuery: { status: 'all', search: '' },
  managedStatus: 'idle',
};

const sameFilters = (a, b) => Object.keys(DEFAULT_FILTERS).every((key) => String(a[key] ?? '') === String(b[key] ?? ''));
const sameManagedQuery = (a, b) => a.status === b.status && a.search === b.search;

/** Opportunities for the UI. All opportunity API calls go through here (and services/opportunityApi.js). */
export const useOpportunityStore = create((set, get) => {
  const findAnywhere = (opportunityId) => {
    const { selectedOpportunity, opportunities, recommended, upcoming, saved, myOpportunities, managed } = get();
    return [selectedOpportunity, ...opportunities, ...recommended, ...upcoming, ...saved, ...myOpportunities, ...managed].find((item) => item?.id === opportunityId);
  };

  /** Applies a full or partial opportunity wherever it is shown. */
  const patchOpportunity = (opportunityId, patch) =>
    set((state) => {
      const apply = (item) => (item.id === opportunityId ? { ...item, ...patch } : item);
      return {
        opportunities: state.opportunities.map(apply),
        recommended: state.recommended.map(apply),
        upcoming: state.upcoming.map(apply),
        saved: state.saved.map(apply),
        myOpportunities: state.myOpportunities.map(apply),
        managed: state.managed.map(apply),
        selectedOpportunity: state.selectedOpportunity ? apply(state.selectedOpportunity) : null,
      };
    });

  /** The student's tracking changed: update every copy, the Saved/My lists and their counts. */
  const applyTracking = (opportunityId, tracking, previousStatus) => {
    patchOpportunity(opportunityId, { tracking });
    set((state) => {
      const status = tracking?.status ?? null;
      const changes = {
        saved: status === 'saved' ? state.saved : state.saved.filter((item) => item.id !== opportunityId),
        myOpportunities: state.myOpportunities.filter((item) => item.id !== opportunityId || (status && (state.myFilter === 'all' || state.myFilter === status))),
      };
      if (state.myCounts && previousStatus !== status) {
        const counts = { ...state.myCounts };
        if (previousStatus) counts[previousStatus] = Math.max(0, (counts[previousStatus] ?? 0) - 1);
        if (status) counts[status] = (counts[status] ?? 0) + 1;
        counts.all = Math.max(0, (counts.all ?? 0) + (status ? 1 : 0) - (previousStatus ? 1 : 0));
        changes.myCounts = counts;
      }
      return changes;
    });
  };

  /** Runs one tracking request for an opportunity at a time. Rejects with the API error. */
  const withTracking = async (opportunityId, request) => {
    if (get().busy[opportunityId]) return null;
    const previousStatus = findAnywhere(opportunityId)?.tracking?.status ?? null;
    set((state) => ({ busy: { ...state.busy, [opportunityId]: true } }));
    try {
      const { tracking = null } = (await request()) ?? {};
      applyTracking(opportunityId, tracking, previousStatus);
      return tracking;
    } finally {
      set((state) => {
        const busy = { ...state.busy };
        delete busy[opportunityId];
        return { busy };
      });
    }
  };

  return {
    ...INITIAL_STATE,

    /** Clears everything when a different user signs in. */
    forViewer: (userId) => {
      if (get().viewerId === userId) return;
      const { options, optionsStatus } = get();
      set({ ...INITIAL_STATE, options, optionsStatus, viewerId: userId });
    },

    loadOptions: async () => {
      if (['loading', 'ready'].includes(get().optionsStatus)) return;
      set({ optionsStatus: 'loading' });
      try {
        set({ options: await opportunityApi.getOptions(), optionsStatus: 'ready' });
      } catch {
        set({ optionsStatus: 'error' });
      }
    },

    // ------------------------------------------------------------------------- discovery

    fetchOpportunities: async (filters = {}) => {
      const next = { ...get().filters, ...filters };
      const changed = !sameFilters(next, get().filters);
      set({ filters: next, loading: true, error: '', ...(changed && { opportunities: [], pagination: null }) });
      try {
        const { opportunities, pagination } = await opportunityApi.list({ ...next, page: 1, limit: PAGE_SIZE });
        if (sameFilters(get().filters, next)) set({ opportunities, pagination, loading: false });
      } catch (error) {
        if (sameFilters(get().filters, next)) set({ loading: false, error: error.message });
      }
    },
    searchOpportunities: (search) => get().fetchOpportunities({ search }),
    filterOpportunities: (changes) => get().fetchOpportunities(changes),

    loadMore: async () => {
      const { pagination, loading, loadingMore, filters } = get();
      if (!pagination?.hasMore || loading || loadingMore) return;
      set({ loadingMore: true });
      try {
        const page = await opportunityApi.list({ ...filters, page: pagination.page + 1, limit: PAGE_SIZE });
        if (!sameFilters(get().filters, filters)) return;
        set((state) => {
          const shown = new Set(state.opportunities.map((item) => item.id));
          return { opportunities: [...state.opportunities, ...page.opportunities.filter((item) => !shown.has(item.id))], pagination: page.pagination, loadingMore: false };
        });
      } catch (error) {
        set({ loadingMore: false, error: error.message });
      }
    },

    fetchRecommended: async () => {
      set({ recommendedStatus: 'loading' });
      try {
        const { opportunities } = await opportunityApi.recommended();
        set({ recommended: opportunities, recommendedStatus: 'ready' });
      } catch {
        set({ recommendedStatus: 'error' });
      }
    },

    /** "Upcoming deadlines": open opportunities closing within 30 days, nearest first. */
    fetchUpcoming: async () => {
      set({ upcomingStatus: 'loading' });
      try {
        const { opportunities } = await opportunityApi.list({ deadline: '30d', sort: 'deadline', limit: SECTION_SIZE });
        set({ upcoming: opportunities, upcomingStatus: 'ready' });
      } catch {
        set({ upcomingStatus: 'error' });
      }
    },

    fetchOpportunity: async (opportunityId) => {
      // No-longer-listed items in My Opportunities carry only basic details, so they aren't shown as a page.
      const found = findAnywhere(opportunityId);
      const cached = found?.available === false ? null : found;
      const keep = get().selectedOpportunity?.id === opportunityId;
      set({ selectedOpportunity: keep ? get().selectedOpportunity : (cached ?? null), selectedStatus: keep || cached ? 'ready' : 'loading', selectedError: '' });
      try {
        set({ selectedOpportunity: await opportunityApi.get(opportunityId), selectedStatus: 'ready' });
      } catch (error) {
        set({ selectedOpportunity: null, selectedStatus: error.status === 404 ? 'not-found' : 'error', selectedError: error.message });
      }
    },

    // ------------------------------------------------------------------------- the student's own tracking
    // These reject with the API error so the UI can show it.

    saveOpportunity: (opportunityId) => withTracking(opportunityId, () => opportunityApi.track(opportunityId, { status: 'saved' })),
    unsaveOpportunity: (opportunityId) => withTracking(opportunityId, () => opportunityApi.untrack(opportunityId)),
    /** Adds it to the list with a starting status (saved, interested or applied). */
    trackOpportunity: (opportunityId, status = 'interested') => withTracking(opportunityId, () => opportunityApi.track(opportunityId, { status })),
    /** Sets the student's own status and/or notes (adds it to their list if needed). */
    updateApplicationStatus: (opportunityId, status, notes) =>
      withTracking(opportunityId, () => opportunityApi.updateStatus(opportunityId, { ...(status && { status }), ...(notes !== undefined && { notes }) })),
    removeTracking: (opportunityId) => withTracking(opportunityId, () => opportunityApi.untrack(opportunityId)),

    fetchSaved: async () => {
      set({ savedStatus: 'loading' });
      try {
        const { opportunities } = await opportunityApi.mine({ status: 'saved', limit: 50 });
        set({ saved: opportunities, savedStatus: 'ready' });
      } catch {
        set({ savedStatus: 'error' });
      }
    },

    fetchMyOpportunities: async (status = get().myFilter) => {
      set({ myFilter: status, myStatus: 'loading', ...(status !== get().myFilter && { myOpportunities: [], myPagination: null }) });
      try {
        const { opportunities, counts, pagination } = await opportunityApi.mine({ status, limit: MY_PAGE_SIZE });
        if (get().myFilter === status) set({ myOpportunities: opportunities, myCounts: counts, myPagination: pagination, myStatus: 'ready' });
      } catch {
        if (get().myFilter === status) set({ myStatus: 'error' });
      }
    },

    loadMoreMine: async () => {
      const { myPagination, myFilter, myStatus } = get();
      if (!myPagination?.hasMore || myStatus === 'loading-more') return;
      set({ myStatus: 'loading-more' });
      try {
        const page = await opportunityApi.mine({ status: myFilter, page: myPagination.page + 1, limit: MY_PAGE_SIZE });
        if (get().myFilter !== myFilter) return;
        set((state) => {
          const shown = new Set(state.myOpportunities.map((item) => item.id));
          return { myOpportunities: [...state.myOpportunities, ...page.opportunities.filter((item) => !shown.has(item.id))], myPagination: page.pagination, myStatus: 'ready' };
        });
      } catch {
        set({ myStatus: 'ready' });
      }
    },


    /** Copies the opportunity's link. Resolves to true when copied. */
    shareOpportunity: (opportunityId) => copyText(opportunityUrl(opportunityId)),

    // ------------------------------------------------------------------------- moderators and admins

    fetchManaged: async (query = {}) => {
      const next = { ...get().managedQuery, ...query };
      set({ managedQuery: next, managedStatus: 'loading' });
      try {
        const { opportunities, counts, pagination } = await opportunityApi.manage({ ...next, page: 1, limit: 20 });
        if (sameManagedQuery(get().managedQuery, next)) set({ managed: opportunities, managedCounts: counts, managedPagination: pagination, managedStatus: 'ready' });
      } catch {
        if (sameManagedQuery(get().managedQuery, next)) set({ managedStatus: 'error' });
      }
    },

    loadMoreManaged: async () => {
      const { managedPagination, managedQuery } = get();
      if (!managedPagination?.hasMore) return;
      const page = await opportunityApi.manage({ ...managedQuery, page: managedPagination.page + 1, limit: 20 });
      if (!sameManagedQuery(get().managedQuery, managedQuery)) return;
      set((state) => {
        const shown = new Set(state.managed.map((item) => item.id));
        return { managed: [...state.managed, ...page.opportunities.filter((item) => !shown.has(item.id))], managedPagination: page.pagination };
      });
    },

    createOpportunity: async (fields) => {
      const opportunity = await opportunityApi.create(fields);
      set({ selectedOpportunity: opportunity, selectedStatus: 'ready' });
      return opportunity;
    },

    updateOpportunity: async (opportunityId, changes) => {
      const opportunity = await opportunityApi.update(opportunityId, changes);
      patchOpportunity(opportunityId, opportunity);
      return opportunity;
    },

    /** Publish, close, archive or move back to drafts. Refreshes the management counts. */
    setOpportunityStatus: async (opportunityId, status) => {
      const opportunity = await opportunityApi.update(opportunityId, { status });
      patchOpportunity(opportunityId, opportunity);
      get().fetchManaged();
      return opportunity;
    },

    deleteOpportunity: async (opportunityId) => {
      await opportunityApi.remove(opportunityId);
      const without = (list) => list.filter((item) => item.id !== opportunityId);
      set((state) => ({
        managed: without(state.managed),
        opportunities: without(state.opportunities),
        recommended: without(state.recommended),
        upcoming: without(state.upcoming),
        saved: without(state.saved),
        myOpportunities: without(state.myOpportunities),
        selectedOpportunity: state.selectedOpportunity?.id === opportunityId ? null : state.selectedOpportunity,
      }));
      get().fetchManaged();
    },

    /** kind: 'image' | 'logo' */
    uploadImage: async (opportunityId, kind, file) => {
      const opportunity = await opportunityApi.uploadImage(opportunityId, kind, file);
      patchOpportunity(opportunityId, opportunity);
      return opportunity;
    },

    removeImage: async (opportunityId, kind) => {
      const opportunity = await opportunityApi.removeImage(opportunityId, kind);
      patchOpportunity(opportunityId, opportunity);
      return opportunity;
    },

    reset: () => set(INITIAL_STATE),
  };
});
