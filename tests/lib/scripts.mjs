// Runs backend scripts (npm run user:role) against a test database only: the env hook refuses any
// MongoDB other than the local test server.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { BACKEND, TESTS_DIR } from './paths.mjs';
import { HOOK, JWT_SECRET } from './stack.mjs';

/** node scripts/setUserRole.js <args> → { code, output } (killed after 30 s). */
export function runRoleScript(mongoUri, args, { env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', HOOK, 'scripts/setUserRole.js', ...args], {
      cwd: BACKEND,
      env: { ...process.env, CAMPUSX_TEST_ENV: JSON.stringify({ MONGODB_URI: mongoUri, NODE_ENV: 'development', JWT_SECRET, ...env }) },
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: 'timeout', output });
    }, 30000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

export const setRoleByScript = (mongoUri, email, role) => runRoleScript(mongoUri, ['--email', email, '--role', role]);

/**
 * One round of the account deletion cleanup job against a test database (tests/lib/account-cleanup.mjs).
 * `env` adds backend variables (e.g. the fake Cloudinary); `now` pretends the round runs at that time.
 * Resolves to { code, output, result } (result: what resumeDeletions returned, or null).
 */
export function runAccountCleanup(mongoUri, { env = {}, now } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', HOOK, path.join(TESTS_DIR, 'lib', 'account-cleanup.mjs')], {
      cwd: BACKEND,
      env: { ...process.env, ...(now && { CAMPUSX_CLEANUP_NOW: new Date(now).toISOString() }), CAMPUSX_TEST_ENV: JSON.stringify({ MONGODB_URI: mongoUri, NODE_ENV: 'development', JWT_SECRET, GAMIFICATION_TIMEZONE: 'Asia/Kolkata', ...env }) },
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: 'timeout', output, result: null });
    }, 60000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const match = /CLEANUP (\{.*\})/.exec(output);
      resolve({ code, output, result: match ? JSON.parse(match[1]) : null });
    });
  });
}
