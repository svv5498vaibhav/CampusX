// Browser suites: the CampusX frontend (Vite dev server on the test web port, talking to the suite's test
// backend) and a headless Chromium through playwright-core. Never uses the developer's 5173/5000.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { FRONTEND, LOGS_DIR, SHOTS_DIR, WEB_PORT, findBrowser, loadPlaywright } from './paths.mjs';
import { portOpen, sleep } from './stack.mjs';

/** Starts Vite on `port` with the API pointed at the test backend. Resolves when the page answers. */
export async function startWeb({ apiPort, port = WEB_PORT, name = 'web' }) {
  if (await portOpen(port)) throw new Error(`Port ${port} is already in use: stop whatever runs there first.`);
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const out = fs.openSync(path.join(LOGS_DIR, `${name}.log`), 'w');
  const child = spawn(process.execPath, [path.join(FRONTEND, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort', '--host', 'localhost'], {
    cwd: FRONTEND,
    // localhost for both, so the refresh cookie is same-site like in development.
    env: { ...process.env, VITE_API_URL: `http://localhost:${apiPort}/api/v1` },
    stdio: ['ignore', out, out],
    windowsHide: true,
  });
  const url = `http://localhost:${port}`;
  const started = Date.now();
  while (Date.now() - started < 60000) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* not yet */
    }
    await sleep(300);
  }
  return {
    url,
    async stop() {
      if (child.exitCode === null) {
        child.kill();
        await sleep(500);
      }
    },
  };
}

/** Headless Chromium, or null (with the reason) when playwright-core or a browser is missing. */
export async function launchBrowser() {
  const playwright = await loadPlaywright();
  if (!playwright) return { browser: null, reason: 'playwright-core not found: set CAMPUSX_PLAYWRIGHT_CORE to a playwright-core folder' };
  const executablePath = findBrowser();
  if (!executablePath) return { browser: null, reason: 'no Chromium/Chrome/Edge found: set CAMPUSX_BROWSER' };
  return { browser: await playwright.chromium.launch({ executablePath, headless: true }), reason: null };
}

export const shotPath = (name) => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  return path.join(SHOTS_DIR, `${name}.png`);
};
