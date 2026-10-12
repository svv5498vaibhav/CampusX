import { useEffect } from 'react';
import { useThemeStore } from '@/store/themeStore';

const THEME_COLORS = { light: '#f4f7f4', dark: '#0b0e0c' };

/** Mirrors the selected theme onto <html> and follows the OS while set to "system". */
export function useThemeSync() {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', isDark);
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', isDark ? THEME_COLORS.dark : THEME_COLORS.light);
    };

    apply();

    if (theme !== 'system') return undefined;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}
