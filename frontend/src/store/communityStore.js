import { create } from 'zustand';
import { communityApi } from '@/services/communityApi';

const PAGE_SIZE = 12;
const MEMBER_PAGE_SIZE = 20;

const INITIAL_STATE = {
  viewerId: null, // the student this data was loaded for
  communities: [], // discovery list for the current filter/search/sort
  query: { filter: 'all', search: '', sort: 'popular' },
  pagination: null,
  loading: false,
  loadingMore: false,
  error: '',
  myCommunities: [],
  myStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
  recommendedCommunities: [],
  recommendedStatus: 'idle',
  selectedCommunity: null,
  selectedStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'not-found' | 'forbidden' | 'error'
  selectedError: '',
  members: [],
  membersPagination: null,
  membersStatus: 'idle',
  busy: {}, // { "<communityId>:join": true } while a request runs
  options: null,
  optionsStatus: 'idle',
};

const sameQuery = (a, b) => a.filter === b.filter && a.search === b.search && a.sort === b.sort;

/**
 * Communities for the UI. All community API calls live here (and in services/communityApi.js).
 * Every change updates local state at once, wherever the community is shown.
 */
export const useCommunityStore = create((set, get) => {
  /** Puts the latest copy of a community into every list and the open page. */
  const putCommunity = (community) =>
    set((state) => {
      const replace = (item) => (item.id === community.id ? { ...item, ...community } : item);
      const isMember = community.membership?.status === 'active';
      const inMine = state.myCommunities.some((item) => item.id === community.id);
      return {
        communities: state.communities.map(replace),
        recommendedCommunities: state.recommendedCommunities.map(replace),
        myCommunities: isMember
          ? inMine ? state.myCommunities.map(replace) : [community, ...state.myCommunities]
          : state.myCommunities.filter((item) => item.id !== community.id),
        selectedCommunity: state.selectedCommunity?.id === community.id ? { ...state.selectedCommunity, ...community } : state.selectedCommunity,
      };
    });

  const setBusy = (key, value) =>
    set((state) => {
      const busy = { ...state.busy };
      if (value) busy[key] = true;
      else delete busy[key];
      return { busy };
    });

  /** Runs one request per community+action at a time. */
  const guarded = async (key, task) => {
    if (get().busy[key]) return null;
    setBusy(key, true);
    try {
      return await task();
    } finally {
      setBusy(key, false);
    }
  };

  return {
    ...INITIAL_STATE,

    /** Clears anything loaded for a different student (e.g. another account signed in on this tab). */
    forViewer: (userId) => {
      if (get().viewerId === userId) return;
      const { options, optionsStatus } = get();
      set({ ...INITIAL_STATE, options, optionsStatus, viewerId: userId });
    },

    loadOptions: async () => {
      if (['loading', 'ready'].includes(get().optionsStatus)) return;
      set({ optionsStatus: 'loading' });
      try {
        set({ options: await communityApi.getOptions(), optionsStatus: 'ready' });
      } catch {
        set({ optionsStatus: 'error' });
      }
    },

    /** First page of the discovery list for a filter / search / sort. */
    fetchCommunities: async (query = {}) => {
      const next = { ...get().query, ...query };
      const changed = !sameQuery(next, get().query);
      set({ query: next, loading: true, error: '', ...(changed && { communities: [], pagination: null }) });
      try {
        const { communities, pagination } = await communityApi.list({ ...next, page: 1, limit: PAGE_SIZE });
        if (!sameQuery(get().query, next)) return; // a newer search was started
        set({ communities, pagination, loading: false });
      } catch (error) {
        if (sameQuery(get().query, next)) set({ loading: false, error: error.message });
      }
    },

    searchCommunities: (search) => get().fetchCommunities({ search }),

    loadMore: async () => {
      const { pagination, loading, loadingMore, query } = get();
      if (!pagination?.hasMore || loading || loadingMore) return;
      set({ loadingMore: true });
      try {
        const page = await communityApi.list({ ...query, page: pagination.page + 1, limit: PAGE_SIZE });
        if (!sameQuery(get().query, query)) return;
        set((state) => {
          const shown = new Set(state.communities.map((item) => item.id));
          return {
            communities: [...state.communities, ...page.communities.filter((item) => !shown.has(item.id))],
            pagination: page.pagination,
            loadingMore: false,
          };
        });
      } catch (error) {
        set({ loadingMore: false, error: error.message });
      }
    },

    fetchMyCommunities: async () => {
      set((state) => ({ myStatus: state.myCommunities.length ? 'ready' : 'loading' }));
      try {
        set({ myCommunities: await communityApi.mine(), myStatus: 'ready' });
      } catch {
        set({ myStatus: 'error' });
      }
    },

    fetchRecommended: async () => {
      set((state) => ({ recommendedStatus: state.recommendedCommunities.length ? 'ready' : 'loading' }));
      try {
        set({ recommendedCommunities: await communityApi.recommended(), recommendedStatus: 'ready' });
      } catch {
        set({ recommendedStatus: 'error' });
      }
    },

    fetchCommunity: async (communityId) => {
      const cached = [...get().communities, ...get().myCommunities, ...get().recommendedCommunities].find((item) => item.id === communityId);
      const keep = get().selectedCommunity?.id === communityId;
      set({
        selectedCommunity: keep ? get().selectedCommunity : (cached ?? null),
        selectedStatus: keep || cached ? 'ready' : 'loading',
        selectedError: '',
        ...(!keep && { members: [], membersPagination: null, membersStatus: 'idle' }),
      });
      try {
        set({ selectedCommunity: await communityApi.get(communityId), selectedStatus: 'ready' });
      } catch (error) {
        const status = { 404: 'not-found', 403: 'forbidden' }[error.status] ?? 'error';
        set({ selectedCommunity: null, selectedStatus: status, selectedError: error.message });
      }
    },

    // The actions below reject with the API error so the UI can show it.

    createCommunity: async (fields) => {
      const community = await communityApi.create(fields);
      putCommunity(community);
      set((state) => ({ selectedCommunity: community, selectedStatus: 'ready', communities: [community, ...state.communities.filter((item) => item.id !== community.id)] }));
      return community;
    },

    updateCommunity: async (communityId, changes) => {
      const community = await communityApi.update(communityId, changes);
      putCommunity(community);
      return community;
    },

    archiveCommunity: async (communityId) => {
      const community = await communityApi.archive(communityId);
      putCommunity(community);
      // Archived communities leave discovery but stay in the owner's own list.
      set((state) => ({ communities: state.communities.filter((item) => item.id !== communityId) }));
      return community;
    },

    joinCommunity: (communityId) =>
      guarded(`${communityId}:join`, async () => {
        const community = await communityApi.join(communityId);
        putCommunity(community);
        return community;
      }),

    leaveCommunity: (communityId) =>
      guarded(`${communityId}:join`, async () => {
        await communityApi.leave(communityId);
        // Fresh copy (member count, permissions); fall back to a local update if it can't be read anymore.
        const community = await communityApi.get(communityId).catch(() => null);
        if (community) putCommunity(community);
        else set((state) => ({ myCommunities: state.myCommunities.filter((item) => item.id !== communityId) }));
        set((state) => ({ members: state.members.filter((member) => !member.isYou) }));
        return community;
      }),

    fetchMembers: async (communityId, { more = false } = {}) => {
      const { membersPagination, membersStatus } = get();
      if (more && (!membersPagination?.hasMore || membersStatus === 'loading')) return;
      const page = more ? membersPagination.page + 1 : 1;
      set({ membersStatus: 'loading' });
      try {
        const data = await communityApi.members(communityId, { page, limit: MEMBER_PAGE_SIZE });
        if (get().selectedCommunity && get().selectedCommunity.id !== communityId) return;
        set((state) => ({
          members: more ? [...state.members, ...data.members.filter((m) => !state.members.some((x) => x.student.id === m.student.id))] : data.members,
          membersPagination: data.pagination,
          membersStatus: 'ready',
        }));
      } catch {
        set({ membersStatus: 'error' });
      }
    },

    changeRole: async (communityId, userId, role) => {
      const member = await communityApi.changeRole(communityId, userId, role);
      set((state) => ({ members: state.members.map((item) => (item.student.id === userId ? { ...item, role: member.role } : item)) }));
      // Your own permissions may have changed (e.g. stepping down as owner).
      if (member.isYou) await get().fetchCommunity(communityId);
      return member;
    },

    removeMember: async (communityId, userId) => {
      await communityApi.removeMember(communityId, userId);
      set((state) => ({
        members: state.members.filter((item) => item.student.id !== userId),
        membersPagination: state.membersPagination && { ...state.membersPagination, total: Math.max(0, state.membersPagination.total - 1) },
        selectedCommunity: state.selectedCommunity?.id === communityId
          ? { ...state.selectedCommunity, memberCount: Math.max(0, state.selectedCommunity.memberCount - 1) }
          : state.selectedCommunity,
      }));
    },

    uploadImage: async (communityId, kind, file, onProgress) => {
      const community = await (kind === 'icon' ? communityApi.uploadIcon : communityApi.uploadCover)(communityId, file, { onProgress });
      putCommunity(community);
      return community;
    },

    removeImage: async (communityId, kind) => {
      const community = await (kind === 'icon' ? communityApi.removeIcon : communityApi.removeCover)(communityId);
      putCommunity(community);
      return community;
    },

    reset: () => set(INITIAL_STATE),
  };
});
