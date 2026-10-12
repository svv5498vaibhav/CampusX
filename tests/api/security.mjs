// Security and production hardening (Phase 16): headers, CORS/CSRF, tokens and sessions, account status,
// passwords, lockout and enumeration, roles, ownership, injection, XSS and links, uploads, anonymous
// privacy, rate limits, abuse pattern, admin security status, role changes, Socket.IO, logs, and
// production start-up checks (separate production-mode backends on PROD_API_PORT).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BACKEND, PROD_API_PORT, TEST_DB_PREFIX } from '../lib/paths.mjs';
import { JWT_SECRET, ORIGIN, PASSWORD, createSuite, freshIp, jwt, oid, sleep } from '../lib/harness.mjs';
import { setRoleByScript as runRoleChange } from '../lib/scripts.mjs';
import { HOOK } from '../lib/stack.mjs';

const uploadsBefore = new Set(fs.readdirSync(path.join(BACKEND, 'uploads')));
const t = await createSuite('security');
const { check, section } = t;
const stack = t.stack;
const BASE = t.base;
const db = t.db;
const apiLog = () => t.stack.log();
const api = (method, urlPath, options = {}) => t.api(method, urlPath, options);
async function register(firstName, lastName, email, { college = 'vnit-nagpur', branch = 'cse', semester = 5, roll } = {}) {
  const account = await t.register(firstName, lastName, { email, college, branch, semester, roll });
  account.registered = { text: account.registrationText };
  return account;
}
const login = (email, password = PASSWORD, ip = '10.0.0.2') => t.login(email, password, ip);
const setRole = (id, role) => db.collection('users').updateOne({ _id: oid(id) }, { $set: { role } });
const auditRows = (filter) => db.collection('moderationauditlogs').find(filter).toArray();
const connectSocket = (token, options) => t.connectSocket(token, options);
const setRoleByScript = (email, role) => runRoleChange(stack.mongoUri, email, role);

