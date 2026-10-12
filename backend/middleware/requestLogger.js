import logger from '../utils/logger.js';

// Query parameters whose values must never reach the logs.
const SENSITIVE_PARAM_PATTERN = /pass|token|secret|signature|apikey|api_key|jwt|session/i;
const SENSITIVE_PARAM_NAMES = new Set(['key', 'code', 'sig', 'otp', 'auth', 'authorization']);

const isSensitiveParam = (name) =>
  SENSITIVE_PARAM_PATTERN.test(name) || SENSITIVE_PARAM_NAMES.has(name.toLowerCase());

function redactUrl(url) {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;

  const params = [...new URLSearchParams(url.slice(queryStart + 1))]
    .map(([name, value]) => `${name}=${isSensitiveParam(name) ? '[REDACTED]' : value}`)
    .join('&');

  return `${url.slice(0, queryStart)}?${params}`;
}

const formatDuration = (ms) => (ms < 10 ? `${ms.toFixed(1)}ms` : `${Math.round(ms)}ms`);

/**
 * Logs one line per request once the response is done:
 *   GET /api/v1/health 200 - 12ms
 * Only method, URL (sensitive query values redacted), status and timing are
 * logged; headers, cookies and bodies are not.
 */
export function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on('close', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const status = res.writableFinished ? res.statusCode : `${res.statusCode} (aborted)`;
    const line = `${req.method} ${redactUrl(req.originalUrl)} ${status} - ${formatDuration(durationMs)}`;

    if (res.statusCode >= 500) logger.error(line);
    else if (res.statusCode >= 400) logger.warn(line);
    else logger.info(line);
  });

  next();
}
