// Unit checks for the security helpers and the error handler (Phase 16), in-process.
// Each mode runs in its own process (config/env.js reads the environment once), always through the
// test env hook so backend/.env (the developer's Atlas, Cloudinary, ...) is never loaded.
//   node tests/unit/security.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESULTS_DIR, TEST_DB_PREFIX, backendFile as B } from '../lib/paths.mjs';
import { HOOK } from '../lib/stack.mjs';
const mode = process.argv[2];

let passed = 0;
const failures = [];
const check = (name, condition, detail) => {
  if (condition) passed += 1;
  else {
    failures.push(`${name}${detail === undefined ? '' : ` :: ${JSON.stringify(detail).slice(0, 300)}`}`);
    console.log(`  ✖ ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 300));
  }
};

function fakeRes() {
  return {
    headersSent: false,
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function errorHandlerChecks(production) {
  const { errorHandler } = await import(B('middleware/errorMiddleware.js'));
  const req = { method: 'GET', path: '/x' };
  const internal = new Error('connect ECONNREFUSED mongodb://admin:hunter2@db.internal:27017 at D:\\CampusX\\backend\\services\\x.js');
  const res = fakeRes();
  errorHandler(internal, req, res, () => {});
  const text = JSON.stringify(res.body);
  check(`${mode}: unexpected error → 500 with a generic message`, res.statusCode === 500 && res.body.message === 'Something went wrong. Please try again.', res.body);
  if (production) {
    check('production: no debug block, no stack, no paths, no connection strings', !('debug' in res.body) && !text.includes('hunter2') && !text.includes('mongodb://') && !text.includes('CampusX\\\\backend') && !text.includes(' at '), res.body);
  } else {
    check('development: debug details for unexpected errors', res.body.debug?.message?.includes('ECONNREFUSED'));
  }
  const malformed = fakeRes();
  errorHandler(new Error('Malformed part header'), req, malformed, () => {});
  check(`${mode}: malformed multipart → 400`, malformed.statusCode === 400 && !('debug' in malformed.body), malformed.body);
  const fsError = Object.assign(new Error('Unexpected end of file'), { code: 'EIO' });
  const fsRes = fakeRes();
  errorHandler(fsError, req, fsRes, () => {});
  check(`${mode}: a system I/O error is not mistaken for a bad upload (500)`, fsRes.statusCode === 500);
  const dup = fakeRes();
  errorHandler(Object.assign(new Error('E11000 duplicate key { email: "a@b.c" }'), { code: 11000, keyPattern: { email: 1 }, keyValue: { email: 'a@b.c' } }), req, dup, () => {});
  check(`${mode}: duplicate key never echoes the value`, dup.statusCode === 409 && !JSON.stringify(dup.body).includes('a@b.c'), dup.body);
}

async function helperChecks() {
  const security = await import(B('services/securityService.js'));
  const { uploadNameProblem, extensionsFor, canonicalExtension } = await import(B('utils/uploadSafety.js'));
  const { redactLogText } = await import(B('utils/logger.js'));
  const images = extensionsFor(['image/jpeg', 'image/png', 'image/webp']);
  const proof = extensionsFor(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  const cases = [
    ['photo.jpg', images, null],
    ['IMG_2024.06.01.JPEG', images, null],
    ['example.com.png', images, null],
    ['Node.js.webp', images, null],
    ['blob', images, null],
    ['scan.jfif', images, null],
    ['avatar.exe', images, 'extension_not_allowed'],
    ['photo.php.jpg', images, 'disguised_extension'],
    ['cv.exe.pdf', proof, 'disguised_extension'],
    ['report.pdf', images, 'extension_not_allowed'],
    ['report.pdf', proof, null],
    ['logo.svg', images, 'extension_not_allowed'],
    ['pho\u0007to.jpg', images, 'control_characters'],
    ['..\\..\\evil.jpg', images, 'path_in_name'],
    ['../evil.jpg', images, 'path_in_name'],
    [`${'a'.repeat(300)}.jpg`, images, 'name_too_long'],
  ];
  for (const [name, allowed, expected] of cases) check(`uploadNameProblem(${JSON.stringify(name.slice(0, 24))}) = ${expected}`, uploadNameProblem(name, allowed) === expected, uploadNameProblem(name, allowed));
  check('temporary file extensions come from the allowed type, never the client name', canonicalExtension('image/jpeg') === 'jpg' && canonicalExtension('application/pdf') === 'pdf');

  const risk = security.checkRequestRisk;
  check('checkRequestRisk: normal body passes', risk({ body: { content: 'hello', tags: ['a', 'b'], nested: { ok: true } }, query: { page: '1' } }) === null);
  check('checkRequestRisk: __proto__ key', risk({ body: JSON.parse('{"__proto__":{"admin":true}}') })?.reason === 'forbidden_key');
  check('checkRequestRisk: nested constructor key', risk({ body: { a: { constructor: { prototype: {} } } } })?.reason === 'forbidden_key');
  check('checkRequestRisk: NUL in value', risk({ query: { q: 'a\u0000b' } })?.reason === 'nul_byte');
  check('checkRequestRisk: NUL in key', risk({ body: { 'a\u0000': 1 } })?.reason === 'nul_byte');
  let deep = {};
  for (let level = 0; level < 12; level += 1) deep = { d: deep };
  check('checkRequestRisk: too deep', risk({ body: deep })?.reason === 'too_deep');
  check('checkRequestRisk: array too long', risk({ body: { list: new Array(501).fill(1) } })?.reason === 'array_too_long');
  check('checkRequestRisk: too many keys', risk({ body: Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`k${i}`, i])) })?.reason === 'too_many_keys');

  const meta = security.sanitizeSecurityMetadata({ password: 'hunter2', accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlMTIz', note: 'mail me at someone@college.edu', $where: 'x', 'a.b': 1, nested: { apiKey: 'k', deeper: { deepest: { gone: true } } }, list: new Array(50).fill('x') });
  const metaText = JSON.stringify(meta);
  check('sanitizeSecurityMetadata: secrets redacted, emails masked, keys made storable, size bounded', meta.password === '[redacted]' && meta.accessToken === '[redacted]' && meta.note.includes('[email]') && !metaText.includes('hunter2') && !metaText.includes('someone@college.edu') && 'where' in meta && 'a_b' in meta && meta.nested.apiKey === '[redacted]' && meta.nested.deeper.deepest === '[nested]' && meta.list.length === 20, meta);
  // Regression (Phase 17 QA): the PASSWORD_CHANGED audit row must keep its device count. Any key that looks
  // like a session is redacted, so the count is stored as otherDevicesSignedOut.
  const passwordAudit = security.sanitizeSecurityMetadata({ otherSessionsSignedOut: 2, otherDevicesSignedOut: 2 });
  check('sanitizeSecurityMetadata: "session" keys redacted, the password-change device count kept', passwordAudit.otherSessionsSignedOut === '[redacted]' && passwordAudit.otherDevicesSignedOut === 2, passwordAudit);
  check('sanitizeSecurityMetadata: JWT-looking text masked', security.sanitizeSecurityMetadata('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlMTIz end') === 'token [token] end');

  const now = new Date();
  check('detectSuspiciousLogin: ordinary sign-in', security.detectSuspiciousLogin({ failedAttempts: 1, lockedUntil: null, now }).length === 0);
  check('detectSuspiciousLogin: after 3 failures', security.detectSuspiciousLogin({ failedAttempts: 3, now }).includes('after_failed_attempts'));
  check('detectSuspiciousLogin: within a day of a lock', security.detectSuspiciousLogin({ lockedUntil: new Date(now - 3_600_000), now }).includes('after_lockout'));
  check('detectSuspiciousLogin: old lock is forgotten', security.detectSuspiciousLogin({ lockedUntil: new Date(now - 3 * 86_400_000), now }).length === 0);

  check('logger: URI credentials masked', redactLogText('mongodb+srv://user:p4ss@cluster.x/db') === 'mongodb+srv://***@cluster.x/db');
  check('logger: bearer tokens masked', !redactLogText('Authorization: Bearer abc.def.ghi').includes('abc.def.ghi'));
  check('logger: JWTs masked', redactLogText('t=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlMTIz').includes('[REDACTED') && !redactLogText('x eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlMTIz').includes('eyJzdWIi'));
  check('logger: secret key/value pairs masked', !redactLogText("{ passwordHash: '$2b$12$abcdef', api_secret: 'zzz' }").includes('$2b$12') && !redactLogText('CLOUDINARY_API_SECRET=zzz9').includes('zzz9'));
  check('logger: ordinary security lines untouched', redactLogText('Security: REFRESH_TOKEN_REUSE user=abc ip=1.2.3.4') === 'Security: REFRESH_TOKEN_REUSE user=abc ip=1.2.3.4');
}

async function envChecks() {
  const { default: env, validateEnv } = await import(B('config/env.js'));
  if (mode === 'production-no-secret') {
    check('production without JWT_SECRET: no generated secret', env.auth.jwtSecret === '' && env.auth.isJwtSecretEphemeral === true);
    let message = '';
    try {
      validateEnv();
    } catch (error) {
      message = error.message;
    }
    check('production without JWT_SECRET: validateEnv fails fast', /Missing required environment variables: JWT_SECRET/.test(message), message);
    const { signAccessToken } = await import(B('utils/generateToken.js'));
    let signed = null;
    try {
      signed = signAccessToken({ userId: '0'.repeat(24), sessionId: '1'.repeat(24), role: 'student' });
    } catch {
      signed = null;
    }
    check('production without JWT_SECRET: tokens can never be signed', signed === null);
  } else if (mode === 'development-no-secret') {
    check('development without JWT_SECRET: temporary per-process secret', env.auth.jwtSecret.length === 96 && env.auth.isJwtSecretEphemeral === true);
    let threw = false;
    try {
      validateEnv();
    } catch {
      threw = true;
    }
    check('development without JWT_SECRET still starts', !threw);
  }
}

const MODES = {
  production: { NODE_ENV: 'production', JWT_SECRET: 'b5e1f0c4a8d94e2f9c7b6a5d4e3f2a1b0c9d8e7f6a5b4c3d', CLIENT_URL: 'https://campusx.example.com' },
  development: { NODE_ENV: 'development', JWT_SECRET: 'dev-secret' },
  'production-no-secret': { NODE_ENV: 'production', JWT_SECRET: '', CLIENT_URL: 'https://campusx.example.com' },
  'development-no-secret': { NODE_ENV: 'development', JWT_SECRET: '' },
};

if (!mode) {
  let total = 0;
  const allFailures = [];
  for (const name of Object.keys(MODES)) {
    const child = spawn(process.execPath, ['--import', HOOK, fileURLToPath(import.meta.url), name], {
      env: { ...process.env, CAMPUSX_TEST_ENV: JSON.stringify({ MONGODB_URI: `${TEST_DB_PREFIX}campusx_test_unit`, ...MODES[name] }) },
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    await new Promise((resolve) => child.on('close', resolve));
    const result = /CHILD_RESULT (\{.*\})/.exec(output);
    if (!result) {
      allFailures.push(`${name}: no result\n${output.slice(-500)}`);
      continue;
    }
    const parsed = JSON.parse(result[1]);
    total += parsed.passed;
    allFailures.push(...parsed.failures.map((failure) => `${name}: ${failure}`));
  }
  console.log(`\nunit/security: ${total} passed, ${allFailures.length} failed`);
  for (const failure of allFailures) console.log(` - ${failure}`);
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, 'unit-security.json'), JSON.stringify({ suite: 'unit-security', passed: total, failed: allFailures.length, failures: allFailures }, null, 2));
  console.log(`RESULT ${JSON.stringify({ suite: 'unit-security', passed: total, failed: allFailures.length })}`);
  process.exit(allFailures.length ? 1 : 0);
} else {
  try {
    if (mode === 'production' || mode === 'development') {
      await errorHandlerChecks(mode === 'production');
      if (mode === 'development') await helperChecks();
    } else {
      await envChecks();
    }
  } catch (error) {
    failures.push(`crashed: ${error.stack}`);
  }
  console.log(`CHILD_RESULT ${JSON.stringify({ passed, failures })}`);
  process.exit(0);
}
