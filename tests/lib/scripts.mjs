// Runs backend scripts (npm run user:role) against a test database only: the env hook refuses any
// MongoDB other than the local test server.
import { spawn } from 'node:child_process';
import { BACKEND } from './paths.mjs';
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
