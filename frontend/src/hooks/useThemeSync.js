import { useLayoutEffect, useRef } from 'react';
import { THEME_COLORS } from '@/constants/appThemes';
import { resolveAppearance, useThemeStore } from '@/store/themeStore';

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Mirrors the theme onto <html>: `dark`, `theme-aurora` (Aurora Glass) and `admin-theme` (control center),
 * and follows the OS while the mode is "system". Runs before paint, so opening the control center never
 * shows a frame of the student's theme. A theme the person picks crossfades once (View Transitions);
 * entering or leaving the control center, and reduced motion, switch instantly.
 */
export function useThemeSync() {
  const theme = useThemeStore((state) => state.theme);
  const style = useThemeStore((state) => state.style);
  const adminMode = useThemeStore((state) => state.adminMode);
  const preview = useThemeStore((state) => state.preview);
  const scope = useThemeStore((state) => state.scope);
  const previous = useRef(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const appearance = resolveAppearance({ theme, style, adminMode, preview, scope });

    const apply = (animate) => {
      const isDark = appearance.mode === 'dark' || (appearance.mode === 'system' && media.matches);
      const update = () => {
        root.classList.toggle('dark', isDark);
        root.classList.toggle('theme-aurora', appearance.style === 'aurora');
        root.classList.toggle('admin-theme', appearance.scope === 'admin');
        document
          .querySelector('meta[name="theme-color"]')
          ?.setAttribute('content', THEME_COLORS[appearance.style][isDark ? 'dark' : 'light']);
      };
      if (animate && typeof document.startViewTransition === 'function' && !prefersReducedMotion() && !document.hidden) {
        // A quicker next choice skips this crossfade (its update still runs); that isn't an error.
        document.startViewTransition(update).ready.catch(() => {});
      } else {
        update();
      }
    };

    const last = previous.current;
    previous.current = appearance;
    // Only a new look within the same area animates (not the first paint, not admin ⇄ campus).
    apply(Boolean(last) && last.scope === appearance.scope && (last.style !== appearance.style || last.mode !== appearance.mode));

    if (appearance.mode !== 'system') return undefined;
    const follow = () => apply(true);
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, [theme, style, adminMode, preview, scope]);
}

/** Puts the page in the admin control center's theme while the calling component is mounted. */
export function useAdminThemeScope() {
  useLayoutEffect(() => {
    const { setScope } = useThemeStore.getState();
    setScope('admin');
    return () => setScope('campus');
  }, []);
}
