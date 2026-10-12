// Runs the CampusX test suites one at a time (each starts its own backend on a fresh database; running
// them in parallel makes backends miss their start-up waits) and prints one summary.
//   node tests/run.mjs                 unit + api suites
//   node tests/run.mjs all             unit + api + browser
//   node tests/run.mjs api posts auth  only the named suites of a group
//   node tests/run.mjs browser         browser suites (need playwright-core, see tests/README.md)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { RESULTS_DIR, TESTS_DIR } from './lib/paths.mjs';
import { ensureDatabase } from './lib/stack.mjs';

const GROUPS = ['unit', 'api', 'browser'];
const args = process.argv.slice(2);
const groups = args[0] === 'all' ? GROUPS : GROUPS.includes(args[0]) ? [args[0]] : ['unit', 'api'];
const only = GROUPS.includes(args[0]) || args[0] === 'all' ? args.slice(1) : args;

const suites = groups.flatMap((group) =>
  fs
    .readdirSync(path.join(TESTS_DIR, group))
    .filter((file) => file.endsWith('.mjs') && !file.startsWith('_'))
    .sort()
    .map((file) => ({ group, name: file.replace(/\.mjs$/, ''), file: path.join(TESTS_DIR, group, file) }))
    .filter((suite) => !only.length || only.includes(suite.name)),
);

fs.mkdirSync(RESULTS_DIR, { recursive: true });
// One mongod for the whole run; every suite still gets its own database and backend.
const database = groups.some((group) => group !== 'unit') ? await ensureDatabase() : { stop: async () => {} };
const rows = [];
for (const suite of suites) {
  console.log(`\n════════ ${suite.group}/${suite.name}`);
  const started = Date.now();
  const child = spawn(process.execPath, [suite.file], { stdio: ['ignore', 'pipe', 'inherit'], env: process.env });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
    process.stdout.write(chunk);
  });
  const code = await new Promise((resolve) => child.on('close', resolve));
  const result = /RESULT (\{.*\})/.exec(output);
  const parsed = result ? JSON.parse(result[1]) : { passed: 0, failed: 1 };
  rows.push({ ...suite, ...parsed, crashed: !result, code, seconds: Math.round((Date.now() - started) / 1000) });
}
await database.stop();

const total = rows.reduce((sum, row) => ({ passed: sum.passed + row.passed, failed: sum.failed + row.failed }), { passed: 0, failed: 0 });
console.log('\n════════ Summary');
for (const row of rows) console.log(`${row.failed || row.crashed ? '✖' : '✔'} ${`${row.group}/${row.name}`.padEnd(32)} ${String(row.passed).padStart(4)} passed ${String(row.failed).padStart(3)} failed ${String(row.seconds).padStart(4)} s${row.crashed ? '  (no result: crashed)' : ''}`);
console.log(`\nTotal: ${total.passed} passed, ${total.failed} failed in ${rows.length} suites`);
fs.writeFileSync(path.join(RESULTS_DIR, 'summary.json'), JSON.stringify({ at: new Date().toISOString(), total, suites: rows }, null, 2));
process.exit(total.failed || rows.some((row) => row.crashed) ? 1 : 0);
