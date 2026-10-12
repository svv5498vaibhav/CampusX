/**
 * Only plain http(s) links are ever opened (the server also refuses anything else): never javascript:,
 * data: or vbscript: links, and never links carrying a username or password. Returns the normalised
 * link, or null when it must not be used.
 */
export function safeExternalUrl(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
