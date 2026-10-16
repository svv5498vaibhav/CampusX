/*
 * The app's built-in looks, shown in Theme Studio. A theme is a style (the palette and surfaces) plus a
 * mode (light, dark, or following the device). Tokens live in styles/index.css; `id` is also the
 * `data-theme-preview` value that renders the theme inside a preview card. Profile styles (the five
 * looks of a student's profile page, constants/profileThemes.js) are separate and sit on top of these.
 *
 * Theme choices are device settings (saved in this browser), like the light/dark toggle always was.
 */
export const APP_STYLES = Object.freeze({
  campus: { id: 'campus', name: 'Campus' },
  aurora: { id: 'aurora', name: 'Aurora Glass' },
});

export const APP_THEMES = Object.freeze([
  {
    id: 'campus-light',
    style: 'campus',
    mode: 'light',
    name: 'Campus Light',
    description: 'The classic green CampusX look on soft paper white.',
  },
  {
    id: 'campus-dark',
    style: 'campus',
    mode: 'dark',
    name: 'Campus Dark',
    description: 'Deep charcoal with a gentle green glow.',
  },
  {
    id: 'aurora-light',
    style: 'aurora',
    mode: 'light',
    name: 'Aurora Glass Light',
    description: 'Frosted white glass over pale lavender, sky and mint light.',
  },
  {
    id: 'aurora-dark',
    style: 'aurora',
    mode: 'dark',
    name: 'Aurora Glass Dark',
    description: 'Deep navy glass lit by violet and electric-blue aurora.',
  },
]);

/** The admin control center is always Aurora Glass; staff choose its light or dark variant. */
export const ADMIN_THEMES = Object.freeze([
  {
    id: 'admin-dark',
    mode: 'dark',
    name: 'Aurora Glass Dark',
    description: 'Default. Navy glass for long moderation sessions.',
  },
  {
    id: 'admin-light',
    mode: 'light',
    name: 'Aurora Glass Light',
    description: 'Bright frosted glass for well-lit rooms.',
  },
]);

export const DEFAULT_APPEARANCE = Object.freeze({ style: 'campus', theme: 'system' });
export const DEFAULT_ADMIN_MODE = 'dark';

export const STYLE_IDS = Object.freeze(Object.keys(APP_STYLES));
export const ADMIN_MODES = Object.freeze(ADMIN_THEMES.map((theme) => theme.mode));

/** Browser chrome colour (meta theme-color) per resolved style and mode. */
export const THEME_COLORS = Object.freeze({
  campus: { light: '#f4f7f4', dark: '#0b0e0c' },
  aurora: { light: '#f4f3fb', dark: '#070a1c' },
});

export const themeId = (style, mode) => `${style}-${mode}`;
