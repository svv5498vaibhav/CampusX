/**
 * Profile styles a student can pick. Only these ids are ever stored (`user.profileTheme`);
 * how each style looks lives in the frontend (src/constants/profileThemes.js). Users can
 * never supply CSS of their own.
 */
export const PROFILE_THEMES = Object.freeze([
  { id: 'campus-green', name: 'Campus Green', description: 'Fresh green, the classic CampusX look.' },
  { id: 'minimal-white', name: 'Minimal White', description: 'Clean and quiet, so your work speaks.' },
  { id: 'creative-student', name: 'Creative Student', description: 'Warm, playful colours for makers.' },
  { id: 'dark-campus', name: 'Dark Campus', description: 'Deep charcoal with a green glow.' },
  { id: 'achievement-focus', name: 'Achievement Focus', description: 'Gold accents; wins and projects first.' },
]);

export const DEFAULT_PROFILE_THEME = 'campus-green';

export const PROFILE_THEME_IDS = Object.freeze(PROFILE_THEMES.map((theme) => theme.id));

export const PROFILE_RULES = Object.freeze({
  bio: { maxLength: 500 },
});
