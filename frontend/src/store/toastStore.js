import { create } from 'zustand';

const DURATION_MS = { success: 3500, error: 6000, info: 4000, loading: null };
let nextId = 1;
const timers = new Map();

/** Short-lived status messages ("Posted to CampusX!"). Rendered by <Toaster /> in App. */
export const useToastStore = create((set, get) => ({
  toasts: [],

  /** Shows a toast, or replaces the one with the same id (e.g. "Posting..." → "Posted!"). */
  show: ({ id = nextId++, type = 'info', message }) => {
    clearTimeout(timers.get(id));
    set((state) => {
      const exists = state.toasts.some((toast) => toast.id === id);
      const toast = { id, type, message };
      return {
        // Newest last; at most 3 on screen.
        toasts: exists ? state.toasts.map((item) => (item.id === id ? toast : item)) : [...state.toasts, toast].slice(-3),
      };
    });
    const duration = DURATION_MS[type];
    if (duration) timers.set(id, setTimeout(() => get().dismiss(id), duration));
    return id;
  },

  dismiss: (id) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
}));

/** toast.success('Saved'), toast.loading('Posting...') → id, then toast.success('Done', { id }). */
export const toast = {
  success: (message, options) => useToastStore.getState().show({ ...options, type: 'success', message }),
  error: (message, options) => useToastStore.getState().show({ ...options, type: 'error', message }),
  info: (message, options) => useToastStore.getState().show({ ...options, type: 'info', message }),
  loading: (message, options) => useToastStore.getState().show({ ...options, type: 'loading', message }),
  dismiss: (id) => useToastStore.getState().dismiss(id),
};
