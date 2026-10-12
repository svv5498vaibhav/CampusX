import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * List filters kept in the URL (so a refresh or a shared link keeps them). `defaults` gives each
 * filter's default value; defaults are left out of the URL. Updates merge into the URL as it is when
 * they run, so a delayed search can't undo a filter chosen meanwhile.
 *   const [{ category, search }, update] = useUrlFilters({ category: 'all', search: '' });
 */
export function useUrlFilters(defaults) {
  const [searchParams, setSearchParams] = useSearchParams();
  const values = Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, searchParams.get(key) ?? fallback]));

  const update = useCallback(
    (changes) => {
      // The live URL, not a render's copy: a delayed call (e.g. debounced search) may come from an
      // older render, and React Router's functional updater would hand it that render's params.
      const next = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(changes)) {
        const text = String(value ?? '');
        if (text === '' || text === String(defaults[key] ?? '')) next.delete(key);
        else next.set(key, text);
      }
      setSearchParams(next, { replace: true });
    },
    // `defaults` is a literal in each page; its values never change.
    [setSearchParams],
  );

  return [values, update];
}