// Minimal file contents, recognised by their first bytes like real files.
const pad = (bytes, size = 64) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(Math.max(0, size - bytes.length), 0x20)]);
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const EXE = pad([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const PDF_PLAIN = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const PDF_JS = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /OpenAction 2 0 R >> endobj\n2 0 obj << /S /JavaScript /JS (app.alert(1)) >> endobj\n%%EOF\n');
const PDF_JS_ESCAPED = Buffer.from('%PDF-1.4\n2 0 obj << /S /J#61vaScript /JS (app.alert(1)) >> endobj\n%%EOF\n');
const PDF_LAUNCH = Buffer.from('%PDF-1.4\n2 0 obj << /S /Launch /F (cmd.exe) >> endobj\n%%EOF\n');

async function upload(urlPath, token, field, files, { ip } = {}) {
  const form = new FormData();
  for (const { bytes, type, name } of files) form.append(field, new Blob([bytes], { type }), name);
  return api('POST', urlPath, { token, raw: form, ip });
}

try {
  // ------------------------------------------------------------------ seed
  section('Seeding accounts and content');
  const admin = await register('Ada', 'Admin', 'ada.admin@sec.campusx.dev', { roll: 'ADM16' });
  const mod = await register('Milo', 'Moderator', 'milo.mod@sec.campusx.dev', { roll: 'MOD16' });
  const asha = await register('Asha', 'Rao', 'asha.rao@sec.campusx.dev', { roll: 'S1601' });
  const bilal = await register('Bilal', 'Khan', 'bilal.khan@sec.campusx.dev', { branch: 'it', roll: 'S1602' });
  const chitra = await register('Chitra', 'Iyer', 'chitra.iyer@sec.campusx.dev', { roll: 'S1603' });
  const dev = await register('Dev', 'Patel', 'dev.patel@sec.campusx.dev', { roll: 'S1604' });
  const esha = await register('Esha', 'Nair', 'esha.nair@sec.campusx.dev', { roll: 'S1605' });
  const farah = await register('Farah', 'Siddiqui', 'farah.s@sec.campusx.dev', { roll: 'S1606' });
  await setRole(admin.id, 'admin');
  await setRole(mod.id, 'moderator');
  admin.token = (await login(admin.email)).data.accessToken;
  mod.token = (await login(mod.email)).data.accessToken;
  check('seed: accounts registered, staff signed in', Boolean(admin.token && mod.token));

  const ashaPost = await api('POST', '/posts', { token: asha.token, body: { content: 'Robotics club demo on Friday in the main hall, everyone is welcome to try the line follower bots.', visibility: 'public' } });
  check('seed: Asha post', ashaPost.status === 201, ashaPost.body);
  const ashaPostId = ashaPost.data.post.id;
  const ashaProject = await api('POST', '/projects', { token: asha.token, body: { title: 'Campus Bus Tracker', shortDescription: 'Live bus locations for the college shuttle.', description: 'A small web app that shows where the college shuttle is using GPS pings from the driver phone.', category: 'web' } });
  check('seed: Asha project', ashaProject.status === 201, ashaProject.body);
  const ashaProjectId = ashaProject.data.project.id;
  const ashaAchievement = await api('POST', '/achievements', { token: asha.token, body: { title: 'Runner-up, Smart India Hackathon', type: 'hackathon', date: '2026-07-10', organization: 'Ministry of Education' } });
  check('seed: Asha achievement', ashaAchievement.status === 201, ashaAchievement.body);
  const ashaAchievementId = ashaAchievement.data.achievement.id;
  const ashaComment = await api('POST', `/posts/${ashaPostId}/comments`, { token: asha.token, body: { content: 'Bring your own laptops if you want to flash the boards.' } });
  check('seed: Asha comment', ashaComment.status === 201, ashaComment.body);
  const ashaCommentId = ashaComment.data.comment.id;

  // ------------------------------------------------------------------ headers, CORS, caching
  section('Security headers, CORS and caching');
  const health = await api('GET', '/health');
  const h = (name) => health.headers.get(name);
  check('CSP for the API: default-src none, frame-ancestors none', /default-src 'none'/.test(h('content-security-policy') ?? '') && /frame-ancestors 'none'/.test(h('content-security-policy') ?? ''), h('content-security-policy'));
  check('X-Content-Type-Options nosniff', h('x-content-type-options') === 'nosniff');
  check('X-Frame-Options DENY', h('x-frame-options') === 'DENY', h('x-frame-options'));
  check('Referrer-Policy no-referrer', h('referrer-policy') === 'no-referrer');
  check('no X-Powered-By', !h('x-powered-by'));
  check('no HSTS in development (HTTP)', !h('strict-transport-security'));
  check('API responses default to Cache-Control: no-store', h('cache-control') === 'no-store', h('cache-control'));
  const options = await api('GET', '/posts/options', { token: asha.token });
  check('routes that allow caching keep their own Cache-Control', /max-age=300/.test(options.headers.get('cache-control') ?? ''), options.headers.get('cache-control'));
  const notFound = await api('GET', '/does-not-exist');
  check('404 JSON error is no-store and safe', notFound.status === 404 && notFound.headers.get('cache-control') === 'no-store' && notFound.body?.success === false);
  const preflightOk = await fetch(`${BASE}/auth/login`, { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  check('CORS: allowed origin echoed with credentials', preflightOk.headers.get('access-control-allow-origin') === ORIGIN && preflightOk.headers.get('access-control-allow-credentials') === 'true');
  check('CORS: preflight cached (max-age 600)', preflightOk.headers.get('access-control-max-age') === '600');
  const preflightBad = await fetch(`${BASE}/auth/login`, { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
  check('CORS: unknown origin gets no allow-origin header (never *)', !preflightBad.headers.get('access-control-allow-origin'));
  const evilLogin = await api('POST', '/auth/login', { headers: { origin: 'https://evil.example' }, body: { email: asha.email, password: PASSWORD } });
  check('CSRF: cookie endpoints refuse other origins (403)', evilLogin.status === 403, evilLogin.status);
  const evilRefresh = await api('POST', '/auth/refresh', { headers: { origin: 'https://evil.example' } });
  check('CSRF: refresh from another origin refused (403)', evilRefresh.status === 403, evilRefresh.status);

  // ------------------------------------------------------------------ authentication
  section('Authentication: tokens and sessions');
  const ashaSessionId = jwt.decode(asha.token).sid;
  const noToken = await api('GET', '/auth/me');
  check('no token → 401', noToken.status === 401);
  const garbage = await api('GET', '/auth/me', { token: 'not.a.jwt' });
  check('malformed token → 401', garbage.status === 401);
  const wrongSecret = jwt.sign({ sid: ashaSessionId, role: 'student' }, 'some-other-secret-that-is-long-enough-123456', { algorithm: 'HS256', issuer: 'campusx-api', audience: 'campusx-app', subject: asha.id, expiresIn: 600 });
  const wrongSecretRes = await api('GET', '/auth/me', { token: wrongSecret, ip: '10.99.0.1' });
  check('token signed with another secret → 401', wrongSecretRes.status === 401);
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const noneToken = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: asha.id, sid: ashaSessionId, role: 'admin', iss: 'campusx-api', aud: 'campusx-app', exp: Math.floor(Date.now() / 1000) + 600 })}.`;
  check('alg:none token → 401', (await api('GET', '/auth/me', { token: noneToken })).status === 401);
  const expired = jwt.sign({ sid: ashaSessionId, role: 'student' }, JWT_SECRET, { algorithm: 'HS256', issuer: 'campusx-api', audience: 'campusx-app', subject: asha.id, expiresIn: -60 });
  const expiredRes = await api('GET', '/auth/me', { token: expired, ip: '10.99.0.2' });
  check('expired token → 401 with the session-expired message', expiredRes.status === 401 && /expired/i.test(expiredRes.body?.message ?? ''), expiredRes.body);
  const wrongAudience = jwt.sign({ sid: ashaSessionId }, JWT_SECRET, { algorithm: 'HS256', issuer: 'campusx-api', audience: 'other-app', subject: asha.id, expiresIn: 600 });
  check('wrong audience → 401', (await api('GET', '/auth/me', { token: wrongAudience })).status === 401);
  const bilalSessionId = jwt.decode(bilal.token).sid;
  const crossSession = jwt.sign({ sid: bilalSessionId, role: 'student' }, JWT_SECRET, { algorithm: 'HS256', issuer: 'campusx-api', audience: 'campusx-app', subject: asha.id, expiresIn: 600 });
  check("token pairing one user with another user's session → 401", (await api('GET', '/auth/me', { token: crossSession })).status === 401);
  const badSub = jwt.sign({ sid: ashaSessionId }, JWT_SECRET, { algorithm: 'HS256', issuer: 'campusx-api', audience: 'campusx-app', subject: 'not-an-object-id', expiresIn: 600 });
  const badSubRes = await api('GET', '/auth/me', { token: badSub });
  check('validly signed token with a malformed subject → 401 (not 400/500)', badSubRes.status === 401, badSubRes.status);
  await sleep(300);
  const logAfterTokens = apiLog();
  check('forged token recorded as INVALID_TOKEN (address only)', /Security: INVALID_TOKEN ip=10\.99\.0\.1 /.test(logAfterTokens));
  check('expired token is routine: not recorded as INVALID_TOKEN', !/Security: INVALID_TOKEN ip=10\.99\.0\.2/.test(logAfterTokens));
  check('tokens never appear in the server log', !logAfterTokens.includes(asha.token) && !logAfterTokens.includes(wrongSecret) && !logAfterTokens.includes(expired));

  // Logout revokes the session behind the access token straight away.
  const farahLogin = await login(farah.email);
  const farahToken = farahLogin.data.accessToken;
  const farahCookie = farahLogin.headers.get('set-cookie')?.split(';')[0];
  check('login sets an HttpOnly, path-scoped refresh cookie', /HttpOnly/i.test(farahLogin.headers.get('set-cookie') ?? '') && /Path=\/api\/v1\/auth/i.test(farahLogin.headers.get('set-cookie') ?? ''));
  const logout = await api('POST', '/auth/logout', { token: farahToken, cookie: farahCookie });
  check('logout 200', logout.status === 200);
  check('access token of a logged-out session → 401', (await api('GET', '/auth/me', { token: farahToken })).status === 401);
  check('refresh cookie of a logged-out session → 401', (await api('POST', '/auth/refresh', { cookie: farahCookie })).status === 401);

  // Refresh token reuse: the device is signed out and the event audited.
  const reuseLogin = await login(farah.email);
  const firstCookie = reuseLogin.headers.get('set-cookie').split(';')[0];
  const rotated = await api('POST', '/auth/refresh', { cookie: firstCookie });
  check('refresh rotates the cookie', rotated.status === 200 && rotated.headers.get('set-cookie')?.split(';')[0] !== firstCookie);
  const reuseSessionId = jwt.decode(reuseLogin.data.accessToken).sid;
  await db.collection('sessions').updateOne({ _id: oid(reuseSessionId) }, { $set: { rotatedAt: new Date(Date.now() - 5 * 60_000) } });
  const reused = await api('POST', '/auth/refresh', { cookie: firstCookie, ip: '10.77.0.1' });
  check('reusing an old refresh token → 401', reused.status === 401);
  const reusedSession = await db.collection('sessions').findOne({ _id: oid(reuseSessionId) });
  check('reuse revokes the whole session', reusedSession.revokedAt && reusedSession.revokedReason === 'token_reuse', reusedSession);
  await sleep(200);
  const reuseAudit = await auditRows({ action: 'REFRESH_TOKEN_REUSE', targetId: oid(farah.id) });
  check('REFRESH_TOKEN_REUSE audited (system actor, address, no token)', reuseAudit.length === 1 && reuseAudit[0].actorRole === 'system' && reuseAudit[0].ip === '10.77.0.1' && !JSON.stringify(reuseAudit[0]).includes(firstCookie.split('=')[1]), reuseAudit);

  section('Authentication: account status');
  const statusUser = await register('Gopal', 'Menon', 'gopal.menon@sec.campusx.dev', { roll: 'S1607' });
  for (const status of ['suspended', 'blocked', 'deactivated', 'pending']) {
    await db.collection('users').updateOne({ _id: oid(statusUser.id) }, { $set: { status } });
    const me = await api('GET', '/auth/me', { token: statusUser.token });
    check(`${status} account: existing token → 403`, me.status === 403, me.body);
    const right = await login(statusUser.email, PASSWORD, freshIp());
    check(`${status} account: correct password → 403 with a status message`, right.status === 403 && right.body.message.length > 0 && !right.data?.accessToken, right.body);
    const wrong = await login(statusUser.email, 'Wrong#Password1', freshIp());
    check(`${status} account: wrong password → 401 (status never revealed)`, wrong.status === 401 && wrong.body.message === 'Invalid email or password.', wrong.body);
  }
  await db.collection('users').updateOne({ _id: oid(statusUser.id) }, { $set: { status: 'active', failedLoginAttempts: 0, lockedUntil: null } });
  const blockedSocket = await connectSocket(statusUser.token);
  check('active again: socket connects', !blockedSocket.error, blockedSocket.error);
  blockedSocket.socket.close();
  await db.collection('users').updateOne({ _id: oid(statusUser.id) }, { $set: { status: 'blocked' } });
  const blockedSocket2 = await connectSocket(statusUser.token);
  check('blocked account: socket handshake refused', blockedSocket2.error === 'unauthorized', blockedSocket2.error);
  blockedSocket2.socket.close();

  section('Passwords');
  const regBase = { firstName: 'Pass', lastName: 'Policy', confirmPassword: undefined };
  const tryPassword = async (password, email) => api('POST', '/auth/register', { ip: freshIp(), body: { ...regBase, email, password, confirmPassword: password } });
  check('password under 8 characters → 422', (await tryPassword('Ab1defg', 'p1@sec.campusx.dev')).status === 422);
  check('password without a number → 422', (await tryPassword('OnlyLetters', 'p2@sec.campusx.dev')).status === 422);
  check('common password → 422', (await tryPassword('password123', 'p3@sec.campusx.dev')).status === 422);
  check('password over 72 bytes → 422', (await tryPassword(`A1${'x'.repeat(80)}`, 'p4@sec.campusx.dev')).status === 422);
  const mismatch = await api('POST', '/auth/register', { ip: freshIp(), body: { ...regBase, email: 'p5@sec.campusx.dev', password: 'Good#Pass123', confirmPassword: 'Good#Pass124' } });
  check('password confirmation mismatch → 422', mismatch.status === 422);
  const stored = await db.collection('users').findOne({ _id: oid(asha.id) });
  check('passwords stored as bcrypt hashes (cost 12), never plaintext', /^\$2[aby]\$12\$/.test(stored.passwordHash) && !JSON.stringify(stored).includes(PASSWORD));
  const sensitive = [asha.registered.text, (await login(asha.email)).text, (await api('GET', '/auth/me', { token: asha.token })).text, (await api('GET', '/profile', { token: asha.token })).text, (await api('GET', `/profile/${asha.id}`, { token: bilal.token })).text];
  check('responses never include passwordHash, bcrypt hashes, login counters or IPs', sensitive.every((text) => !/passwordHash|\$2[aby]\$|failedLoginAttempts|lockedUntil|lastLoginIp|registrationIp/.test(text)));
  check('the server log never contains a password', !apiLog().includes(PASSWORD) && !apiLog().includes('Wrong#Password1'));

  // ------------------------------------------------------------------ brute force
  section('Brute force: lockout and enumeration');
  const lockTarget = await register('Lata', 'Kulkarni', 'lata.k@sec.campusx.dev', { roll: 'S1608' });
  const lockIp = freshIp();
  const realStatuses = [];
  const realMessages = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await login(lockTarget.email, `Wrong#${attempt}pass`, lockIp);
    realStatuses.push(res.status);
    realMessages.push(res.body.message);
  }
  const ghostIp = freshIp();
  const ghostStatuses = [];
  const ghostMessages = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await login('nobody.here@sec.campusx.dev', `Wrong#${attempt}pass`, ghostIp);
    ghostStatuses.push(res.status);
    ghostMessages.push(res.body.message);
  }
  check('existing account: 4 × 401 then 423 locked', JSON.stringify(realStatuses) === JSON.stringify([401, 401, 401, 401, 423]), realStatuses);
  check('unknown email: exactly the same answers (no enumeration)', JSON.stringify(ghostStatuses) === JSON.stringify(realStatuses), ghostStatuses);
  check('same messages for unknown and existing emails', JSON.stringify(ghostMessages) === JSON.stringify(realMessages), [ghostMessages, realMessages]);
  const lockedRight = await login(lockTarget.email, PASSWORD, freshIp());
  check('locked account: even the right password → 423', lockedRight.status === 423, lockedRight.status);
  const ghostAgain = await login('nobody.here@sec.campusx.dev', 'Another#1pass', freshIp());
  check('locked unknown email: 423 from any address', ghostAgain.status === 423 && ghostAgain.body.message === lockedRight.body.message, [ghostAgain.status, ghostAgain.body.message, lockedRight.body.message]);
  const lockedDoc = await db.collection('users').findOne({ _id: oid(lockTarget.id) });
  check('lock is temporary (≈15 minutes), never permanent', lockedDoc.lockedUntil && lockedDoc.lockedUntil - Date.now() <= 15 * 60_000 + 5_000 && lockedDoc.lockedUntil - Date.now() > 13 * 60_000 && lockedDoc.status === 'active');
  await sleep(200);
  const lockAudit = await auditRows({ action: 'ACCOUNT_LOCKED', targetId: oid(lockTarget.id) });
  check('ACCOUNT_LOCKED audited with address, no password', lockAudit.length === 1 && lockAudit[0].ip === lockIp && lockAudit[0].metadata?.attempts === 5 && !JSON.stringify(lockAudit[0]).includes('Wrong#'), lockAudit);
  check('unknown-email lock leaves no audit row and no email in the log', !apiLog().includes('nobody.here@sec.campusx.dev'));
  // The lock ends: a correct sign-in works and is recorded as unusual.
  await db.collection('users').updateOne({ _id: oid(lockTarget.id) }, { $set: { lockedUntil: new Date(Date.now() - 60_000) } });
  const afterLock = await login(lockTarget.email, PASSWORD, freshIp());
  check('after the lock ends the right password works', afterLock.status === 200, afterLock.body);
  await sleep(200);
  const suspicious = await auditRows({ action: 'SUSPICIOUS_LOGIN', targetId: oid(lockTarget.id) });
  check('sign-in right after a lockout → SUSPICIOUS_LOGIN (after_lockout)', suspicious.length === 1 && suspicious[0].metadata.reasons.includes('after_lockout'), suspicious);
  for (let attempt = 0; attempt < 3; attempt += 1) await login(dev.email, `Wrong#${attempt}x`, freshIp());
  const devLogin = await login(dev.email, PASSWORD, freshIp());
  await sleep(200);
  const devSuspicious = await auditRows({ action: 'SUSPICIOUS_LOGIN', targetId: oid(dev.id) });
  check('success after 3 wrong passwords → SUSPICIOUS_LOGIN (after_failed_attempts), still signed in', devLogin.status === 200 && devSuspicious.length === 1 && devSuspicious[0].metadata.reasons.includes('after_failed_attempts'), devSuspicious);
  dev.token = devLogin.data.accessToken;
  const normalLogin = await login(chitra.email, PASSWORD, freshIp());
  await sleep(100);
  check('an ordinary sign-in is not flagged', normalLogin.status === 200 && (await auditRows({ action: 'SUSPICIOUS_LOGIN', targetId: oid(chitra.id) })).length === 0);
  const registerTaken = await api('POST', '/auth/register', { ip: freshIp(), body: { firstName: 'Dup', lastName: 'User', email: asha.email, password: 'Good#Pass123', confirmPassword: 'Good#Pass123' } });
  check('duplicate sign-up → 409 (rate-limited per address; see checklist)', registerTaken.status === 409);

  // ------------------------------------------------------------------ authorization
  section('Authorization: roles and permissions');
  const ADMIN_GETS = ['/admin/session', '/admin/system-status', '/admin/dashboard', '/admin/moderation', '/admin/reports', '/admin/users', '/admin/content', '/admin/communities', '/admin/opportunities', '/admin/analytics', '/admin/audit-logs', '/admin/security/status'];
  for (const p of ADMIN_GETS) {
    const res = await api('GET', p, { token: bilal.token });
    check(`student → GET ${p} = 403`, res.status === 403, res.status);
  }
  check('student → moderator case API = 403', (await api('GET', '/moderation/cases', { token: bilal.token })).status === 403);
  check('student → admin status change = 403', (await api('PATCH', `/admin/users/${asha.id}/status`, { token: bilal.token, body: { action: 'suspend', reason: 'testing bypass', confirm: true } })).status === 403);
  check('student → opportunity management = 403', (await api('POST', '/admin/opportunities', { token: bilal.token, body: { title: 'x' } })).status === 403);
  for (const p of ['/admin/users', '/admin/analytics', '/admin/audit-logs', '/admin/communities', '/admin/security/status']) {
    const res = await api('GET', p, { token: mod.token });
    check(`moderator → restricted GET ${p} = 403`, res.status === 403, res.status);
  }
  check('moderator → change a student status = 403', (await api('PATCH', `/admin/users/${asha.id}/status`, { token: mod.token, body: { action: 'suspend', reason: 'testing bypass', confirm: true } })).status === 403);
  check('moderator → allowed GET /admin/moderation = 200', (await api('GET', '/admin/moderation', { token: mod.token })).status === 200);
  check('admin → GET /admin/users = 200', (await api('GET', '/admin/users', { token: admin.token })).status === 200);
  const selfChange = await api('PATCH', `/admin/users/${admin.id}/status`, { token: admin.token, body: { action: 'suspend', reason: 'testing self change', confirm: true } });
  check('admin → own account status = 403', selfChange.status === 403);
  check('anything without a token → 401', (await api('GET', '/admin/session')).status === 401);
  check('student unchanged after the refused admin action', (await db.collection('users').findOne({ _id: oid(asha.id) })).status === 'active');
  const denied = await auditRows({ action: 'ACCESS_DENIED', actor: oid(bilal.id) });
  check('refused admin requests are audited (ACCESS_DENIED, throttled)', denied.length >= 1 && denied.length <= 3, denied.length);

  section('Authorization: role spoofing');
  const spoofReg = await api('POST', '/auth/register', { ip: freshIp(), body: { firstName: 'Sneaky', lastName: 'Admin', email: 'sneaky@sec.campusx.dev', password: 'Good#Pass123', confirmPassword: 'Good#Pass123', role: 'admin', status: 'active', isVerified: true, emailVerified: true } });
  check('sign-up ignores role/status/verification fields', spoofReg.status === 201 && spoofReg.data.user.role === 'student' && spoofReg.data.user.isVerified === false && spoofReg.data.user.emailVerified === false, spoofReg.data?.user);
  const spoofProfile = await api('PUT', '/profile', { token: bilal.token, body: { bio: 'Building things on weekends.', role: 'admin', status: 'active', moderation: { riskScore: 0 }, userId: asha.id } });
  check('profile update ignores role/userId', spoofProfile.status === 200 && (await db.collection('users').findOne({ _id: oid(bilal.id) })).role === 'student', spoofProfile.status);
  check("profile update with another userId never touches that student", (await db.collection('users').findOne({ _id: oid(asha.id) })).bio !== 'Building things on weekends.');
  const forgedRole = jwt.sign({ sid: jwt.decode(bilal.token).sid, role: 'admin' }, JWT_SECRET, { algorithm: 'HS256', issuer: 'campusx-api', audience: 'campusx-app', subject: bilal.id, expiresIn: 600 });
  check('role inside a valid token is ignored (role read from the database) → 403', (await api('GET', '/admin/session', { token: forgedRole })).status === 403);
  check('role headers from the client are ignored → 403', (await api('GET', '/admin/session', { token: bilal.token, headers: { 'x-user-role': 'admin', 'x-role': 'admin' } })).status === 403);

  // ------------------------------------------------------------------ ownership
  section('Resource ownership');
  const editOther = await api('PUT', `/posts/${ashaPostId}`, { token: bilal.token, body: { content: 'Hijacked post content that should never be saved by another student.' } });
  check("student can't edit another student's post", [403, 404].includes(editOther.status), editOther.status);
  const deleteOther = await api('DELETE', `/posts/${ashaPostId}`, { token: bilal.token });
  check("student can't delete another student's post", [403, 404].includes(deleteOther.status), deleteOther.status);
  const postAfter = await db.collection('posts').findOne({ _id: oid(ashaPostId) });
  check('the post is untouched', postAfter.content.startsWith('Robotics club') && !postAfter.deletedAt && postAfter.status !== 'deleted', postAfter.status);
  const delProject = await api('DELETE', `/projects/${ashaProjectId}`, { token: bilal.token });
  check("student can't delete another student's project", [403, 404].includes(delProject.status), delProject.status);
  const editProject = await api('PUT', `/projects/${ashaProjectId}`, { token: bilal.token, body: { title: 'Stolen project' } });
  check("student can't edit another student's project", [403, 404].includes(editProject.status), editProject.status);
  check('the project is untouched', (await db.collection('projects').findOne({ _id: oid(ashaProjectId) })).title === 'Campus Bus Tracker');
  const editAch = await api('PUT', `/achievements/${ashaAchievementId}`, { token: bilal.token, body: { title: 'Winner, Smart India Hackathon' } });
  check("student can't edit another student's achievement", [403, 404].includes(editAch.status), editAch.status);
  const proofOther = await upload(`/achievements/${ashaAchievementId}/proof`, bilal.token, 'proof', [{ bytes: JPEG, type: 'image/jpeg', name: 'proof.jpg' }]);
  check("student can't add proof to another student's achievement", [403, 404].includes(proofOther.status), proofOther.status);
  const editComment = await api('PUT', `/comments/${ashaCommentId}`, { token: bilal.token, body: { content: 'Changed by someone else' } });
  check("student can't edit another student's comment", [403, 404].includes(editComment.status), editComment.status);
  check("student can't delete another student's comment", [403, 404].includes((await api('DELETE', `/comments/${ashaCommentId}`, { token: bilal.token })).status));
  const authorSpoof = await api('POST', '/posts', { token: bilal.token, body: { content: 'Study group for compilers tonight at the library reading room, all welcome.', visibility: 'public', author: asha.id, authorId: asha.id, userId: asha.id } });
  check('new content always belongs to the signed-in student (author fields ignored)', authorSpoof.status === 201 && String((await db.collection('posts').findOne({ _id: oid(authorSpoof.data.post.id) })).author) === bilal.id, authorSpoof.body);

  // ------------------------------------------------------------------ input validation and injection
  section('Input: NoSQL injection, prototype pollution, payloads');
  const injLogin = await api('POST', '/auth/login', { ip: freshIp(), body: { email: { $ne: null }, password: { $ne: null } } });
  check('login with operator objects → 422, no token', injLogin.status === 422 && !injLogin.data?.accessToken, injLogin.status);
  const injLogin2 = await api('POST', '/auth/login', { ip: freshIp(), body: { email: asha.email, password: { $gt: '' } } });
  check('password as an operator object → 422', injLogin2.status === 422, injLogin2.status);
  const injQuery = await api('GET', '/posts?visibility[$ne]=public&author[$exists]=true', { token: bilal.token });
  check('operator keys in the query are stripped (no 500)', injQuery.status === 200 || injQuery.status === 422, injQuery.status);
  const injSearch = await api('GET', `/search?q=${encodeURIComponent('.*')}&q[$regex]=.*`, { token: bilal.token });
  check('regex-like search text is treated literally (no 500)', [200, 422].includes(injSearch.status), injSearch.status);
  const redosStarted = Date.now();
  const redos = await api('GET', `/search?q=${encodeURIComponent('(a+)+$ (x|x)*y [[[')}`, { token: bilal.token });
  check('regex special characters answered quickly (escaped)', [200, 422].includes(redos.status) && Date.now() - redosStarted < 3000, [redos.status, Date.now() - redosStarted]);
  const proto = await api('POST', '/posts', { token: bilal.token, raw: '{"content":"Polluting the prototype is not a feature anyone asked for, really.","visibility":"public","__proto__":{"role":"admin"}}', headers: { 'content-type': 'application/json' } });
  check('__proto__ in a JSON body → 400', proto.status === 400, proto.status);
  const ctor = await api('PUT', '/profile', { token: bilal.token, body: { bio: 'x', constructor: { prototype: { isAdmin: true } } } });
  check('constructor.prototype in a JSON body → 400', ctor.status === 400, ctor.status);
  check('__proto__ in the query → 400', (await api('GET', '/posts?__proto__=1', { token: bilal.token })).status === 400);
  check('prototype not polluted on the server (admin API still 403)', (await api('GET', '/admin/session', { token: bilal.token })).status === 403);
  const nul = await api('POST', '/posts', { token: bilal.token, body: { content: 'Hello\u0000world, this has a hidden NUL byte inside it for testing.', visibility: 'public' } });
  check('NUL byte in text → 400', nul.status === 400, nul.status);
  let deep = { value: 'x' };
  for (let level = 0; level < 20; level += 1) deep = { nested: deep };
  check('20-level nested JSON → 400', (await api('PUT', '/profile', { token: bilal.token, body: { bio: 'ok', deep } })).status === 400);
  check('array with 600 items → 400', (await api('PUT', '/profile', { token: bilal.token, body: { skills: Array.from({ length: 600 }, (_, i) => `s${i}`) } })).status === 400);
  const big = await api('POST', '/posts', { token: bilal.token, body: { content: 'x'.repeat(150 * 1024), visibility: 'public' } });
  check('150 KB JSON body → 413', big.status === 413, big.status);
  const badJson = await api('POST', '/posts', { token: bilal.token, raw: '{"content": "unterminated', headers: { 'content-type': 'application/json' } });
  check('invalid JSON → 400 with a safe message', badJson.status === 400 && badJson.body.message === 'Request body contains invalid JSON' && !badJson.text.includes('at JSON.parse'), badJson.body);
  for (const [label, p] of [['post', '/posts/not-an-id'], ['project', '/projects/123'], ['achievement', '/achievements/zzzzzzzzzzzzzzzzzzzzzzzz'], ['anonymous post', '/anonymous/posts/abc'], ['profile', '/profile/%24ne']]) {
    const res = await api('GET', p, { token: bilal.token });
    check(`malformed id (${label}) → 4xx, never 500`, res.status >= 400 && res.status < 500, res.status);
  }
  check('malformed id on admin routes → 422', (await api('GET', '/admin/users/not-an-id', { token: admin.token })).status === 422);
  check('page size above the maximum → 422', (await api('GET', '/posts?limit=100000', { token: bilal.token })).status === 422);
  check('admin page size above the maximum → 422', (await api('GET', '/admin/users?limit=1000', { token: admin.token })).status === 422);
  check('negative page → 422', (await api('GET', '/projects?page=-1', { token: bilal.token })).status === 422);
  const longSearch = await api('GET', `/search?q=${'a'.repeat(5000)}`, { token: bilal.token });
  check('5000-character search → 4xx', longSearch.status >= 400 && longSearch.status < 500, longSearch.status);

  section('Input: XSS and links');
  const xssPost = await api('POST', '/posts', { token: chitra.token, body: { content: 'Check this <script>alert(document.cookie)</script> and <img src=x onerror=alert(1)> out please.', visibility: 'public' } });
  check('post text with markup is kept as plain text (React escapes it)', xssPost.status === 201 && xssPost.data.post.content.includes('<script>') && /application\/json/.test(xssPost.headers.get('content-type')), xssPost.status);
  check('JSON responses are nosniff (never rendered as HTML)', xssPost.headers.get('x-content-type-options') === 'nosniff');
  const xssProject = await api('POST', '/projects', { token: chitra.token, body: { title: 'Totally normal project', shortDescription: 'A tool for <script>alert(1)</script> people.', description: 'Long enough description of a project that tries to sneak markup into the page.', category: 'web' } });
  check('project text with HTML tags → 422', xssProject.status === 422, xssProject.status);
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'JaVaScRiPt:alert(1)', 'file:///etc/passwd']) {
    const res = await api('POST', '/projects', { token: chitra.token, body: { title: 'Link test project', shortDescription: 'Testing links on projects safely.', description: 'A project used to check that dangerous link schemes are refused by the API.', category: 'web', githubUrl: url } });
    check(`project link ${url.slice(0, 14)}… → 422`, res.status === 422, res.status);
  }
  const certJs = await api('POST', '/achievements', { token: chitra.token, body: { title: 'Certificate link test', type: 'certification', date: '2026-05-01', organization: 'Coursera', certificateUrl: 'javascript:alert(1)' } });
  check('achievement certificate javascript: link → 422', certJs.status === 422, certJs.status);
  const oppBase = { title: 'Campus Security Hackathon 2026', shortDescription: 'A 24 hour hackathon on campus safety tools.', description: 'Build tools that make campus life safer. Teams of up to four students from any branch.', type: 'hackathon', organizer: 'CampusX Tech Club', mode: 'online', applicationDeadline: new Date(Date.now() + 10 * 86400000).toISOString() };
  const oppOk = await api('POST', '/admin/opportunities', { token: admin.token, body: { ...oppBase, applicationUrl: 'https://apply.example.com/form' } });
  check('control: the same opportunity with a normal link is accepted', oppOk.status === 201, oppOk.body);
  const oppJs = await api('POST', '/admin/opportunities', { token: admin.token, body: { ...oppBase, applicationUrl: 'javascript:alert(1)' } });
  check('opportunity application javascript: link → 422', oppJs.status === 422, oppJs.status);
  const oppCreds = await api('POST', '/admin/opportunities', { token: admin.token, body: { ...oppBase, applicationUrl: 'https://user:pass@apply.example.com/form' } });
  check('opportunity link with embedded credentials → 422', oppCreds.status === 422, oppCreds.status);
  const goodLink = await api('POST', '/projects', { token: farah.token, body: { title: 'Hostel Mess Menu', shortDescription: 'Weekly mess menu with ratings.', description: 'Students rate each meal and the mess committee sees weekly trends on a dashboard.', category: 'web', githubUrl: 'https://github.com/campusx/mess-menu' } });
  check('normal https link accepted unchanged', goodLink.status === 201 && goodLink.data.project.githubUrl === 'https://github.com/campusx/mess-menu', goodLink.body);

  // ------------------------------------------------------------------ uploads
  section('Upload security');
  const uploadIp = freshIp();
  const exeName = await upload('/profile/avatar', esha.token, 'photo', [{ bytes: JPEG, type: 'image/jpeg', name: 'avatar.exe' }], { ip: uploadIp });
  check('image with an .exe name → 415', exeName.status === 415, exeName.body);
  const disguised = await upload('/profile/avatar', esha.token, 'photo', [{ bytes: JPEG, type: 'image/jpeg', name: 'photo.php.jpg' }], { ip: uploadIp });
  check('double extension photo.php.jpg → 415', disguised.status === 415, disguised.body);
  const exeContent = await upload('/profile/avatar', esha.token, 'photo', [{ bytes: EXE, type: 'image/png', name: 'photo.png' }], { ip: uploadIp });
  check('Windows executable named photo.png → 415 (content check)', exeContent.status === 415, exeContent.body);
  const svg = await upload('/profile/avatar', esha.token, 'photo', [{ bytes: SVG, type: 'image/svg+xml', name: 'logo.svg' }], { ip: uploadIp });
  check('SVG (scriptable) → 415', svg.status === 415, svg.status);
  const textAsPng = await upload('/profile/avatar', esha.token, 'photo', [{ bytes: Buffer.from('#!/bin/sh\nrm -rf /\n'.repeat(4)), type: 'image/png', name: 'image.png' }], { ip: uploadIp });
  check('script content declared as PNG → 415', textAsPng.status === 415, textAsPng.status);
  const ctrlName = await upload('/profile/avatar', esha.token, 'photo', [{ bytes: JPEG, type: 'image/jpeg', name: 'pho\u0007to.jpg' }], { ip: uploadIp });
  check('control character in the file name → refused as unreadable (400, never 500)', ctrlName.status === 400 && ctrlName.body.message === 'The upload could not be read. Please try again.', [ctrlName.status, ctrlName.body]);
  const noBoundary = await api('POST', '/profile/avatar', { token: esha.token, ip: uploadIp, raw: '--x\r\nContent-Disposition: form-data; name="photo"\r\n\r\nabc', headers: { 'content-type': 'multipart/form-data' } });
  check('multipart body without a boundary → 400, never 500', noBoundary.status === 400, [noBoundary.status, noBoundary.body]);
  const cutShort = await api('POST', '/profile/avatar', { token: esha.token, ip: uploadIp, raw: '--b\r\nContent-Disposition: form-data; name="photo"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\nÿØÿ', headers: { 'content-type': 'multipart/form-data; boundary=b' } });
  check('multipart body cut short → 400, never 500', cutShort.status === 400, [cutShort.status, cutShort.body]);
  const tooBig = await upload('/profile/avatar', esha.token, 'photo', [{ bytes: Buffer.concat([JPEG, Buffer.alloc(6 * 1024 * 1024)]), type: 'image/jpeg', name: 'huge.jpg' }], { ip: uploadIp });
  check('6 MB avatar (limit 5 MB) → 413', tooBig.status === 413, tooBig.status);
  const okName = await upload('/profile/avatar', esha.token, 'photo', [{ bytes: PNG, type: 'image/jpeg', name: 'Node.js.jpg' }], { ip: uploadIp });
  check('ordinary image (PNG saved as .jpg, dotted name) passes every check (then 503: no Cloudinary in tests)', okName.status === 503, okName.status);
  const blobName = await upload('/profile/avatar', esha.token, 'photo', [{ bytes: JPEG, type: 'image/jpeg', name: 'blob' }], { ip: uploadIp });
  check('name without an extension ("blob") passes the checks', blobName.status === 503, blobName.status);
  const eshaAch = await api('POST', '/achievements', { token: esha.token, body: { title: 'Best Paper, IEEE Student Symposium', type: 'award', date: '2026-03-12', organization: 'IEEE' } });
  const eshaAchId = eshaAch.data?.achievement?.id;
  check('seed: Esha achievement for proof uploads', eshaAch.status === 201, eshaAch.body);
  for (const [label, bytes] of [['JavaScript', PDF_JS], ['#-escaped /J#61vaScript', PDF_JS_ESCAPED], ['Launch action', PDF_LAUNCH]]) {
    const res = await upload(`/achievements/${eshaAchId}/proof`, esha.token, 'proof', [{ bytes, type: 'application/pdf', name: 'certificate.pdf' }], { ip: uploadIp });
    check(`PDF proof with ${label} → 415`, res.status === 415, res.body);
  }
  const plainPdf = await upload(`/achievements/${eshaAchId}/proof`, esha.token, 'proof', [{ bytes: PDF_PLAIN, type: 'application/pdf', name: 'certificate.pdf' }], { ip: uploadIp });
  check('plain PDF proof passes the checks (then 503: no Cloudinary in tests)', plainPdf.status === 503, plainPdf.status);
  const pdfExe = await upload(`/achievements/${eshaAchId}/proof`, esha.token, 'proof', [{ bytes: PDF_PLAIN, type: 'application/pdf', name: 'certificate.exe.pdf' }], { ip: uploadIp });
  check('PDF named certificate.exe.pdf → 415', pdfExe.status === 415, pdfExe.status);
  const postMedia = await upload('/posts', esha.token, 'media', [{ bytes: EXE, type: 'video/mp4', name: 'clip.mp4' }], { ip: uploadIp });
  check('executable declared as MP4 post video → 415', postMedia.status === 415, postMedia.status);
  const multipartProto = new FormData();
  multipartProto.append('category', 'question');
  multipartProto.append('title', 'Is the library open on Sunday?');
  multipartProto.append('content', 'Wanted to check whether the central library opens on Sundays during exams.');
  multipartProto.append('__proto__', 'x');
  const mpProto = await api('POST', '/anonymous/posts', { token: esha.token, raw: multipartProto });
  check('__proto__ multipart field → 400', mpProto.status === 400, mpProto.status);
  const uploadTexts = [exeName, disguised, exeContent, okName, plainPdf].map((res) => res.text).join('\n');
  check('upload errors never reveal server paths', !/[A-Z]:\\|\/uploads\/|backend[\\/]uploads|node_modules/i.test(uploadTexts), uploadTexts.slice(0, 300));
  await sleep(1500);
  const leftovers = fs.readdirSync(path.join(BACKEND, 'uploads')).filter((name) => !uploadsBefore.has(name) && name !== '.gitkeep');
  check('rejected and failed uploads leave no temporary files', leftovers.length === 0, leftovers);
  const uploadLog = apiLog();
  check('rejected uploads logged as UPLOAD_REJECTED (reasons, no names)', /Security: UPLOAD_REJECTED ip=\S+ \{"reason":"extension_not_allowed"\}/.test(uploadLog) && /"reason":"disguised_extension"/.test(uploadLog) && /"reason":"pdf_active_content"/.test(uploadLog) && !uploadLog.includes('photo.php.jpg'));

  // ------------------------------------------------------------------ anonymous privacy
  section('Anonymous privacy');
  const anon = await api('POST', '/anonymous/posts', { token: asha.token, body: { category: 'canteen', title: 'Canteen queues at lunch', content: 'The lunch queue at the main canteen takes thirty minutes most days; a second counter would help a lot.' } });
  check('anonymous post created', anon.status === 201, anon.body);
  const anonId = anon.data.post.id;
  const identity = [asha.id, asha.email, 'Asha', 'Rao', 'S1601'];
  const leaks = (value) => identity.filter((needle) => JSON.stringify(value).includes(needle));
  check('author sees no identity fields in their own response', leaks(anon.body).length === 0, leaks(anon.body));
  const anonList = await api('GET', '/anonymous/posts', { token: bilal.token });
  const listed = anonList.data.posts.find((post) => post.id === anonId);
  check('listed for other students', Boolean(listed));
  check('list item carries no author identity', leaks(listed).length === 0 && !('author' in listed) && listed.isOwner === false, listed);
  const anonOne = await api('GET', `/anonymous/posts/${anonId}`, { token: bilal.token });
  check('single anonymous post carries no author identity', anonOne.status === 200 && leaks(anonOne.body).length === 0, leaks(anonOne.body));
  const anonComment = await api('POST', `/anonymous/posts/${anonId}/comments`, { token: bilal.token, body: { content: 'Agreed, the second counter near the library block used to work well.' } });
  check('anonymous comment created', anonComment.status === 201, anonComment.body);
  const comments = await api('GET', `/anonymous/posts/${anonId}/comments`, { token: chitra.token });
  check('anonymous comments carry no commenter identity', comments.status === 200 && !JSON.stringify(comments.body).includes(bilal.id) && !JSON.stringify(comments.body).includes('Bilal'), comments.body);
  const scanAnonymous = (value, found = []) => {
    if (Array.isArray(value)) value.forEach((item) => scanAnonymous(item, found));
    else if (value && typeof value === 'object') {
      if (value.anonymous === true || value.id === anonId) found.push(value);
      Object.values(value).forEach((item) => scanAnonymous(item, found));
    }
    return found;
  };
  const searchContent = await api('GET', '/search?q=canteen%20queue', { token: chitra.token });
  const searchJson = JSON.stringify(searchContent.body);
  check('search finds the anonymous post by its text', searchContent.status === 200 && searchJson.includes(anonId), searchContent.status);
  const anonInSearch = scanAnonymous(searchContent.data);
  check('anonymous search results carry no author identity', anonInSearch.length >= 1 && anonInSearch.every((item) => leaks(item).length === 0 && !('author' in item)), anonInSearch.slice(0, 2));
  const searchName = await api('GET', '/search?q=Asha%20Rao', { token: chitra.token });
  check("searching the author's name never returns their anonymous post", searchName.status === 200 && !JSON.stringify(searchName.body).includes(anonId));
  const recs = [await api('GET', '/recommendations', { token: chitra.token }), await api('GET', '/recommendations/discover', { token: chitra.token })];
  const anonymousRecs = recs.flatMap((res) => scanAnonymous(res.data));
  check('recommendations reachable', recs.every((res) => res.status === 200), recs.map((res) => res.status));
  check('anonymous items in recommendations carry no author identity', anonymousRecs.every((item) => leaks(item).length === 0 && !('author' in item)), anonymousRecs.slice(0, 2));
  await sleep(800);
  const ashaNotes = await api('GET', '/notifications', { token: asha.token });
  const commentNote = ashaNotes.data.notifications.find((note) => note.type === 'ANONYMOUS_POST_COMMENTED');
  check('author notified: "Someone commented", no actor', commentNote && commentNote.actor === null && /someone/i.test(commentNote.message) && !JSON.stringify(commentNote).includes(bilal.id) && !JSON.stringify(commentNote).includes('Bilal'), commentNote);
  const bilalNotes = await api('GET', '/notifications', { token: bilal.token });
  check("commenter's notifications never mention the author", leaks(bilalNotes.data).length === 0, leaks(bilalNotes.data));
  const anonReport = await api('POST', '/reports', { token: chitra.token, body: { targetType: 'anonymousPost', targetId: anonId, reason: 'privacy_violation', description: 'Might identify canteen staff.' } });
  check('anonymous post reported', anonReport.status === 201, anonReport.body);
  check('report response carries no author', leaks(anonReport.body).length === 0);
  const queue = await api('GET', '/admin/moderation?status=all', { token: mod.token });
  const anonCase = queue.data.cases.find((item) => item.targetType === 'anonymousPost' && item.targetId === anonId);
  check('moderation case opened for the anonymous post', Boolean(anonCase));
  const caseDetail = await api('GET', `/admin/moderation/${anonCase.id}`, { token: mod.token });
  check('staff case view: author "anonymous", no identity', caseDetail.data.target.author === 'anonymous' && leaks(caseDetail.body).length === 0, leaks(caseDetail.body));
  const reports = await api('GET', '/admin/reports?status=all', { token: mod.token });
  check('staff report list: no anonymous author identity', reports.status === 200 && !JSON.stringify(reports.body).includes(asha.id));
  const content = await api('GET', '/admin/content?type=anonymousPost', { token: mod.token });
  check('staff content list (anonymous posts): no author identity', content.status === 200 && leaks(content.body).length === 0, leaks(content.body));
  const userDetail = await api('GET', `/admin/users/${asha.id}`, { token: admin.token });
  check("admin user detail never links the student's anonymous posts", userDetail.status === 200 && !JSON.stringify(userDetail.body).includes(anonId));
  const revealStudent = await api('POST', `/admin/moderation/${anonCase.id}/reveal-author`, { token: bilal.token, body: { reason: 'I really want to know who wrote it.' } });
  check('student cannot reveal → 403', revealStudent.status === 403);
  const revealNoReason = await api('POST', `/admin/moderation/${anonCase.id}/reveal-author`, { token: mod.token, body: {} });
  check('reveal without a reason → 422', revealNoReason.status === 422);
  const reveal = await api('POST', `/admin/moderation/${anonCase.id}/reveal-author`, { token: mod.token, body: { reason: 'Privacy report about canteen staff; checking the author for follow-up.' } });
  check('authorized moderation flow reveals the author', reveal.status === 200 && reveal.data.author.id === asha.id, reveal.body);
  check('reveal audited', (await auditRows({ action: 'ANONYMOUS_AUTHOR_REVEALED', targetId: oid(anonId) })).length === 1);

  section('Anonymous privacy: rate-limit events');
  const anonTexts = [
    ['hostel', 'Hostel water timings', 'Hot water in block C only runs from six to seven in the morning, which is too short for everyone.'],
    ['library', 'Library seats in exam week', 'During exam week the reading room fills by eight; maybe open the seminar hall as overflow space.'],
    ['academic', 'Lab manual corrections', 'The digital electronics lab manual has three wrong pin diagrams that confuse everyone each year.'],
    ['event', 'Fest volunteer passes', 'Volunteers for the cultural fest did not get passes for the final night, please sort it before next year.'],
    ['suggestion', 'Cycle stand near gate two', 'A covered cycle stand near gate two would stop bikes from rusting through the monsoon months.'],
  ];
  const anonStatuses = [];
  for (const [category, title, text] of anonTexts) anonStatuses.push((await api('POST', '/anonymous/posts', { token: asha.token, body: { category, title, content: text } })).status);
  check('Anonymous Zone post limit reached → 429', anonStatuses.includes(429), anonStatuses);
  await sleep(300);
  const anonLimitAudit = await auditRows({ action: 'RATE_LIMIT_EXCEEDED', targetId: oid(asha.id) });
  check('Anonymous Zone limit hit is never audited against the student', anonLimitAudit.length === 0, anonLimitAudit);
  const anonLog = apiLog().split('\n').filter((line) => line.includes('RATE_LIMIT_EXCEEDED') && line.includes('anonymous'));
  check('Anonymous Zone limit logged without student or address', anonLog.length >= 1 && anonLog.every((line) => !line.includes(asha.id) && !/ ip=/.test(line)), anonLog);
  check('Anonymous Zone limit never feeds the abuse pattern', !((await db.collection('users').findOne({ _id: oid(asha.id) })).moderation?.flags ?? []).includes('rate_limit_abuse'));
  await api('GET', '/anonymous/posts', { token: wrongSecret, ip: '10.98.0.1' });
  await api('POST', '/anonymous/posts', { token: bilal.token, ip: '10.98.0.2', raw: '{"category":"other","title":"Prototype test title","content":"Long enough content for an anonymous post test.","__proto__":{"x":1}}', headers: { 'content-type': 'application/json' } });
  await sleep(300);
  const zoneLog = apiLog();
  check('Anonymous Zone: forged-token and screened-request events never record the address', /INVALID_TOKEN \{"error":"JsonWebTokenError","path":"\/api\/v1\/anonymous"\}/.test(zoneLog) && !zoneLog.includes('ip=10.98.0.1') && !zoneLog.includes('ip=10.98.0.2'), zoneLog.split('\n').filter((line) => /10\.98\.0|anonymous"/.test(line) && line.includes('Security')));

  // ------------------------------------------------------------------ rate limiting
  section('Rate limiting');
  const stuffingIp = '10.200.0.1';
  const stuffing = [];
  for (let attempt = 0; attempt < 21; attempt += 1) stuffing.push((await login(`victim${attempt}@sec.campusx.dev`, 'Guess#123', stuffingIp)).status);
  check('login abuse from one address: 20 failures then 429', stuffing.slice(0, 20).every((status) => status === 401) && stuffing[20] === 429, stuffing);
  check('that address is blocked even with the right password', (await login(chitra.email, PASSWORD, stuffingIp)).status === 429);
  check('students on other addresses can still sign in', (await login(chitra.email, PASSWORD, freshIp())).status === 200);
  await sleep(200);
  check('login limit logged with the address (no account)', /Security: RATE_LIMIT_EXCEEDED ip=10\.200\.0\.1 \{"limiter":"login"/.test(apiLog()));

  const abuser = await register('Hari', 'Verma', 'hari.verma@sec.campusx.dev', { roll: 'S1609' });
  const reportStatuses = [];
  for (let index = 0; index < 11; index += 1) reportStatuses.push((await api('POST', '/reports', { token: abuser.token, body: { targetType: 'post', targetId: ashaPostId, reason: 'spam' } })).status);
  check('report abuse: 11th report in an hour → 429', reportStatuses[10] === 429 && reportStatuses.slice(0, 10).every((status) => status !== 429), reportStatuses);
  const searchStatuses = [];
  for (let index = 0; index < 61; index += 1) searchStatuses.push((await api('GET', `/search?q=robot${index % 3}`, { token: abuser.token })).status);
  check('search abuse: 61st search in a minute → 429', searchStatuses[60] === 429 && searchStatuses.slice(0, 60).every((status) => status === 200), searchStatuses.filter((s) => s !== 200));
  await sleep(300);
  const limitAudit = await auditRows({ action: 'RATE_LIMIT_EXCEEDED', targetId: oid(abuser.id) });
  check('limit hits audited once per limiter (reports, search)', limitAudit.length === 2 && limitAudit.some((row) => row.metadata.limiter === 'trust-reports') && limitAudit.some((row) => row.metadata.limiter === 'search-search'), limitAudit.map((row) => row.metadata));
  check('no abuse pattern after two limit episodes', (await auditRows({ action: 'ABUSE_PATTERN', targetId: oid(abuser.id) })).length === 0);
  const prefStatuses = [];
  for (let index = 0; index < 31; index += 1) prefStatuses.push((await api('PUT', '/notifications/preferences', { token: abuser.token, body: { likes: index % 2 === 0 } })).status);
  check('third limiter reached (notification settings) → 429', prefStatuses[30] === 429, prefStatuses.filter((s) => s !== 200));
  await sleep(500);
  const abuse = await auditRows({ action: 'ABUSE_PATTERN', targetId: oid(abuser.id) });
  check('three limit episodes in a day → ABUSE_PATTERN audited once', abuse.length === 1 && abuse[0].metadata.limitEpisodes === 3, abuse);
  const abuserDoc = await db.collection('users').findOne({ _id: oid(abuser.id) });
  check('abuse pattern feeds Trust & Safety: flag + small risk bump, account still active', abuserDoc.moderation?.flags?.includes('rate_limit_abuse') && abuserDoc.moderation.riskScore >= 5 && abuserDoc.status === 'active', abuserDoc.moderation);
  check('the abusing student still has normal access (no ban)', (await api('GET', '/auth/me', { token: abuser.token })).status === 200);
  const handshakeIp = '10.201.0.1';
  const handshakeResults = [];
  for (let index = 0; index < 62; index += 1) {
    const { socket, error } = await connectSocket(farah.token, { ip: handshakeIp });
    handshakeResults.push(error);
    socket.close();
  }
  check('socket handshakes limited per address (61st+ refused)', handshakeResults.slice(0, 60).every((error) => error !== 'rate-limited') && handshakeResults.slice(60).includes('rate-limited'), handshakeResults.slice(55));

  // ------------------------------------------------------------------ admin security
  section('Admin security: status endpoint');
  const status = await api('GET', '/admin/security/status', { token: admin.token });
  check('admin → security status 200, no-store', status.status === 200 && status.headers.get('cache-control') === 'no-store', status.body);
  const statusText = status.text;
  for (const secret of [JWT_SECRET, 'mongodb://', '27019', 'campusx_phase15_test', 'cloudinary://', PASSWORD, 'D:\\\\CampusX', 'node_modules']) {
    check(`security status never contains ${secret.slice(0, 12)}…`, !statusText.includes(secret));
  }
  check('security status reports protections and services', status.data.protections.cors.mode === 'allowlist' && status.data.authentication.algorithm === 'HS256' && status.data.authentication.jwtSecret === 'configured' && ['connected'].includes(status.data.services.database) && status.data.rateLimits.store === 'memory', status.data);
  check('security status counts recent security events', status.data.events.auditedLast24Hours.ACCOUNT_LOCKED >= 1 && status.data.events.sinceStart.RATE_LIMIT_EXCEEDED.recorded >= 1, status.data.events);

  section('Admin security: role changes');
  const promote = await setRoleByScript(esha.email, 'moderator');
  check('role change script succeeds', promote.code === 0 && /now "moderator"/.test(promote.output), promote);
  const roleAudit = await auditRows({ action: 'ROLE_CHANGED', targetId: oid(esha.id) });
  check('ROLE_CHANGED audited (student → moderator, system actor)', roleAudit.length === 1 && roleAudit[0].previousStatus === 'student' && roleAudit[0].newStatus === 'moderator' && roleAudit[0].actorRole === 'system', roleAudit);
  check('promoted moderator gets moderator APIs on the next request', (await api('GET', '/admin/moderation', { token: esha.token })).status === 200);

  // ------------------------------------------------------------------ sockets
  section('Socket.IO security');
  const noTokenSocket = await connectSocket(undefined);
  check('no token → handshake refused', noTokenSocket.error === 'unauthorized', noTokenSocket.error);
  noTokenSocket.socket.close();
  const fakeSocket = await connectSocket(wrongSecret);
  check('forged token → handshake refused', fakeSocket.error === 'unauthorized', fakeSocket.error);
  fakeSocket.socket.close();
  const expiredSocket = await connectSocket(expired);
  check('expired token → handshake refused', expiredSocket.error === 'unauthorized', expiredSocket.error);
  expiredSocket.socket.close();
  const ashaSock = (await connectSocket(asha.token)).socket;
  const spoofSock = await connectSocket(bilal.token, { auth: { userId: asha.id, role: 'admin', room: 'staff' } });
  check('fake userId/role in the handshake still connects as the real student', !spoofSock.error, spoofSock.error);
  const eshaSock = (await connectSocket(esha.token)).socket;
  const modSock = (await connectSocket(mod.token)).socket;
  const got = { asha: [], spoof: [], esha: [], mod: [] };
  ashaSock.on('notification:new', (payload) => got.asha.push(payload));
  spoofSock.socket.on('notification:new', (payload) => got.spoof.push(payload));
  for (const event of ['admin:newReport', 'admin:newModerationCase', 'admin:systemAlert']) {
    spoofSock.socket.on(event, (payload) => got.spoof.push(payload));
    eshaSock.on(event, (payload) => got.esha.push(payload));
    modSock.on(event, (payload) => got.mod.push(payload));
  }
  spoofSock.socket.emit('join', 'staff');
  spoofSock.socket.emit('join', `user:${asha.id}`);
  spoofSock.socket.emit('subscribe', { room: 'staff' });
  await sleep(200);
  const likePost = await api('POST', `/posts/${ashaPostId}/like`, { token: farah.token });
  check('seed: like on Asha post', likePost.status === 200, likePost.status);
  const staffPost = await api('POST', '/posts', { token: dev.token, body: { content: 'Selling my old drafter and lab coat, both in good condition, ping me before Friday.', visibility: 'public' } });
  await api('POST', '/reports', { token: farah.token, body: { targetType: 'post', targetId: staffPost.data.post.id, reason: 'spam' } });
  await sleep(1200);
  check("the real recipient gets her notification", got.asha.length >= 1, got.asha.length);
  check("a spoofed userId never receives another student's notifications", got.spoof.filter((payload) => JSON.stringify(payload).includes(ashaPostId)).length === 0, got.spoof);
  check('client "join" events cannot enter the staff room', got.spoof.every((payload) => !('reportId' in payload) && !('caseId' in payload)), got.spoof);
  check('moderator receives admin events', got.mod.some((payload) => 'reportId' in payload), got.mod);
  check('promoted moderator (role read at handshake) receives admin events', got.esha.some((payload) => 'reportId' in payload), got.esha);
  // Demote through the script; the next staff event re-checks the room against the database.
  const demote = await setRoleByScript(esha.email, 'student');
  check('demotion script succeeds', demote.code === 0, demote);
  got.esha.length = 0;
  got.mod.length = 0;
  const staffPost2 = await api('POST', '/posts', { token: chitra.token, body: { content: 'Bootcamp seats are open for the weekend coding sprint, sign up at the club desk near the canteen.', visibility: 'public' } });
  await api('POST', '/reports', { token: dev.token, body: { targetType: 'post', targetId: staffPost2.data.post.id, reason: 'spam' } });
  await sleep(1200);
  check('after demotion: no more admin events (left the staff room)', got.esha.length === 0, got.esha);
  check('after demotion: still connected for own notifications', eshaSock.connected);
  check('moderators keep receiving admin events', got.mod.some((payload) => 'reportId' in payload), got.mod);
  check('demoted account: admin API refused at once', (await api('GET', '/admin/moderation', { token: esha.token })).status === 403);
  const bigSock = (await connectSocket(chitra.token)).socket;
  const bigDisconnected = new Promise((resolve) => {
    bigSock.on('disconnect', () => resolve(true));
    setTimeout(() => resolve(false), 4000);
  });
  bigSock.emit('anything', 'x'.repeat(40 * 1024));
  check('oversized client message (40 KB) closes the connection', await bigDisconnected);
  for (const socket of [ashaSock, spoofSock.socket, eshaSock, modSock, bigSock]) socket.close();

  // ------------------------------------------------------------------ logs
  section('Logs');
  const fullLog = apiLog();
  check('server log has no passwords, tokens or bcrypt hashes', !fullLog.includes(PASSWORD) && !fullLog.includes(asha.token) && !/\$2[aby]\$12\$/.test(fullLog) && !/eyJ[\w-]{10,}\.eyJ[\w-]{10,}\./.test(fullLog));
  check('server log has no emails in security events', fullLog.split('\n').filter((line) => line.includes('Security:')).every((line) => !/@sec\.campusx\.dev/.test(line)));
  check('server log never prints the JWT secret or database URI', !fullLog.includes(JWT_SECRET) && !fullLog.includes(stack.mongoUri));
  // ------------------------------------------------------------------ production configuration
  // Separate backend processes in production mode (port 5093), using this run's test mongod.
  section('Production configuration (separate processes)');
  const PROD_PORT = PROD_API_PORT;
  const PROD_SECRET = 'b5e1f0c4a8d94e2f9c7b6a5d4e3f2a1b0c9d8e7f6a5b4c3d';
  const PROD_DB = `${TEST_DB_PREFIX}campusx_test_production_${Date.now()}`;
  const prodBase = { NODE_ENV: 'production', PORT: String(PROD_PORT), MONGODB_URI: PROD_DB, CLIENT_URL: 'https://campusx.example.com', JWT_SECRET: PROD_SECRET, RATE_LIMIT_MAX: '1000' };
  const startBackend = (env) => {
    const child = spawn(process.execPath, ['--import', HOOK, 'server.js'], { cwd: BACKEND, env: { ...process.env, CAMPUSX_TEST_ENV: JSON.stringify(env) }, windowsHide: true });
    const run = { child, output: '', exited: false, code: null };
    child.stdout.on('data', (chunk) => (run.output += chunk));
    child.stderr.on('data', (chunk) => (run.output += chunk));
    run.done = new Promise((resolve) => child.on('exit', (code) => resolve(Object.assign(run, { exited: true, code }))));
    return run;
  };
  const refused = async (env) => {
    const run = startBackend(env);
    const timeout = sleep(20000).then(() => run);
    await Promise.race([run.done, timeout]);
    if (!run.exited) run.child.kill();
    return run;
  };
  for (const [label, env, expected] of [
    ['missing JWT_SECRET', { ...prodBase, JWT_SECRET: '' }, /Missing required environment variables: JWT_SECRET/],
    ['short JWT_SECRET', { ...prodBase, JWT_SECRET: 'short-secret' }, /at least 32 characters/],
    ['placeholder JWT_SECRET', { ...prodBase, JWT_SECRET: 'replace_with_secure_secret_0123456789abcdef' }, /Replace the example values of JWT_SECRET/],
    ['CORS wildcard', { ...prodBase, CLIENT_URL: '*' }, /CLIENT_URL must list exact origins/],
    ['plain-http public origin', { ...prodBase, CLIENT_URL: 'http://campusx.example.com' }, /must use https in production/],
    ['long access tokens', { ...prodBase, JWT_EXPIRES_IN: '7d' }, /JWT_EXPIRES_IN must be 1h or less in production/],
  ]) {
    const run = await refused(env);
    check(`production refuses to start: ${label}`, run.exited && run.code !== 0 && expected.test(run.output), run.output.slice(-300));
    check(`refusal output never prints the secret (${label})`, !run.output.includes(PROD_SECRET) && !run.output.includes('replace_with_secure_secret_0123456789abcdef'));
  }
  const devWildcard = await refused({ ...prodBase, NODE_ENV: 'development', CLIENT_URL: '*' });
  check('development also refuses CLIENT_URL=*', devWildcard.exited && /CLIENT_URL must list exact origins/.test(devWildcard.output), devWildcard.output.slice(-200));

  const prod = startBackend(prodBase);
  let prodHealth = null;
  for (let attempt = 0; attempt < 60 && !prodHealth && !prod.exited; attempt += 1) {
    await sleep(500);
    prodHealth = await fetch(`http://127.0.0.1:${PROD_PORT}/api/v1/health`).catch(() => null);
  }
  check('production server starts with a valid configuration', Boolean(prodHealth?.ok), prod.output.slice(-300));
  if (prodHealth?.ok) {
    check('production: HSTS (1 year, subdomains)', /max-age=31536000; includeSubDomains/.test(prodHealth.headers.get('strict-transport-security') ?? ''), prodHealth.headers.get('strict-transport-security'));
    const prod404 = await fetch(`http://127.0.0.1:${PROD_PORT}/api/v1/nope`);
    const prod404Body = await prod404.json();
    check('production: errors carry no debug details or stack', prod404.status === 404 && !('debug' in prod404Body), prod404Body);
    const prodBad = await fetch(`http://127.0.0.1:${PROD_PORT}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad json' });
    const prodBadBody = await prodBad.json();
    check('production: invalid JSON → 400 with a safe message only', prodBad.status === 400 && !('debug' in prodBadBody) && prodBadBody.message === 'Request body contains invalid JSON', prodBadBody);
    const prodCors = await fetch(`http://127.0.0.1:${PROD_PORT}/api/v1/health`, { headers: { origin: 'http://localhost:5174' } });
    check('production: CORS answers only the configured origin', !prodCors.headers.get('access-control-allow-origin'));
    const prodCorsOk = await fetch(`http://127.0.0.1:${PROD_PORT}/api/v1/health`, { headers: { origin: 'https://campusx.example.com' } });
    check('production: configured origin allowed', prodCorsOk.headers.get('access-control-allow-origin') === 'https://campusx.example.com');
    const prodReg = await fetch(`http://127.0.0.1:${PROD_PORT}/api/v1/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://campusx.example.com' }, body: JSON.stringify({ firstName: 'Prod', lastName: 'Check', email: 'prod.check@sec.campusx.dev', password: 'Good#Pass123', confirmPassword: 'Good#Pass123' }) });
    const cookie = prodReg.headers.get('set-cookie') ?? '';
    check('production: refresh cookie Secure + HttpOnly + SameSite=None', prodReg.status === 201 && /Secure/i.test(cookie) && /HttpOnly/i.test(cookie) && /SameSite=None/i.test(cookie), [prodReg.status, cookie]);
    const prodStatus = await fetch(`http://127.0.0.1:${PROD_PORT}/api/v1/admin/security/status`);
    check('production: security status requires sign-in (401)', prodStatus.status === 401);
  }
  check('production: logs never print the secret or the database URI', !prod.output.includes(PROD_SECRET) && !prod.output.includes(PROD_DB));
  prod.child.kill();
  await sleep(500);
} catch (error) {
  t.check('suite ran to the end without crashing', false, error.stack);
}
await t.finish();
