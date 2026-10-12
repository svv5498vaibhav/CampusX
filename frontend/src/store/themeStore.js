import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { THEME_STORAGE_KEY } from '@/constants/app';

export const THEMES = ['light', 'dark', 'system'];

export const getNextTheme = (theme) => THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];

export const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      cycleTheme: () => set({ theme: getNextTheme(get().theme) }),
    }),
    {
      name: THEME_STORAGE_KEY,
      partialize: ({ theme }) => ({ theme }),
    },
  ),
);
