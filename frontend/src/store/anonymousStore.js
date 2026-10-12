import { create } from 'zustand';
import { anonymousApi } from '@/services/anonymousApi';

const PAGE_SIZE = 10;
const COMMENT_PAGE_SIZE = 20;

/** Feed filters (kept in the page URL). */
export const DEFAULT_ANONYMOUS_FILTERS = Object.freeze({ category: 'all', sort: 'recent', search: '' });

const INITIAL_STATE = {
  viewerId: null,
  options: null,
  optionsStatus: 'idle',
  posts: [],
  filters: DEFAULT_ANONYMOUS_FILTERS,
  pagination: null,
  loading: false,
  loadingMore: false,
  error: '',
  selectedPost: null,
  selectedStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'not-found' | 'error'
  selectedError: '',
  myPosts: [],
  myPagination: null,
  myStatus: 'idle',
  comments: {}, // { [postId]: { items, pagination, status } }
  busy: {}, // { "<postId>:like": true }
};

const sameFilters = (a, b) => a.category === b.category && a.sort === b.sort && a.search === b.search;

/** Anonymous Zone state. All Anonymous Zone API calls go through here (and services/anonymousApi.js). */
export const useAnonymousStore = create((set, get) => {
  /** Applies a change to a post wherever it is shown. */
  const patchPost = (postId, patch) =>
    set((state) => {
      const apply = (item) => (item.id === postId ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) } : item);
      return {
        posts: state.posts.map(apply),
        myPosts: state.myPosts.map(apply),
        selectedPost: state.selectedPost ? apply(state.selectedPost) : null,
      };
    });

  const dropPost = (postId) =>
    set((state) => ({
      posts: state.posts.filter((item) => item.id !== postId),
      myPosts: state.myPosts.filter((item) => item.id !== postId),
      selectedPost: state.selectedPost?.id === postId ? null : state.selectedPost,
    }));

  const setComments = (postId, update) =>
    set((state) => {
      const current = state.comments[postId] ?? { items: [], pagination: null, status: 'idle' };
      return { comments: { ...state.comments, [postId]: { ...current, ...update(current) } } };
    });

  return {
    ...INITIAL_STATE,

    /** Clears everything when a different student signs in. */
    forViewer: (userId) => {
      if (get().viewerId === userId) return;
      const { options, optionsStatus } = get();
      set({ ...INITIAL_STATE, options, optionsStatus, viewerId: userId });
    },

    loadOptions: async () => {
      if (['loading', 'ready'].includes(get().optionsStatus)) return;
      set({ optionsStatus: 'loading' });
      try {
        set({ options: await anonymousApi.getOptions(), optionsStatus: 'ready' });
      } catch {
        set({ optionsStatus: 'error' });
      }
    },

    // ------------------------------------------------------------------------- posts

    fetchAnonymousPosts: async (filters = {}) => {
      const next = { ...get().filters, ...filters };
      const changed = !sameFilters(next, get().filters);
      set({ filters: next, loading: true, error: '', ...(changed && { posts: [], pagination: null }) });
      try {
        const { posts, pagination } = await anonymousApi.list({ ...next, page: 1, limit: PAGE_SIZE });
        if (sameFilters(get().filters, next)) set({ posts, pagination, loading: false });
      } catch (error) {
        if (sameFilters(get().filters, next)) set({ loading: false, error: error.message });
      }
    },

    loadMore: async () => {
      const { pagination, loading, loadingMore, filters } = get();
      if (!pagination?.hasMore || loading || loadingMore) return;
      set({ loadingMore: true });
      try {
        const page = await anonymousApi.list({ ...filters, page: pagination.page + 1, limit: PAGE_SIZE });
        if (!sameFilters(get().filters, filters)) return;
        set((state) => {
          const shown = new Set(state.posts.map((item) => item.id));
          return { posts: [...state.posts, ...page.posts.filter((item) => !shown.has(item.id))], pagination: page.pagination, loadingMore: false };
        });
      } catch (error) {
        set({ loadingMore: false, error: error.message });
      }
    },

    fetchAnonymousPost: async (postId) => {
      const cached = [...get().posts, ...get().myPosts].find((item) => item.id === postId);
      const keep = get().selectedPost?.id === postId;
      set({ selectedPost: keep ? get().selectedPost : (cached ?? null), selectedStatus: keep || cached ? 'ready' : 'loading', selectedError: '' });
      try {
        set({ selectedPost: await anonymousApi.get(postId), selectedStatus: 'ready' });
      } catch (error) {
        set({ selectedPost: null, selectedStatus: error.status === 404 ? 'not-found' : 'error', selectedError: error.message });
      }
    },

    fetchMyAnonymousPosts: async ({ more = false } = {}) => {
      const { myPagination } = get();
      if (more && !myPagination?.hasMore) return;
      set({ myStatus: more ? 'loading-more' : 'loading' });
      try {
        const { posts, pagination } = await anonymousApi.mine({ page: more ? myPagination.page + 1 : 1, limit: PAGE_SIZE });
        set((state) => ({ myPosts: more ? [...state.myPosts, ...posts.filter((post) => !state.myPosts.some((item) => item.id === post.id))] : posts, myPagination: pagination, myStatus: 'ready' }));
      } catch {
        set({ myStatus: 'error' });
      }
    },

    // These reject with the API error so forms and menus can show it.

    createAnonymousPost: async (fields, images) => {
      const post = await anonymousApi.create(fields, images);
      set((state) => ({ selectedPost: post, selectedStatus: 'ready', myPosts: [post, ...state.myPosts] }));
      return post;
    },

    updateAnonymousPost: async (postId, changes) => {
      const post = await anonymousApi.update(postId, changes);
      patchPost(postId, post);
      return post;
    },

    deleteAnonymousPost: async (postId) => {
      await anonymousApi.remove(postId);
      dropPost(postId);
    },

    /** Optimistic like/unlike, rolled back if the server says no. Only counts are ever shown. */
    likeAnonymousPost: async (postId, liked = true) => {
      const key = `${postId}:like`;
      if (get().busy[key]) return;
      const before = [get().selectedPost, ...get().posts, ...get().myPosts].find((item) => item?.id === postId);
      set((state) => ({ busy: { ...state.busy, [key]: true } }));
      if (before && before.likedByCurrentUser !== liked) {
        patchPost(postId, (item) => ({ likedByCurrentUser: liked, likeCount: Math.max(0, item.likeCount + (liked ? 1 : -1)) }));
      }
      try {
        patchPost(postId, await (liked ? anonymousApi.like : anonymousApi.unlike)(postId));
      } catch (error) {
        if (before) patchPost(postId, { likedByCurrentUser: before.likedByCurrentUser, likeCount: before.likeCount });
        throw error;
      } finally {
        set((state) => {
          const busy = { ...state.busy };
          delete busy[key];
          return { busy };
        });
      }
    },


    // ------------------------------------------------------------------------- comments

    loadComments: async (postId, { more = false } = {}) => {
      const current = get().comments[postId];
      if (more && !current?.pagination?.hasMore) return;
      setComments(postId, () => ({ status: more ? 'loading-more' : 'loading' }));
      try {
        const page = more ? current.pagination.page + 1 : 1;
        const { comments, pagination } = await anonymousApi.listComments(postId, { page, limit: COMMENT_PAGE_SIZE });
        setComments(postId, (entry) => ({ items: more ? [...entry.items, ...comments.filter((c) => !entry.items.some((item) => item.id === c.id))] : comments, pagination, status: 'ready' }));
      } catch (error) {
        setComments(postId, () => ({ status: 'error', error: error.message }));
      }
    },

    commentAnonymousPost: async (postId, content) => {
      const { comment, commentCount } = await anonymousApi.addComment(postId, content);
      setComments(postId, (entry) => ({ items: [...entry.items, comment], pagination: entry.pagination && { ...entry.pagination, total: entry.pagination.total + 1 } }));
      patchPost(postId, { commentCount });
      return comment;
    },

    updateComment: async (postId, commentId, content) => {
      const comment = await anonymousApi.updateComment(commentId, content);
      setComments(postId, (entry) => ({ items: entry.items.map((item) => (item.id === commentId ? comment : item)) }));
      return comment;
    },

    deleteComment: async (postId, commentId) => {
      const { commentCount } = await anonymousApi.removeComment(commentId);
      setComments(postId, (entry) => ({ items: entry.items.filter((item) => item.id !== commentId), pagination: entry.pagination && { ...entry.pagination, total: Math.max(0, entry.pagination.total - 1) } }));
      patchPost(postId, { commentCount });
    },


    reset: () => set(INITIAL_STATE),
  };
});
