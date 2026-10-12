// Test stack: a throwaway mongod (reused when one is already listening on the test port) and a CampusX
// backend per suite, each suite on its own fresh database. Never touches ports 5000/5173 or real data.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { API_PORT, BACKEND, DB_PORT, LOGS_DIR, RESULTS_DIR, TEST_DB_PREFIX, TESTS_DIR, findMongod } from './paths.mjs';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const JWT_SECRET = 'campusx-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
export const HOOK = pathToFileURL(path.join(TESTS_DIR, 'lib', 'env-hook.mjs')).href;

async function waitFor(check, { timeout = 30000, every = 300, label = 'service' } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await check()) return;
    } catch {
      /* not yet */
    }
    await sleep(every);
  }
  throw new Error(`${label} did not start within ${timeout} ms`);
}

export const portOpen = (port, host = '127.0.0.1') =>
  new Promise((resolve) => {
    const socket = net.connect(port, host);
    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });

/** Starts mongod on the test port unless one is already there (then it is reused and left running). */
export async function ensureDatabase() {
  if (await portOpen(DB_PORT)) return { started: false, stop: async () => {} };
  const dbPath = path.join(RESULTS_DIR, 'db', `db-${Date.now()}`);
  fs.mkdirSync(dbPath, { recursive: true });
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const log = fs.openSync(path.join(LOGS_DIR, 'mongod.log'), 'w');
  const mongod = spawn(findMongod(), ['--dbpath', dbPath, '--port', String(DB_PORT), '--bind_ip', '127.0.0.1'], { stdio: ['ignore', log, log], windowsHide: true });
  await waitFor(() => portOpen(DB_PORT), { label: 'mongod' });
  return {
    started: true,
    async stop() {
      mongod.kill();
      await sleep(800);
      try {
        fs.rmSync(dbPath, { recursive: true, force: true });
      } catch {
        /* Windows may hold files briefly */
      }
    },
  };
}

/** Environment every test backend gets unless a suite overrides it. */
export const baseEnv = (dbName, port) => ({
  PORT: String(port),
  NODE_ENV: 'development',
  MONGODB_URI: `${TEST_DB_PREFIX}${dbName}`,
  CLIENT_URL: 'http://localhost:5174,http://127.0.0.1:5174,http://localhost:4174',
  JWT_SECRET,
  JWT_EXPIRES_IN: '15m',
  REFRESH_TOKEN_EXPIRES_IN: '7d',
  MAX_LOGIN_ATTEMPTS: '5',
  LOGIN_LOCK_MINUTES: '15',
  COOKIE_SAME_SITE: 'lax',
  RATE_LIMIT_MAX: '100000',
  // Requests carry X-Forwarded-For so each test client can act from its own address.
  TRUST_PROXY: '1',
  GAMIFICATION_TIMEZONE: 'Asia/Kolkata',
});

/** Starts a backend process (server.js through the env hook). Resolves once /health answers. */
export async function startBackend({ name, dbName, port = API_PORT, env = {}, waitForHealth = true, timeout = 45000 }) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const logFile = path.join(LOGS_DIR, `api-${name}.log`);
  const out = fs.openSync(logFile, 'w');
  const testEnv = { ...baseEnv(dbName, port), ...env };
  const child = spawn(process.execPath, ['--import', HOOK, 'server.js'], {
    cwd: BACKEND,
    env: { ...process.env, CAMPUSX_TEST_ENV: JSON.stringify(testEnv) },
    stdio: ['ignore', out, out],
    windowsHide: true,
  });
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  const base = `http://127.0.0.1:${port}/api/v1`;
  if (waitForHealth) {
    await Promise.race([
      waitFor(async () => (await fetch(`${base}/health`)).ok, { label: `backend (${name})`, timeout }),
      exited.then((code) => {
        throw new Error(`backend (${name}) exited with ${code}: ${fs.readFileSync(logFile, 'utf8').slice(-600)}`);
      }),
    ]);
  }
  return {
    base,
    port,
    env: testEnv,
    mongoUri: testEnv.MONGODB_URI,
    logFile,
    child,
    exited,
    log: () => fs.readFileSync(logFile, 'utf8'),
    async stop() {
      if (child.exitCode === null) {
        child.kill();
        await Promise.race([exited, sleep(3000)]);
      }
    },
  };
}

/**
 * One suite's stack: the shared test mongod (started if needed) + a fresh backend on a database named
 * after the suite and the time, so suites never see each other's data.
 */
export async function startStack(name, { env = {}, port } = {}) {
  const database = await ensureDatabase();
  const dbName = `campusx_test_${name.replace(/\W+/g, '_')}_${Date.now()}`;
  let backend;
  try {
    backend = await startBackend({ name, dbName, env, port });
  } catch (error) {
    await database.stop();
    throw error;
  }
  return {
    ...backend,
    dbName,
    async stop() {
      await backend.stop();
      await database.stop();
    },
  };
}
