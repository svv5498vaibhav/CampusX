// Shared test harness: checks with a final summary, an API client, account helpers, sockets, DB access.
// A suite is a plain script:  const t = await createSuite('posts'); ... await t.finish();
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { startFakeCloudinary } from './fake-cloudinary.mjs';
import { FAKE_CLOUDINARY_PORT, FRONTEND, RESULTS_DIR, backendModule } from './paths.mjs';
import { JWT_SECRET, sleep, startStack } from './stack.mjs';

const frontendRequire = createRequire(path.join(FRONTEND, 'package.json'));
const backendRequire = createRequire(path.join(FRONTEND, '..', 'backend', 'package.json'));
export const { io: ioClient } = frontendRequire('socket.io-client');
export const jwt = backendRequire('jsonwebtoken');
export const mongoose = (await backendModule('mongoose')).default;
export { sleep, JWT_SECRET };

export const ORIGIN = 'http://localhost:5174';
export const PASSWORD = 'Campus@Test#2026';
export const JWT_OPTIONS = { algorithm: 'HS256', issuer: 'campusx-api', audience: 'campusx-app' };

const show = (detail) => (detail === undefined ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail)?.slice(0, 600));

/**
 * Starts the suite's stack and returns the toolkit. `env` overrides backend variables; `stack: false`
 * gives checks only (unit suites).
 */
export async function createSuite(name, { env = {}, stack = true, cloudinary = false } = {}) {
  const startedAt = Date.now();
  // The Cloudinary stand-in (tests/lib/fake-cloudinary.mjs) for suites that test successful uploads.
  const fakeCloudinary = cloudinary ? await startFakeCloudinary(FAKE_CLOUDINARY_PORT) : null;
  if (fakeCloudinary) env = { ...fakeCloudinary.env, ...env };
  let passed = 0;
  const failures = [];
  const sections = [];
  let current = null;

  const t = {
    name,
    passed: () => passed,
    failures,
    section(title) {
      current = { title, passed: 0, failed: 0 };
      sections.push(current);
      console.log(`\n▸ ${title}`);
    },
    check(label, condition, detail) {
      if (!current) t.section('Checks');
      if (condition) {
        passed += 1;
        current.passed += 1;
      } else {
        current.failed += 1;
        failures.push(`[${current.title}] ${label}${detail === undefined ? '' : ` :: ${show(detail)}`}`);
        console.log(`  ✖ ${label}`, show(detail));
      }
      return Boolean(condition);
    },
    /** Records a crash as a failure instead of losing the rest of the report. */
    async step(label, work) {
      try {
        return await work();
      } catch (error) {
        t.check(`${label} (threw)`, false, error?.stack ?? String(error));
        return undefined;
      }
    },
  };

  t.cloudinary = fakeCloudinary;
  if (stack) {
    const s = await startStack(name, { env });
    t.stack = s;
    t.base = s.base;
    t.conn = await mongoose.createConnection(s.mongoUri).asPromise();
    t.db = t.conn.db;
    Object.assign(t, clientFor(s.base));
  }

  t.finish = async () => {
    if (t.conn) await t.conn.close();
    if (t.stack) await t.stack.stop();
    if (fakeCloudinary) await fakeCloudinary.stop();
    for (const extra of t.cleanups ?? []) await extra();
    const result = { suite: name, passed, failed: failures.length, failures, sections, ms: Date.now() - startedAt };
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(RESULTS_DIR, `${name}.json`), JSON.stringify(result, null, 2));
    console.log(`\n${name}: ${passed} passed, ${failures.length} failed (${Math.round((Date.now() - startedAt) / 1000)} s)`);
    for (const failure of failures) console.log(` - ${failure}`);
    console.log(`RESULT ${JSON.stringify({ suite: name, passed, failed: failures.length })}`);
    process.exitCode = failures.length ? 1 : 0;
    return result;
  };
  t.cleanups = [];
  return t;
}

export const oid = (id) => new mongoose.Types.ObjectId(String(id));

let ipCounter = 1;
/** A new client address (sent as X-Forwarded-For; test backends trust one proxy). */
export const freshIp = () => `10.${17 + Math.floor(ipCounter / 62500)}.${Math.floor(ipCounter / 250) % 250}.${(ipCounter++ % 250) + 1}`;

