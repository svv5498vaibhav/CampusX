import fs from 'node:fs/promises';
import { PDF_ACTIVE_CONTENT, UPLOAD_NAME_RULES } from '../config/securityConfig.js';

/*
 * File-name and PDF checks for uploads (Phase 16). Content type is decided by the file's first bytes
 * (utils/mediaSignature.js); these add what the bytes can't tell: names that try to pass as something
 * else, and PDFs that carry scripts. Uploaded files are never executed or served by CampusX itself.
 */

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const DISGUISED = new Set(UPLOAD_NAME_RULES.disguisedExtensions);

/** Every extension accepted for these MIME types, e.g. image types → jpg, jpeg, jpe, jfif, png, webp. */
export const extensionsFor = (mimeTypes) => new Set(mimeTypes.flatMap((type) => UPLOAD_NAME_RULES.extensionsByType[type] ?? []));

/** The extension CampusX gives the temporary copy of a file of this (already allowed) MIME type. */
export const canonicalExtension = (mimeType) => UPLOAD_NAME_RULES.extensionsByType[mimeType]?.[0] ?? 'bin';

/**
 * Why an uploaded file's name is refused, or null when it is fine. The final extension must be one of
 * `allowedExtensions` (any of them: a PNG saved as "photo.jpg" is still an image, and its real type is
 * checked separately); a name without an extension is accepted. Refused: control characters, path
 * separators, overly long names and programs disguised with a second extension ("photo.php.jpg").
 */
export function uploadNameProblem(originalName, allowedExtensions) {
  const name = typeof originalName === 'string' ? originalName.trim() : '';
  if (!name) return null;
  if (name.length > UPLOAD_NAME_RULES.maxLength) return 'name_too_long';
  if (CONTROL_CHARACTERS.test(name)) return 'control_characters';
  if (/[\\/]/.test(name) || name === '.' || name === '..') return 'path_in_name';
  const parts = name.toLowerCase().split('.');
  if (parts.length === 1) return null;
  const extensions = parts.slice(1).map((part) => part.trim());
  if (!allowedExtensions.has(extensions.at(-1))) return 'extension_not_allowed';
  return extensions.some((extension) => DISGUISED.has(extension)) ? 'disguised_extension' : null;
}

/**
 * True when a PDF carries active content: JavaScript, launch actions, embedded files or rich media.
 * PDF names may hide letters as #xx escapes ("/J#61vaScript"), so those are decoded first. Content inside
 * compressed object streams can't be seen this way; such files are still served only from Cloudinary,
 * never from CampusX's own origin.
 */
export async function pdfHasActiveContent(filePath) {
  const text = (await fs.readFile(filePath)).toString('latin1').replace(/#([0-9a-f]{2})/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
  return PDF_ACTIVE_CONTENT.some((marker) => text.includes(marker));
}
