// Where things are, and the test ports. Everything here is local: test runs never touch the
// developer's servers (5000/5173), databases or backend/.env.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TESTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = path.resolve(TESTS_DIR, '..');
export const BACKEND = path.join(ROOT, 'backend');
export const FRONTEND = path.join(ROOT, 'frontend');
export const RESULTS_DIR = path.join(TESTS_DIR, '.results');
export const SHOTS_DIR = path.join(RESULTS_DIR, 'screenshots');
export const LOGS_DIR = path.join(RESULTS_DIR, 'logs');

export const DB_PORT = Number(process.env.CAMPUSX_TEST_DB_PORT || 27019);
export const API_PORT = Number(process.env.CAMPUSX_TEST_API_PORT || 5090);
export const PROD_API_PORT = API_PORT + 3;
export const WEB_PORT = Number(process.env.CAMPUSX_TEST_WEB_PORT || 5174);
export const FAKE_CLOUDINARY_PORT = Number(process.env.CAMPUSX_TEST_CLOUDINARY_PORT || 5096);

/** The only database server a test backend may use (env-hook.mjs refuses anything else). */
export const TEST_DB_PREFIX = `mongodb://127.0.0.1:${DB_PORT}/`;

/** backend/ and frontend/ dependencies, loaded from their own node_modules (no test-only installs). */
export const backendModule = (name) => import(pathToFileURL(path.join(BACKEND, 'node_modules', name, ...(name === 'mongoose' ? ['index.js'] : []))).href);
export const backendFile = (file) => pathToFileURL(path.join(BACKEND, file)).href;

/** The mongod binary: CAMPUSX_TEST_MONGOD, else the mongodb-memory-server download cache. */
export function findMongod() {
  if (process.env.CAMPUSX_TEST_MONGOD) return process.env.CAMPUSX_TEST_MONGOD;
  const cache = path.join(os.homedir(), '.cache', 'mongodb-binaries');
  const found = fs.existsSync(cache) ? fs.readdirSync(cache).filter((name) => /^mongod.*(\.exe)?$/.test(name) && !name.endsWith('.md5') && !name.endsWith('.mdmp')).sort() : [];
  if (found.length) return path.join(cache, found.at(-1));
  throw new Error('No mongod binary found. Set CAMPUSX_TEST_MONGOD to a mongod executable (MongoDB 7+).');
}

/** A Chromium-family browser for the browser suites: CAMPUSX_BROWSER, Playwright's cache, Chrome or Edge. */
export function findBrowser() {
  const candidates = [
    process.env.CAMPUSX_BROWSER,
    ...(() => {
      const cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), '.cache'), 'ms-playwright');
      if (!fs.existsSync(cache)) return [];
      return fs.readdirSync(cache).filter((name) => name.startsWith('chromium-')).sort().reverse().map((name) => path.join(cache, name, 'chrome-win64', 'chrome.exe'));
    })(),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

/** playwright-core is not a project dependency: CAMPUSX_PLAYWRIGHT_CORE, or an install the runner can resolve. */
export async function loadPlaywright() {
  const from = process.env.CAMPUSX_PLAYWRIGHT_CORE;
  try {
    return from ? await import(pathToFileURL(path.join(from, 'index.mjs')).href) : await import('playwright-core');
  } catch {
    return null;
  }
}