/** The API client and account helpers bound to one backend. */
export function clientFor(base) {
  async function api(method, urlPath, { token, body, headers = {}, ip = '10.0.0.1', raw, cookie, origin = ORIGIN } = {}) {
    const response = await fetch(`${base}${urlPath}`, {
      method,
      headers: {
        ...(body !== undefined && raw === undefined && { 'content-type': 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
        ...(cookie && { cookie }),
        ...(origin && { origin }),
        'x-forwarded-for': ip,
        ...headers,
      },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: response.status, body: json, text, headers: response.headers, data: json?.data, ms: 0 };
  }

  /** Registers (from a fresh address) and, unless `onboard: false`, completes onboarding. */
  async function register(firstName, lastName, { email, college = 'vnit-nagpur', branch = 'cse', semester = 5, roll, interests = ['web-development', 'ai-ml', 'data-science'], skills = ['React'], onboard = true } = {}) {
    const address = email ?? `${firstName}.${lastName}.${Math.floor(Math.random() * 1e6)}@qa.campusx.dev`.toLowerCase();
    const reg = await api('POST', '/auth/register', { ip: freshIp(), body: { firstName, lastName, email: address, password: PASSWORD, confirmPassword: PASSWORD } });
    if (reg.status !== 201) throw new Error(`register ${address}: ${reg.status} ${reg.text}`);
    const account = { token: reg.data.accessToken, id: reg.data.user.id, email: address, firstName, lastName, college, branch, semester, roll: roll ?? `R${Math.floor(Math.random() * 1e9)}`, cookie: reg.headers.get('set-cookie')?.split(';')[0], registrationText: reg.text };
    if (onboard) {
      const res = await api('PUT', '/onboarding', { token: account.token, body: { college, branch, semester, rollNumber: account.roll, interests, skills } });
      if (res.status !== 200) throw new Error(`onboard ${address}: ${res.status} ${res.text}`);
    }
    return account;
  }

  const login = (email, password = PASSWORD, ip = freshIp()) => api('POST', '/auth/login', { ip, body: { email, password } });

  /** Signs in again (fresh token after a role change, for example). */
  async function relogin(account) {
    const res = await login(account.email);
    if (res.status !== 200) throw new Error(`login ${account.email}: ${res.status} ${res.text}`);
    account.token = res.data.accessToken;
    account.cookie = res.headers.get('set-cookie')?.split(';')[0];
    return account;
  }

  async function upload(urlPath, token, field, files, { ip, fields = {}, method = 'POST' } = {}) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    for (const { bytes, type, name } of files) form.append(field, new Blob([bytes], { type }), name);
    return api(method, urlPath, { token, raw: form, ip });
  }

  function connectSocket(token, { auth = {}, ip } = {}) {
    const port = new URL(base).port;
    return new Promise((resolve) => {
      const socket = ioClient(`http://127.0.0.1:${port}`, { auth: { token, ...auth }, transports: ['websocket'], reconnection: false, ...(ip && { extraHeaders: { 'x-forwarded-for': ip } }) });
      const timer = setTimeout(() => resolve({ socket, error: 'timeout' }), 5000);
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve({ socket, error: null });
      });
      socket.on('connect_error', (error) => {
        clearTimeout(timer);
        resolve({ socket, error: error.message });
      });
    });
  }

  /** Times a request (ms) for performance measurements. */
  async function timed(method, urlPath, options) {
    const started = performance.now();
    const res = await api(method, urlPath, options);
    res.ms = performance.now() - started;
    return res;
  }

  /** Setup steps that must succeed: returns the response, or throws with the API's own message. */
  async function must(responsePromise, label = 'request') {
    const res = await responsePromise;
    if (res.status >= 300) throw new Error(`${label} failed: ${res.status} ${res.text.slice(0, 400)}`);
    return res;
  }

  return { api, register, login, relogin, upload, connectSocket, timed, must };
}

/** Signs an access token like the API does (tests forge and expire tokens with it). */
export const signToken = (payload, { subject, expiresIn = 600, secret = JWT_SECRET, ...options } = {}) =>
  jwt.sign(payload, secret, { ...JWT_OPTIONS, subject, expiresIn, ...options });

/** Waits until `predicate()` is truthy (polling), or the timeout passes. Returns the last value. */
export async function eventually(predicate, { timeout = 4000, every = 100 } = {}) {
  const started = Date.now();
  let value;
  while (Date.now() - started < timeout) {
    value = await predicate();
    if (value) return value;
    await sleep(every);
  }
  return value;
}

/** Collects every value of a key, anywhere inside a JSON value. */
export function collect(value, key, found = []) {
  if (Array.isArray(value)) value.forEach((item) => collect(item, key, found));
  else if (value && typeof value === 'object') {
    if (key in value) found.push(value[key]);
    Object.values(value).forEach((item) => collect(item, key, found));
  }
  return found;
}
