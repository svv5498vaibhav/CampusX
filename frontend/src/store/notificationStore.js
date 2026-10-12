import { create } from 'zustand';
import { DROPDOWN_LIMIT, PAGE_SIZE } from '@/constants/notifications';
import { notificationApi } from '@/services/notificationApi';

const INITIAL_STATE = {
  viewerId: null,
  // From the API (on load, after every change) and from live updates. The server is the source of truth.
  unreadCount: 0,
  // The notification center (/notifications): one filter at a time, paged.
  items: [],
  filter: 'all', // 'all' | 'unread'
  pagination: null,
  status: 'idle', // idle | loading | loading-more | ready | error
  // The bell's dropdown: the most recent few only.
  recent: [],
  recentStatus: 'idle',
  // Socket.IO connection state, for a quiet "reconnecting" hint.
  liveStatus: 'idle', // idle | connecting | live | reconnecting | offline
  // The latest live arrival, announced to screen readers.
  lastArrival: null,
  preferences: null,
  categories: [],
  preferencesStatus: 'idle',
};

const upsertTop = (list, notification, limit) => [notification, ...list.filter((item) => item.id !== notification.id)].slice(0, limit ?? undefined);
const markRead = (list, ids, readAt) => list.map((item) => (ids === 'all' || ids.includes(item.id) ? { ...item, isRead: true, readAt: item.readAt ?? readAt } : item));

/** The signed-in student's notifications, unread count and preferences. */
export const useNotificationStore = create((set, get) => {
  /** Applies a change to both the dropdown and the notification center. */
  const updateLists = (change) => set((state) => ({ recent: change(state.recent), items: change(state.items) }));

  return {
    ...INITIAL_STATE,

    forViewer: (userId) => {
      if (get().viewerId === userId) return;
      set({ ...INITIAL_STATE, viewerId: userId, liveStatus: get().liveStatus });
    },

    fetchUnreadCount: async () => {
      try {
        const { unreadCount } = await notificationApi.unreadCount();
        set({ unreadCount });
      } catch {
        // Keep the last known count; the next refresh or live update corrects it.
      }
    },

    fetchRecent: async () => {
      set({ recentStatus: get().recent.length ? 'ready' : 'loading' });
      try {
        const { notifications, unreadCount } = await notificationApi.list({ page: 1, limit: DROPDOWN_LIMIT });
        set({ recent: notifications, unreadCount, recentStatus: 'ready' });
      } catch {
        set({ recentStatus: get().recent.length ? 'ready' : 'error' });
      }
    },

    fetchNotifications: async ({ filter = get().filter, more = false } = {}) => {
      const { pagination } = get();
      if (more && !pagination?.hasMore) return;
      set({ filter, status: more ? 'loading-more' : 'loading', ...(!more && filter !== get().filter && { items: [] }) });
      try {
        const page = more ? pagination.page + 1 : 1;
        const result = await notificationApi.list({ page, limit: PAGE_SIZE, filter });
        if (get().filter !== filter) return; // the student switched tabs meanwhile
        set((state) => ({
          items: more ? [...state.items, ...result.notifications.filter((item) => !state.items.some((shown) => shown.id === item.id))] : result.notifications,
          pagination: result.pagination,
          unreadCount: result.unreadCount,
          status: 'ready',
        }));
      } catch {
        set({ status: more ? 'ready' : 'error' });
      }
    },

    /** Opening a notification marks it read (shown at once, then confirmed by the server). */
    markAsRead: async (id) => {
      const target = [...get().items, ...get().recent].find((item) => item.id === id);
      if (!target || target.isRead) return;
      const previous = { recent: get().recent, items: get().items, unreadCount: get().unreadCount };
      updateLists((list) => markRead(list, [id], new Date().toISOString()));
      set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) }));
      try {
        const { notification, unreadCount } = await notificationApi.markAsRead(id);
        updateLists((list) => list.map((item) => (item.id === id ? notification : item)));
        set({ unreadCount });
      } catch {
        set(previous);
      }
    },

    /** The count drops to 0 only once the server confirms. */
    markAllAsRead: async () => {
      const { unreadCount } = await notificationApi.markAllAsRead();
      updateLists((list) => markRead(list, 'all', new Date().toISOString()));
      set({ unreadCount });
    },

    deleteNotification: async (id) => {
      const { unreadCount } = await notificationApi.remove(id);
      updateLists((list) => list.filter((item) => item.id !== id));
      set((state) => ({ unreadCount, pagination: state.pagination && { ...state.pagination, total: Math.max(0, state.pagination.total - 1) } }));
    },

    deleteRead: async () => {
      const { unreadCount } = await notificationApi.removeRead();
      updateLists((list) => list.filter((item) => !item.isRead));
      set({ unreadCount });
    },

    // ------------------------------------------------------------------ live updates (Socket.IO)

    /** A new notification, or a grouped one that just changed: it moves to the top. */
    addRealtimeNotification: (notification, unreadCount) => {
      set((state) => ({
        recent: state.recentStatus === 'ready' ? upsertTop(state.recent, notification, DROPDOWN_LIMIT) : state.recent,
        items: state.status === 'ready' || state.status === 'loading-more' ? upsertTop(state.items, notification) : state.items,
        unreadCount: unreadCount ?? state.unreadCount + 1,
        lastArrival: notification,
      }));
    },

    /** Read in another tab, or "Mark all as read" there. */
    applyRead: ({ ids, all, readAt }) => updateLists((list) => markRead(list, all ? 'all' : ids ?? [], readAt)),

    /** Deleted in another tab, or withdrawn by the server (e.g. a like taken back before it was seen). */
    applyDeleted: ({ ids, allRead }) => updateLists((list) => list.filter((item) => !(allRead ? item.isRead : (ids ?? []).includes(item.id)))),

    updateUnreadCount: (unreadCount) => set({ unreadCount }),

    setLiveStatus: (liveStatus) => set({ liveStatus }),

    /** After a reconnect: catch up on anything that happened while offline. */
    resync: () => {
      const { fetchUnreadCount, fetchRecent, fetchNotifications, recentStatus, status } = get();
      fetchUnreadCount();
      if (recentStatus === 'ready') fetchRecent();
      if (status === 'ready') fetchNotifications();
    },

    // ------------------------------------------------------------------ preferences

    fetchPreferences: async () => {
      set({ preferencesStatus: get().preferences ? 'ready' : 'loading' });
      try {
        const { preferences, categories } = await notificationApi.preferences();
        set({ preferences, categories, preferencesStatus: 'ready' });
      } catch {
        set({ preferencesStatus: get().preferences ? 'ready' : 'error' });
      }
    },

    /** Saves one category at a time. Throws so the caller can show the error. */
    updatePreference: async (category, enabled) => {
      const previous = get().preferences;
      set({ preferences: { ...previous, [category]: enabled } });
      try {
        const { preferences, categories } = await notificationApi.updatePreferences({ [category]: enabled });
        set({ preferences, categories });
      } catch (error) {
        set({ preferences: previous });
        throw error;
      }
    },

    reset: () => set(INITIAL_STATE),
  };
});
