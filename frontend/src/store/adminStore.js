import { create } from 'zustand';
import { adminApi } from '@/services/adminApi';
import { checkApiHealth } from '@/services/health.service';

const MAX_EVENTS = 30;

/**
 * The control center's shared state: who is signed in and what their role may do (from the API), the
 * live system status, and admin events that arrived over the socket. Page data (lists, cases, charts)
 * stays in each page. Permissions here only decide what is shown; the API enforces them.
 */
export const useAdminStore = create((set, get) => ({
  session: null,
  sessionStatus: 'idle', // idle | loading | ready | error
  sessionError: null,

  system: null,
  systemStatus: 'idle', // idle | loading | ready | unreachable
  systemCheckedAt: null,

  events: [],
  unseenEvents: 0,
  liveStatus: 'offline',

  drawerOpen: false,

  loadSession: async ({ force = false } = {}) => {
    if (!force && ['loading', 'ready'].includes(get().sessionStatus)) return get().session;
    set({ sessionStatus: 'loading', sessionError: null });
    try {
      const session = await adminApi.session();
      set({ session, sessionStatus: 'ready' });
      return session;
    } catch (error) {
      set({ sessionStatus: 'error', sessionError: error });
      return null;
    }
  },

  can: (permission) => Boolean(get().session?.permissions?.includes(permission)),

  /**
   * Real status only: the admin endpoint when it answers, otherwise the public health check, otherwise
   * "unreachable". Nothing is assumed online.
   */
  refreshSystem: async () => {
    if (get().systemStatus === 'idle') set({ systemStatus: 'loading' });
    try {
      const system = await adminApi.systemStatus();
      set({ system, systemStatus: 'ready', systemCheckedAt: Date.now() });
    } catch {
      try {
        const { data: health } = await checkApiHealth();
        set({ system: { api: 'online', database: health.database, redis: health.redis, cache: health.redis === 'connected' ? 'redis' : 'memory', realtime: null }, systemStatus: 'ready', systemCheckedAt: Date.now() });
      } catch {
        set({ system: null, systemStatus: 'unreachable', systemCheckedAt: Date.now() });
      }
    }
  },

  pushEvent: (event) =>
    set((state) => ({
      events: [{ ...event, id: `${event.kind}:${event.caseId ?? event.reportId ?? event.service}:${event.at}` }, ...state.events].slice(0, MAX_EVENTS),
      unseenEvents: state.unseenEvents + 1,
    })),
  markEventsSeen: () => set({ unseenEvents: 0 }),
  clearEvents: () => set({ events: [], unseenEvents: 0 }),
  setLiveStatus: (liveStatus) => set({ liveStatus }),

  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),

  /** Signing out or switching accounts: forget everything. */
  reset: () => set({ session: null, sessionStatus: 'idle', sessionError: null, system: null, systemStatus: 'idle', systemCheckedAt: null, events: [], unseenEvents: 0, liveStatus: 'offline', drawerOpen: false }),
}));
