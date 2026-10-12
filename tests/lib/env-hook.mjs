// Preloaded with `node --import` before a test backend starts. Every variable named in backend/.env or
// backend/.env.example is set explicitly from CAMPUSX_TEST_ENV (empty when not given): dotenv never
// overrides existing variables, so the developer's real MongoDB Atlas URI, Cloudinary and Redis settings
// can't leak into a test process. A test backend only ever talks to the local test MongoDB.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'backend');
const keysOf = (file) => {
  try {
    return fs
      .readFileSync(path.join(backend, file), 'utf8')
      .split(/\r?\n/)
      .map((line) => /^\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line)?.[1])
      .filter(Boolean);
  } catch {
    return [];
  }
};

const testEnv = JSON.parse(process.env.CAMPUSX_TEST_ENV || '{}');
const keys = new Set([...keysOf('.env'), ...keysOf('.env.example'), 'CLOUDINARY_URL', ...Object.keys(testEnv)]);
for (const key of keys) process.env[key] = testEnv[key] ?? '';

const dbPort = Number(process.env.CAMPUSX_TEST_DB_PORT || 27019);
if (!process.env.MONGODB_URI.startsWith(`mongodb://127.0.0.1:${dbPort}/`)) {
  console.error(`env-hook: refusing to start without the local test database on 127.0.0.1:${dbPort}`);
  process.exit(1);
}
