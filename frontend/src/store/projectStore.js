import { create } from 'zustand';
import { projectUrl } from '@/constants/showcase';
import { projectApi } from '@/services/projectApi';
import { copyText } from '@/utils/clipboard';

const PAGE_SIZE = 12;

const INITIAL_STATE = {
  viewerId: null,
  projects: [], // discovery list
  query: { category: 'all', sort: 'new', search: '' },
  pagination: null,
  loading: false,
  loadingMore: false,
  error: '',
  selectedProject: null,
  selectedStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'not-found' | 'error'
  selectedError: '',
  mine: null, // { projects, teamProjects, invitations }
  byUser: {}, // { [userId]: { projects, total, status } } for profiles
  creating: false,
  editing: false,
  deleting: null, // id being deleted
  busy: {}, // { "<projectId>:like": true }
  options: null,
  optionsStatus: 'idle',
};

const sameQuery = (a, b) => a.category === b.category && a.sort === b.sort && a.search === b.search;

/** Student projects for the UI. All project API calls go through here (and services/projectApi.js). */
export const useProjectStore = create((set, get) => {
  /** Applies a change to a project wherever it is shown. */
  const patchProject = (projectId, patch) =>
    set((state) => {
      const apply = (item) => (item.id === projectId ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) } : item);
      const byUser = Object.fromEntries(Object.entries(state.byUser).map(([id, entry]) => [id, { ...entry, projects: entry.projects.map(apply) }]));
      return {
        projects: state.projects.map(apply),
        selectedProject: state.selectedProject ? apply(state.selectedProject) : null,
        mine: state.mine && { ...state.mine, projects: state.mine.projects.map(apply), teamProjects: state.mine.teamProjects.map(apply) },
        byUser,
      };
    });

  const dropProject = (projectId) =>
    set((state) => ({
      projects: state.projects.filter((item) => item.id !== projectId),
      selectedProject: state.selectedProject?.id === projectId ? null : state.selectedProject,
      mine: state.mine && { ...state.mine, projects: state.mine.projects.filter((item) => item.id !== projectId) },
      byUser: Object.fromEntries(Object.entries(state.byUser).map(([id, entry]) => [id, { ...entry, projects: entry.projects.filter((item) => item.id !== projectId) }])),
    }));

  const setBusy = (key, value) =>
    set((state) => {
      const busy = { ...state.busy };
      if (value) busy[key] = true;
      else delete busy[key];
      return { busy };
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
        set({ options: await projectApi.getOptions(), optionsStatus: 'ready' });
      } catch {
        set({ optionsStatus: 'error' });
      }
    },

    fetchProjects: async (query = {}) => {
      const next = { ...get().query, ...query };
      const changed = !sameQuery(next, get().query);
      set({ query: next, loading: true, error: '', ...(changed && { projects: [], pagination: null }) });
      try {
        const { projects, pagination } = await projectApi.list({ ...next, page: 1, limit: PAGE_SIZE });
        if (sameQuery(get().query, next)) set({ projects, pagination, loading: false });
      } catch (error) {
        if (sameQuery(get().query, next)) set({ loading: false, error: error.message });
      }
    },

    loadMore: async () => {
      const { pagination, loading, loadingMore, query } = get();
      if (!pagination?.hasMore || loading || loadingMore) return;
      set({ loadingMore: true });
      try {
        const page = await projectApi.list({ ...query, page: pagination.page + 1, limit: PAGE_SIZE });
        if (!sameQuery(get().query, query)) return;
        set((state) => {
          const shown = new Set(state.projects.map((item) => item.id));
          return { projects: [...state.projects, ...page.projects.filter((item) => !shown.has(item.id))], pagination: page.pagination, loadingMore: false };
        });
      } catch (error) {
        set({ loadingMore: false, error: error.message });
      }
    },

    fetchMine: async () => {
      try {
        set({ mine: await projectApi.mine() });
      } catch {
        // The profile and discovery pages still work without it.
      }
    },

    fetchUserProjects: async (userId) => {
      set((state) => ({ byUser: { ...state.byUser, [userId]: { projects: state.byUser[userId]?.projects ?? [], total: state.byUser[userId]?.total ?? 0, status: 'loading' } } }));
      try {
        const { projects, pagination } = await projectApi.listByUser(userId, { limit: 6 });
        set((state) => ({ byUser: { ...state.byUser, [userId]: { projects, total: pagination.total, status: 'ready' } } }));
      } catch {
        set((state) => ({ byUser: { ...state.byUser, [userId]: { projects: [], total: 0, status: 'error' } } }));
      }
    },

    fetchProject: async (projectId) => {
      const cached = get().projects.find((item) => item.id === projectId);
      const keep = get().selectedProject?.id === projectId;
      set({ selectedProject: keep ? get().selectedProject : (cached ?? null), selectedStatus: keep || cached ? 'ready' : 'loading', selectedError: '' });
      try {
        set({ selectedProject: await projectApi.get(projectId), selectedStatus: 'ready' });
      } catch (error) {
        set({ selectedProject: null, selectedStatus: error.status === 404 ? 'not-found' : 'error', selectedError: error.message });
      }
    },

    // The actions below reject with the API error so forms can show it.

    createProject: async (fields) => {
      set({ creating: true });
      try {
        const project = await projectApi.create(fields);
        set((state) => ({ selectedProject: project, selectedStatus: 'ready', mine: state.mine && { ...state.mine, projects: [project, ...state.mine.projects] } }));
        return project;
      } finally {
        set({ creating: false });
      }
    },

    updateProject: async (projectId, changes) => {
      set({ editing: true });
      try {
        const project = await projectApi.update(projectId, changes);
        patchProject(projectId, project);
        return project;
      } finally {
        set({ editing: false });
      }
    },

    deleteProject: async (projectId) => {
      if (get().deleting) return;
      set({ deleting: projectId });
      try {
        await projectApi.remove(projectId);
        dropProject(projectId);
      } finally {
        set({ deleting: null });
      }
    },

    addImages: async (projectId, files, onProgress) => {
      const project = await projectApi.addImages(projectId, files, { onProgress });
      patchProject(projectId, project);
      return project;
    },

    removeImage: async (projectId, imageId) => {
      const project = await projectApi.removeImage(projectId, imageId);
      patchProject(projectId, project);
      return project;
    },

    /** Optimistic like/unlike, rolled back if the server says no. */
    likeProject: async (projectId, liked = true) => {
      const key = `${projectId}:like`;
      if (get().busy[key]) return;
      const before = [get().selectedProject, ...get().projects].find((item) => item?.id === projectId);
      setBusy(key, true);
      if (before && before.likedByCurrentUser !== liked) {
        patchProject(projectId, (item) => ({ likedByCurrentUser: liked, likeCount: Math.max(0, item.likeCount + (liked ? 1 : -1)) }));
      }
      try {
        patchProject(projectId, await (liked ? projectApi.like : projectApi.unlike)(projectId));
      } catch (error) {
        if (before) patchProject(projectId, { likedByCurrentUser: before.likedByCurrentUser, likeCount: before.likeCount });
        throw error;
      } finally {
        setBusy(key, false);
      }
    },
    unlikeProject: (projectId) => get().likeProject(projectId, false),

    /** Copies the project's link. Resolves to true when copied. */
    shareProject: (projectId) => copyText(projectUrl(projectId)),

    acceptInvitation: async (projectId) => {
      const project = await projectApi.acceptInvitation(projectId);
      patchProject(projectId, project);
      await get().fetchMine();
      return project;
    },

    leaveTeam: async (projectId) => {
      await projectApi.leaveTeam(projectId);
      await get().fetchMine();
    },

    searchTeamCandidates: (search) => projectApi.teamCandidates(search),

    reset: () => set(INITIAL_STATE),
  };
});
