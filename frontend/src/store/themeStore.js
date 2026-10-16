import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { THEME_STORAGE_KEY } from '@/constants/app';
import { ADMIN_MODES, DEFAULT_ADMIN_MODE, DEFAULT_APPEARANCE, STYLE_IDS } from '@/constants/appThemes';

/*
 * The app's look (constants/appThemes.js). Saved in this browser, separately for the student app and
 * the admin control center:
 *   theme      light · dark · system (the mode; "system" follows the device)
 *   style      campus · aurora
 *   adminMode  light · dark for the control center, which is always Aurora Glass
 * `preview` (Theme Studio's unsaved choice) and `scope` (campus or admin, set by AdminLayout) are not
 * saved. hooks/useThemeSync.js turns all of it into classes on <html>.
 */
export const THEMES = ['light', 'dark', 'system'];

export const getNextTheme = (theme) => THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

export const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: DEFAULT_APPEARANCE.theme,
      style: DEFAULT_APPEARANCE.style,
      adminMode: DEFAULT_ADMIN_MODE,
      preview: null,
      scope: 'campus',
      setTheme: (theme) => set({ theme }),
      cycleTheme: () => set({ theme: getNextTheme(get().theme) }),
      setAdminMode: (adminMode) => set({ adminMode: pick(adminMode, ADMIN_MODES, DEFAULT_ADMIN_MODE) }),
      /** Saves a Theme Studio choice ({ style, theme, adminMode? }) and ends its preview. */
      applyAppearance: ({ style, theme, adminMode }) =>
        set((state) => ({
          style: pick(style, STYLE_IDS, state.style),
          theme: pick(theme, THEMES, state.theme),
          adminMode: pick(adminMode, ADMIN_MODES, state.adminMode),
          preview: null,
        })),
      /** Shows { style, theme } across the app without saving it; null shows the saved theme again. */
      setPreview: (preview) => set({ preview }),
      setScope: (scope) => set({ scope }),
    }),
    {
      name: THEME_STORAGE_KEY,
      partialize: ({ theme, style, adminMode }) => ({ theme, style, adminMode }),
      // Older saves hold only { theme }; anything unknown falls back to the defaults.
      merge: (persisted, current) => ({
        ...current,
        theme: pick(persisted?.theme, THEMES, current.theme),
        style: pick(persisted?.style, STYLE_IDS, current.style),
        adminMode: pick(persisted?.adminMode, ADMIN_MODES, current.adminMode),
      }),
    },
  ),
);

/** What is on screen right now: the admin look inside the control center, else the preview or the saved theme. */
export function resolveAppearance({ theme, style, adminMode, preview, scope }) {
  if (scope === 'admin') return { style: 'aurora', mode: adminMode, scope };
  const shown = preview ?? { style, theme };
  return { style: shown.style, mode: shown.theme, scope };
}
