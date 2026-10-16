/**
 * Editing helpers for resume content: new blank items, moving items, keeping only the fields the server
 * stores, and merging an "Import My CampusX Profile" draft into a resume without duplicating anything
 * already imported.
 */

export const newId = () => Math.random().toString(36).slice(2, 12);

export const BLANK = {
  education: () => ({ id: newId(), institution: '', degree: '', field: '', location: '', startDate: '', endDate: '', score: '', coursework: [], details: [] }),
  skills: () => ({ id: newId(), label: '', items: [] }),
  projects: () => ({ id: newId(), name: '', role: '', tech: [], startDate: '', endDate: '', github: '', live: '', summary: '', bullets: [], source: '' }),
  experience: () => ({ id: newId(), role: '', organization: '', location: '', startDate: '', endDate: '', bullets: [], source: '' }),
  achievements: () => ({ id: newId(), title: '', organization: '', date: '', description: '', source: '' }),
  certifications: () => ({ id: newId(), name: '', issuer: '', date: '', url: '', source: '' }),
  volunteering: () => ({ id: newId(), role: '', organization: '', startDate: '', endDate: '', bullets: [] }),
  customItem: () => ({ id: newId(), title: '', subtitle: '', date: '', bullets: [] }),
  custom: (title = '') => ({ id: newId(), title, items: [] }),
};

/** An item reduced to the fields the server stores for its list (drops extras such as an import's `kind`). */
export function pick(list, item) {
  const template = BLANK[list]();
  return Object.fromEntries(Object.keys(template).map((key) => [key, item[key] ?? template[key]]));
}

/** Moves the item at `from` to `to` (both indexes), returning a new array. */
export function move(items, from, to) {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const IMPORTED_LISTS = ['projects', 'experience', 'achievements', 'certifications'];

/**
 * Adds the chosen parts of an import draft to `content`. `choice`:
 *   { personal: bool, summary: bool, education: bool, skills: bool, coursework: bool,
 *     projects: [ids], experience: [ids], achievements: [ids], certifications: [ids] }
 * Personal details only fill empty fields; items already imported (same CampusX source) are skipped;
 * list sizes stay within `limits`.
 */
export function mergeImport(content, draft, choice, limits) {
  const next = structuredClone(content);
  if (choice.personal) {
    for (const key of ['fullName', 'email']) if (!next.personal[key]?.trim() && draft.personal[key]) next.personal[key] = draft.personal[key];
  }
  if (choice.summary && draft.summary && !next.summary?.trim()) next.summary = draft.summary;
  if (choice.education && draft.education.length) {
    const known = new Set(next.education.map((item) => item.institution.trim().toLowerCase()));
    for (const item of draft.education) {
      if (known.has(item.institution.trim().toLowerCase())) continue;
      if (next.education.length >= limits.education.max) break;
      next.education.push(pick('education', { ...item, id: newId() }));
    }
  }
  if (choice.skills && draft.skills.length) {
    for (const group of draft.skills) {
      const existing = next.skills.find((item) => item.label.trim().toLowerCase() === group.label.toLowerCase());
      const have = new Set(next.skills.flatMap((item) => item.items.map((skill) => skill.toLowerCase())));
      const fresh = group.items.filter((skill) => !have.has(skill.toLowerCase()));
      if (!fresh.length) continue;
      if (existing) existing.items = [...existing.items, ...fresh].slice(0, limits.skills.items);
      else if (next.skills.length < limits.skills.groups) next.skills.push({ id: newId(), label: group.label, items: fresh.slice(0, limits.skills.items) });
    }
  }
  if (choice.coursework && draft.coursework.length) {
    const have = new Set(next.coursework.map((item) => item.toLowerCase()));
    next.coursework = [...next.coursework, ...draft.coursework.filter((item) => !have.has(item.toLowerCase()))].slice(0, limits.coursework.max);
  }
  for (const list of IMPORTED_LISTS) {
    const ids = new Set(choice[list] ?? []);
    const sources = new Set(next[list].map((item) => item.source).filter(Boolean));
    for (const item of draft[list]) {
      if (!ids.has(item.id) || sources.has(item.source)) continue;
      if (next[list].length >= limits[list].max) break;
      next[list].push(pick(list, { ...item, id: newId() }));
    }
  }
  return next;
}

/** How many entries a section holds (for the stepper and the profile card). */
export const filledCount = {
  personal: (c) => [c.personal.fullName, c.personal.email, c.personal.phone].filter((value) => value?.trim()).length,
  education: (c) => c.education.filter((item) => item.institution.trim() || item.degree.trim()).length,
  skills: (c) => c.skills.reduce((sum, group) => sum + group.items.length, 0),
  projects: (c) => c.projects.filter((item) => item.name.trim()).length,
  experience: (c) => c.experience.length + c.achievements.length + c.certifications.length + c.volunteering.length,
  summary: (c) => (c.summary?.trim() ? 1 : 0),
};
