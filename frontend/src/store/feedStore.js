import { create } from 'zustand';
import { postApi } from '@/services/postApi';

const PAGE_SIZE = 10;

const INITIAL_STATE = {
  viewerId: null, // the student this feed was loaded for
  posts: [],
  filter: 'all',
  communityId: null, // set while a community's feed is shown instead of the campus feed
  loading: false, // first page (or a filter change) is loading
  loadingMore: false,
  error: '',
  pagination: null, // { page, limit, total, hasMore }
  hasMore: false,
  selectedPost: null, // the post open on /post/:postId
  selectedStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'not-found' | 'error'
  selectedError: '',
  // Posts shown outside the feed (search results), by id, so likes, saves, edits and deletes reach them
  // too. null marks one that was deleted.
  external: {},
  creatingPost: false,
  editingPost: null, // id of the post being saved
  deletingPost: null, // id of the post being deleted
  busy: {}, // { "<postId>:like": true } while a like/save request runs
  options: null,
  optionsStatus: 'idle',
};

/** Whether a new post belongs in the feed on screen (so it can be shown straight away). */
const belongsInFeed = (post, { filter, communityId }) =>
  communityId
    ? post.community?.id === communityId
    : !post.community && (filter === 'all' || filter === 'branch' || post.type === filter);

/** Which feed is loaded: the campus feed with a filter, or one community's feed. */
const sameFeed = (state, filter, communityId) => state.filter === filter && state.communityId === communityId;
const listPage = ({ filter, communityId }, page) =>
  communityId ? postApi.listCommunity(communityId, { page, limit: PAGE_SIZE }) : postApi.list({ page, limit: PAGE_SIZE, filter });

/**
 * The campus feed, or a community's feed (same posts, likes, comments and saves). All post API calls go through here (and services/postApi.js), never through
 * components. Every change updates local state at once, in the list and on the open post, so the
 * page never needs a reload.
 */
