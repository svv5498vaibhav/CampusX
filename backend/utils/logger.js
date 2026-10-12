import { inspect } from 'node:util';
import env from '../config/env.js';

// Masks credentials embedded in connection strings, e.g. mongodb+srv://user:pass@host → mongodb+srv://***@host
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;
// Bearer tokens and JWTs (three base64url parts starting with "eyJ"), wherever they appear.
const BEARER = /(bearer\s+)[\w.~+/=-]+/gi;
const JWT = /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}\b/g;
// key=value / "key": "value" pairs whose key names a secret (password, secret, token, api key, ...).
const SECRET_PAIR = /((?:pass(?:word)?|secret|token|api[_-]?key|authorization|cookie)\w*["']?\s*[:=]\s*["']?)[^\s"',;&}]+/gi;

const redact = (text) =>
  text.replace(URL_CREDENTIALS, '$1***@').replace(BEARER, '$1[REDACTED]').replace(JWT, '[REDACTED_JWT]').replace(SECRET_PAIR, '$1[REDACTED]');

const format = (value) => {
  if (value instanceof Error) return redact(value.stack || value.message);
  if (typeof value === 'string') return redact(value);
  // Objects are printed the way console would, then redacted like any other text.
  if (value && typeof value === 'object') return redact(inspect(value, { depth: 4, breakLength: Infinity }));
  return value;
};

// Thin wrapper so the app never calls console directly; swap for pino/winston later if needed.
// Nothing written here may contain passwords, tokens or secrets: redact() is the safety net.
const write = (level, args) => {
  const timestamp = new Date().toISOString();
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
  console[method](`[${timestamp}] ${level.toUpperCase()}`, ...args.map(format));
};

const logger = {
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
  debug: (...args) => {
    if (!env.isProduction) write('debug', args);
  },
};

export { redact as redactLogText };
export default logger;
