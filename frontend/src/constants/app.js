export const APP_NAME = 'CampusX';
export const APP_TAGLINE = 'Your digital campus';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

// Live updates (Socket.IO) are served by the same backend, at its origin.
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || new URL(API_BASE_URL, window.location.origin).origin;

// Also read by the inline theme script in index.html; keep both in sync.
export const THEME_STORAGE_KEY = 'campusx-theme';
