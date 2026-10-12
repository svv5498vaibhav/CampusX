import { create } from 'zustand';
import { SESSION_HINT_KEY } from '@/constants/auth';
import { refreshSession, setAccessToken, setSessionExpiredHandler } from '@/services/api';
import { authApi } from '@/services/authApi';

const hint = {
  has: () => {
    try {
      return localStorage.getItem(SESSION_HINT_KEY) === '1';
    } catch {
      return true; // Storage blocked: just try the refresh.
    }
  },
  set: () => {
    try {
      localStorage.setItem(SESSION_HINT_KEY, '1');
    } catch {
      /* ignore */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(SESSION_HINT_KEY);
    } catch {
      /* ignore */
    }
  },
};

/**
 * The single source of auth state in the UI.
 *   status: 'idle' → 'loading' → 'authenticated' | 'unauthenticated'
 * Tokens are not stored here: the access token sits in services/api.js memory and the
 * refresh token in an HttpOnly cookie.
 */
export const useAuthStore = create((set, get) => {
  const signIn = ({ user, accessToken }) => {
    setAccessToken(accessToken);
    hint.set();
    set({ user, status: 'authenticated', isAuthenticated: true });
    return user;
  };

  const signOutLocally = () => {
    setAccessToken(null);
    hint.clear();
    set({ user: null, status: 'unauthenticated', isAuthenticated: false });
  };

  return {
    user: null,
    status: 'idle',
    isAuthenticated: false,

    /** Restores the session on page load using the refresh cookie. Safe to call more than once. */
    initialize: async () => {
      if (get().status !== 'idle') return;
      if (!hint.has()) {
        set({ status: 'unauthenticated' });
        return;
      }

      set({ status: 'loading' });
      try {
        signIn(await refreshSession());
      } catch {
        signOutLocally();
      }
    },

    register: async (details) => signIn(await authApi.register(details)),

    login: async (credentials) => signIn(await authApi.login(credentials)),

    logout: async () => {
      try {
        await authApi.logout();
      } catch {
        // Even if the request fails, this browser forgets the session.
      } finally {
        signOutLocally();
      }
    },

    /** Replaces the signed-in user after a server-side change (e.g. onboarding saved). */
    updateUser: (user) => set({ user }),

    fetchCurrentUser: async () => {
      const { user } = await authApi.getCurrentUser();
      set({ user });
      return user;
    },

    /** Used when the API reports the session is gone (expired, revoked, signed out elsewhere). */
    clearSession: signOutLocally,
  };
});

setSessionExpiredHandler(() => useAuthStore.getState().clearSession());

// Signing out in one tab signs out every other open tab.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === SESSION_HINT_KEY && event.newValue === null && useAuthStore.getState().isAuthenticated) {
      useAuthStore.getState().clearSession();
    }
  });
}