export const useFeedStore = create((set, get) => {
  /** Applies a change to a post wherever it is shown. */
  const patchPost = (postId, patch) =>
    set((state) => {
      const apply = (post) => (post.id === postId ? { ...post, ...(typeof patch === 'function' ? patch(post) : patch) } : post);
      const external = state.external[postId] ? { ...state.external, [postId]: apply(state.external[postId]) } : state.external;
      return {
        posts: state.posts.map(apply),
        selectedPost: state.selectedPost ? apply(state.selectedPost) : null,
        external,
      };
    });

  const setBusy = (key, value) =>
    set((state) => {
      const busy = { ...state.busy };
      if (value) busy[key] = true;
      else delete busy[key];
      return { busy };
    });

  /** Optimistic like/save toggle, rolled back if the server says no. One request per post at a time. */
  const toggle = async (postId, kind, on) => {
    const key = `${postId}:${kind}`;
    if (get().busy[key]) return;
    const field = kind === 'like' ? 'likedByCurrentUser' : 'savedByCurrentUser';
    const before = [...get().posts, get().selectedPost, ...Object.values(get().external)].find((post) => post?.id === postId);
    if (!before) return;

    setBusy(key, true);
    patchPost(postId, (post) => ({
      [field]: on,
      ...(kind === 'like' && post.likedByCurrentUser !== on && { likeCount: Math.max(0, post.likeCount + (on ? 1 : -1)) }),
    }));
    try {
      const call = { like: on ? postApi.like : postApi.unlike, save: on ? postApi.save : postApi.unsave }[kind];
      // The server's counts replace the optimistic ones.
      patchPost(postId, await call(postId));
    } catch (error) {
      patchPost(postId, { [field]: before[field], likeCount: before.likeCount });
      if (error.status === 404) get().removeLocal(postId);
      throw error;
    } finally {
      setBusy(key, false);
    }
  };

  return {
    ...INITIAL_STATE,

    loadOptions: async () => {
      if (['loading', 'ready'].includes(get().optionsStatus)) return;
      set({ optionsStatus: 'loading' });
      try {
        set({ options: await postApi.getOptions(), optionsStatus: 'ready' });
      } catch {
        set({ optionsStatus: 'error' });
      }
    },

    /**
     * First page of the campus feed (for a filter) or of a community's feed. Posts already on screen
     * stay visible while the same feed reloads.
     */
    fetchPosts: async (filter = 'all', { communityId = null } = {}) => {
      const changedFeed = !sameFeed(get(), filter, communityId);
      set({ filter, communityId, loading: true, error: '', ...(changedFeed && { posts: [], pagination: null, hasMore: false }) });
      try {
        const { posts, pagination } = await listPage({ filter, communityId }, 1);
        if (!sameFeed(get(), filter, communityId)) return; // another feed was opened meanwhile
        set({ posts, pagination, hasMore: pagination.hasMore, loading: false });
      } catch (error) {
        if (!sameFeed(get(), filter, communityId)) return;
        set({ loading: false, error: error.message });
      }
    },

    loadMore: async () => {
      const { pagination, loading, loadingMore, hasMore, filter, communityId } = get();
      if (!pagination || loading || loadingMore || !hasMore) return;
      set({ loadingMore: true, error: '' });
      try {
        const next = await listPage({ filter, communityId }, pagination.page + 1);
        if (!sameFeed(get(), filter, communityId)) return;
        set((state) => {
          // New posts may have shifted the pages; skip any already shown.
          const shown = new Set(state.posts.map((post) => post.id));
          return {
            posts: [...state.posts, ...next.posts.filter((post) => !shown.has(post.id))],
            pagination: next.pagination,
            hasMore: next.pagination.hasMore,
            loadingMore: false,
          };
        });
      } catch (error) {
        set({ loadingMore: false, error: error.message });
      }
    },

    fetchPost: async (postId) => {
      const cached = get().posts.find((post) => post.id === postId);
      set({ selectedPost: cached ?? null, selectedStatus: cached ? 'ready' : 'loading', selectedError: '' });
      try {
        set({ selectedPost: await postApi.get(postId), selectedStatus: 'ready' });
      } catch (error) {
        set({ selectedPost: null, selectedStatus: error.status === 404 ? 'not-found' : 'error', selectedError: error.message });
      }
    },

    // The actions below reject with the API error so the UI can show it.

    createPost: async (fields, files, onProgress) => {
      if (get().creatingPost) return null;
      set({ creatingPost: true });
      try {
        const post = await postApi.create(fields, files, { onProgress });
        set((state) => ({
          posts: belongsInFeed(post, state) ? [post, ...state.posts.filter((item) => item.id !== post.id)] : state.posts,
        }));
        return post;
      } finally {
        set({ creatingPost: false });
      }
    },

    updatePost: async (postId, fields, files, onProgress) => {
      if (get().editingPost) return null;
      set({ editingPost: postId });
      try {
        const post = await postApi.update(postId, fields, files, { onProgress });
        patchPost(postId, post);
        return post;
      } finally {
        set({ editingPost: null });
      }
    },

    deletePost: async (postId) => {
      if (get().deletingPost) return;
      set({ deletingPost: postId });
      try {
        await postApi.remove(postId);
        get().removeLocal(postId);
      } finally {
        set({ deletingPost: null });
      }
    },

    /** Drops a post from the screen (deleted here, or found to be gone on the server). */
    removeLocal: (postId) =>
      set((state) => ({
        posts: state.posts.filter((post) => post.id !== postId),
        pagination: state.pagination && { ...state.pagination, total: Math.max(0, state.pagination.total - 1) },
        selectedPost: state.selectedPost?.id === postId ? null : state.selectedPost,
        selectedStatus: state.selectedPost?.id === postId ? 'not-found' : state.selectedStatus,
        external: postId in state.external ? { ...state.external, [postId]: null } : state.external,
      })),

    /** Search results: keeps these posts in step with likes, saves, edits and deletes made anywhere. */
    showExternal: (posts) =>
      set((state) => ({ external: { ...state.external, ...Object.fromEntries(posts.map((post) => [post.id, post])) } })),

    likePost: (postId) => toggle(postId, 'like', true),
    unlikePost: (postId) => toggle(postId, 'like', false),
    savePost: (postId) => toggle(postId, 'save', true),
    unsavePost: (postId) => toggle(postId, 'save', false),

    /** Comment counts come back from the comment endpoints. */
    setCommentCount: (postId, commentCount) => patchPost(postId, { commentCount }),

    /** Clears anything loaded for a different student (e.g. another account signed in on this tab). */
    forViewer: (userId) => {
      if (get().viewerId === userId) return;
      const { options, optionsStatus } = get();
      set({ ...INITIAL_STATE, options, optionsStatus, viewerId: userId });
    },

    reset: () => set(INITIAL_STATE),
  };
});
