/** "CSE Students" → "cse-students" (letters and digits only, at most 60 characters). */
export const slugify = (text, fallback = 'item') =>
  String(text)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || fallback;
