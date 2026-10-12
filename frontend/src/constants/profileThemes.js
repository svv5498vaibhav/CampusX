/*
 * How each profile style looks. The API stores and validates only the id; names and
 * descriptions come from GET /profile/options. Every class here is a fixed design token, and
 * students can never supply styles of their own. Each style works in light and dark mode.
 *
 *   cover       header background when there is no cover photo (and behind it while loading)
 *   pattern     decorative texture on that background
 *   ring        avatar ring colour
 *   accent      accent text (icons, links)
 *   chip        skill/interest chips
 *   card        section cards
 *   icon        section icon tile
 *   mainOrder   order of the main sections (Achievement Focus puts wins first)
 */
export const DEFAULT_THEME_ID = 'campus-green';

export const PROFILE_THEME_STYLES = {
  'campus-green': {
    cover: 'bg-primary text-primary-fg',
    pattern: { backgroundImage: 'radial-gradient(color-mix(in srgb, currentColor 22%, transparent) 1.5px, transparent 1.5px)', backgroundSize: '20px 20px' },
    ring: 'bg-primary',
    accent: 'text-primary',
    chip: 'bg-primary-soft text-primary-soft-fg',
    card: 'border-line bg-surface shadow-soft',
    icon: 'bg-primary-soft text-primary-soft-fg',
    mainOrder: ['about', 'projects', 'achievements'],
  },
  'minimal-white': {
    cover: 'bg-surface-muted text-ink-subtle',
    pattern: { backgroundImage: 'linear-gradient(color-mix(in srgb, currentColor 10%, transparent) 1px, transparent 1px)', backgroundSize: '100% 28px' },
    ring: 'bg-line-strong',
    accent: 'text-ink',
    chip: 'border border-line-strong bg-surface text-ink-muted',
    card: 'border-line bg-surface',
    icon: 'bg-surface-muted text-ink',
    mainOrder: ['about', 'projects', 'achievements'],
  },
  'creative-student': {
    cover: 'bg-sun-400 text-sun-900 dark:bg-sun-500',
    pattern: {
      backgroundImage: [
        'radial-gradient(circle at 12% 30%, rgb(255 255 255 / 0.45) 0 26px, transparent 27px)',
        'radial-gradient(circle at 78% 70%, rgb(22 130 79 / 0.45) 0 46px, transparent 47px)',
        'radial-gradient(circle at 56% 18%, rgb(255 255 255 / 0.3) 0 14px, transparent 15px)',
        'radial-gradient(circle at 92% 22%, rgb(21 32 26 / 0.18) 0 10px, transparent 11px)',
        'radial-gradient(circle at 34% 82%, rgb(21 32 26 / 0.14) 0 18px, transparent 19px)',
      ].join(', '),
    },
    ring: 'bg-sun-400',
    accent: 'text-accent-fg',
    chip: 'bg-accent-soft text-accent-fg',
    card: 'border-dashed border-sun-300 bg-surface shadow-soft dark:border-sun-700',
    icon: 'bg-accent-soft text-accent-fg',
    mainOrder: ['about', 'projects', 'achievements'],
  },
  'dark-campus': {
    cover: 'bg-[#0b0e0c] text-leaf-400',
    pattern: {
      backgroundImage: [
        'radial-gradient(ellipse at 30% 120%, rgb(71 188 127 / 0.35), transparent 60%)',
        'linear-gradient(rgb(71 188 127 / 0.12) 1px, transparent 1px)',
        'linear-gradient(90deg, rgb(71 188 127 / 0.12) 1px, transparent 1px)',
      ].join(', '),
      backgroundSize: '100% 100%, 28px 28px, 28px 28px',
    },
    ring: 'bg-leaf-400',
    accent: 'text-primary',
    chip: 'bg-leaf-950 text-leaf-200 dark:bg-primary-soft dark:text-primary-soft-fg',
    card: 'border-line bg-surface shadow-glow',
    icon: 'bg-leaf-950 text-leaf-300',
    mainOrder: ['about', 'projects', 'achievements'],
  },
  'achievement-focus': {
    cover: 'bg-sun-100 text-sun-500 dark:bg-sun-900 dark:text-sun-400',
    pattern: { backgroundImage: 'repeating-linear-gradient(135deg, color-mix(in srgb, currentColor 22%, transparent) 0 12px, transparent 12px 26px)' },
    ring: 'bg-sun-400',
    accent: 'text-accent-fg',
    chip: 'bg-accent-soft text-accent-fg',
    card: 'border-sun-300 bg-surface shadow-soft dark:border-sun-700',
    icon: 'bg-accent-soft text-accent-fg',
    mainOrder: ['achievements', 'projects', 'about'],
  },
};

/** Unknown ids (e.g. a style added on the server later) fall back to the default look. */
export const themeStyles = (themeId) => PROFILE_THEME_STYLES[themeId] ?? PROFILE_THEME_STYLES[DEFAULT_THEME_ID];
