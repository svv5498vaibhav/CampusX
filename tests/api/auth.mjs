// Authentication lifecycle (Phases 2 and 16, Phase 17 password change): registration, duplicates, sign-in
// success and failure, the current user, logout and session invalidation, invalid/expired/forged tokens,
// inactive, suspended, blocked and deactivated accounts, lockout, unknown emails, and PUT /auth/password
// (validation, rate limit, sessions and sockets, hash, audit, notification, races, a failed update).
import { createRequire } from 'node:module';
import path from 'node:path';
import { BACKEND } from '../lib/paths.mjs';
import { JWT_SECRET, PASSWORD, createSuite, freshIp, jwt, oid, signToken, sleep } from '../lib/harness.mjs';

const bcrypt = createRequire(path.join(BACKEND, 'package.json'))('bcryptjs');

const t = await createSuite('auth');
const { check, section, api, register, login, connectSocket, db } = t;
const users = db.collection('users');
const sessions = db.collection('sessions');
const auditRows = (filter) => db.collection('moderationauditlogs').find(filter).toArray();
const notificationsOf = (id) => db.collection('notifications').find({ recipient: oid(id) }).toArray();
const cookieOf = (res) => res.headers.get('set-cookie')?.split(';')[0];
const sidOf = (token) => jwt.decode(token).sid;
const changePassword = (account, body, options = {}) => api('PUT', '/auth/password', { token: account.token, body, ...options });
const NEW_PASSWORD = 'Fresh#Campus2027';
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const SAFE_USER_LEAKS = /passwordHash|\$2[aby]\$|failedLoginAttempts|lockedUntil|lastLoginIp|registrationIp/;
let n = 0;
// Names allow letters only, so each test student gets a lettered surname (Aa, Ab, ...).
const letters = (i) => String.fromCharCode(65 + Math.floor(i / 26) % 26) + String.fromCharCode(97 + (i % 26));
const student = (first = 'Test') => register(first, `Student${letters((n += 1))}`, { roll: `AUTH${String(n).padStart(3, '0')}` });

try {
  // ------------------------------------------------------------------ registration
  section('Registration');
  const regIp = freshIp();
  const reg = await api('POST', '/auth/register', { ip: regIp, body: { firstName: 'Riya', lastName: 'Sharma', email: '  Riya.Sharma@QA.CampusX.dev ', password: PASSWORD, confirmPassword: PASSWORD, role: 'admin', status: 'active', isVerified: true } });
  check('register → 201 with user and access token', reg.status === 201 && Boolean(reg.data?.accessToken) && reg.data.user?.id, reg.body);
  check('new accounts are always active students (role/status/verification in the body are ignored)', reg.data?.user?.role === 'student' && reg.data.user.status === 'active' && reg.data.user.isVerified === false, reg.data?.user);
  check('email trimmed and lower-cased', reg.data?.user?.email === 'riya.sharma@qa.campusx.dev', reg.data?.user?.email);
  const regCookie = reg.headers.get('set-cookie') ?? '';
  check('register sets the HttpOnly, path-scoped refresh cookie', /^cx_refresh=/.test(regCookie) && /HttpOnly/i.test(regCookie) && /Path=\/api\/v1\/auth/i.test(regCookie) && /SameSite=Lax/i.test(regCookie), regCookie);
  check('register response is no-store and leaks no internals', reg.headers.get('cache-control') === 'no-store' && !SAFE_USER_LEAKS.test(reg.text));
  const riya = { id: reg.data.user.id, email: 'riya.sharma@qa.campusx.dev', token: reg.data.accessToken, cookie: cookieOf(reg) };
  const riyaDoc = await users.findOne({ _id: oid(riya.id) });
  check('stored: bcrypt cost-12 hash, registration address, no plaintext', /^\$2[aby]\$12\$/.test(riyaDoc.passwordHash) && riyaDoc.registrationIp === regIp && !JSON.stringify(riyaDoc).includes(PASSWORD), riyaDoc.registrationIp);
  const regSession = await sessions.findOne({ _id: oid(sidOf(riya.token)) });
  check('a server-side session is created (refresh token stored only as a hash)', regSession && regSession.user.toString() === riya.id && !JSON.stringify(regSession).includes(riya.cookie.split('=')[1]), regSession);

  const invalid = async (body) => (await api('POST', '/auth/register', { ip: freshIp(), body: { firstName: 'Val', lastName: 'Idation', email: `v${(n += 1)}@qa.campusx.dev`, password: PASSWORD, confirmPassword: PASSWORD, ...body } })).status;
  check('missing first name → 422', (await invalid({ firstName: '' })) === 422);
  check('name with markup → 422', (await invalid({ lastName: '<b>Bold</b>' })) === 422);
  check('invalid email → 422', (await invalid({ email: 'not-an-email' })) === 422);
  check('email as an object (operator injection) → 422 or 400', [400, 422].includes(await invalid({ email: { $gt: '' } })));
  check('weak password → 422', (await invalid({ password: 'short1', confirmPassword: 'short1' })) === 422);
  check('confirmation mismatch → 422', (await invalid({ confirmPassword: `${PASSWORD}x` })) === 422);

  section('Duplicate registration');
  const dup = await api('POST', '/auth/register', { ip: freshIp(), body: { firstName: 'Riya', lastName: 'Copy', email: riya.email, password: PASSWORD, confirmPassword: PASSWORD } });
  check('same email → 409 with a field error (known, documented enumeration risk)', dup.status === 409 && dup.body.errors?.[0]?.field === 'email' && !dup.data?.accessToken, dup.body);
  const dupCase = await api('POST', '/auth/register', { ip: freshIp(), body: { firstName: 'Riya', lastName: 'Copy', email: 'RIYA.SHARMA@qa.campusx.dev', password: PASSWORD, confirmPassword: PASSWORD } });
  check('same email in another case → 409', dupCase.status === 409, dupCase.status);
  const raceEmail = 'race.signup@qa.campusx.dev';
  const race = await Promise.all([0, 1, 2].map(() => api('POST', '/auth/register', { ip: freshIp(), body: { firstName: 'Race', lastName: 'Condition', email: raceEmail, password: PASSWORD, confirmPassword: PASSWORD } })));
  check('three simultaneous sign-ups with one email → exactly one 201, the rest 409', race.filter((res) => res.status === 201).length === 1 && race.filter((res) => res.status === 409).length === 2, race.map((res) => res.status));
  check('...and exactly one account exists', (await users.countDocuments({ email: raceEmail })) === 1);
  check('no password hash created for the refused sign-ups', (await users.countDocuments({ email: riya.email })) === 1);

  // ------------------------------------------------------------------ login
  section('Login');
  const ok = await login(riya.email);
  check('correct password → 200 with token, user and refresh cookie', ok.status === 200 && ok.data.accessToken && ok.data.user.id === riya.id && /^cx_refresh=/.test(ok.headers.get('set-cookie') ?? ''), ok.body);
  check('login response is no-store and leaks no internals', ok.headers.get('cache-control') === 'no-store' && !SAFE_USER_LEAKS.test(ok.text));
  check('login is case-insensitive on the email', (await login('  RIYA.Sharma@qa.campusx.dev ')).status === 200);
  const afterLogin = await users.findOne({ _id: oid(riya.id) });
  check('login records lastLoginAt and resets the failure counter', afterLogin.lastLoginAt && afterLogin.failedLoginAttempts === 0);
  const wrong = await login(riya.email, 'Wrong#Password1');
  check('wrong password → 401 "Invalid email or password."', wrong.status === 401 && wrong.body.message === 'Invalid email or password.' && !wrong.data, wrong.body);
  check('missing password → 422', (await api('POST', '/auth/login', { ip: freshIp(), body: { email: riya.email } })).status === 422);
  check('malformed email → 422', (await api('POST', '/auth/login', { ip: freshIp(), body: { email: 'riya', password: PASSWORD } })).status === 422);
  check('password as an object (operator injection) → 422/400, never 200', [400, 422].includes((await api('POST', '/auth/login', { ip: freshIp(), body: { email: riya.email, password: { $ne: 'x' } } })).status));
  await users.updateOne({ _id: oid(riya.id) }, { $set: { failedLoginAttempts: 0 } });

  section('Nonexistent email addresses');
  const ghost = await login('nobody.at.all@qa.campusx.dev', 'Wrong#Password1');
  const known = await login(riya.email, 'Wrong#Password1');
  check('unknown email → the same 401 and message as a wrong password', ghost.status === known.status && ghost.body.message === known.body.message, [ghost.body, known.body]);
  check('unknown email → same response keys as a known one', JSON.stringify(Object.keys(ghost.body).sort()) === JSON.stringify(Object.keys(known.body).sort()));
  const knownTimes = [];
  const ghostTimes = [];
  for (let i = 0; i < 3; i += 1) {
    knownTimes.push((await t.timed('POST', '/auth/login', { ip: freshIp(), body: { email: riya.email, password: `Wrong#${i}timing` } })).ms);
    ghostTimes.push((await t.timed('POST', '/auth/login', { ip: freshIp(), body: { email: `ghost${i}@qa.campusx.dev`, password: `Wrong#${i}timing` } })).ms);
  }
  const ratio = median(ghostTimes) / median(knownTimes);
  check(`unknown email takes about as long as a known one (bcrypt either way; median ratio ${ratio.toFixed(2)})`, median(ghostTimes) > 40 && ratio > 0.4 && ratio < 2.5, { knownTimes, ghostTimes });
  await users.updateOne({ _id: oid(riya.id) }, { $set: { failedLoginAttempts: 0 } });
  await sleep(200);
  check('unknown emails leave no audit rows and never reach the server log', (await auditRows({ 'metadata.email': { $exists: true } })).length === 0 && !t.stack.log().includes('nobody.at.all@qa.campusx.dev') && !t.stack.log().includes('ghost0@qa.campusx.dev'));

  // ------------------------------------------------------------------ current user
  section('Current user');
  const me = await api('GET', '/auth/me', { token: riya.token });
  check('GET /auth/me → 200 with the safe user, no-store', me.status === 200 && me.data.user.id === riya.id && me.headers.get('cache-control') === 'no-store' && !SAFE_USER_LEAKS.test(me.text), me.body);
  check('GET /auth/me without a token → 401', (await api('GET', '/auth/me')).status === 401);
  check('a role written into a forged-but-valid token is ignored (role comes from the database)', (await api('GET', '/auth/me', { token: signToken({ sid: sidOf(riya.token), role: 'admin' }, { subject: riya.id }) })).data?.user?.role === 'student');

  // ------------------------------------------------------------------ logout
  section('Logout and session invalidation');
  const deviceA = await login(riya.email);
  const deviceB = await login(riya.email);
  const tokenA = deviceA.data.accessToken;
  const tokenB = deviceB.data.accessToken;
  const out = await api('POST', '/auth/logout', { token: tokenA, cookie: cookieOf(deviceA) });
  check('logout → 200 and the refresh cookie is cleared', out.status === 200 && /cx_refresh=;/.test(out.headers.get('set-cookie') ?? '') && /Expires=Thu, 01 Jan 1970/i.test(out.headers.get('set-cookie') ?? ''), out.headers.get('set-cookie'));
  check('logged-out access token → 401 straight away', (await api('GET', '/auth/me', { token: tokenA })).status === 401);
  check('logged-out refresh cookie → 401', (await api('POST', '/auth/refresh', { cookie: cookieOf(deviceA) })).status === 401);
  check('session row revoked with reason "logout"', (await sessions.findOne({ _id: oid(sidOf(tokenA)) })).revokedReason === 'logout');
  check('other devices stay signed in', (await api('GET', '/auth/me', { token: tokenB })).status === 200);
  check('logging out twice is harmless (200)', (await api('POST', '/auth/logout', { token: tokenA, cookie: cookieOf(deviceA) })).status === 200);
  check('logout with nothing at all → 200', (await api('POST', '/auth/logout')).status === 200);
  const cookieOnly = await login(riya.email);
  check('logout with only the refresh cookie ends that session', (await api('POST', '/auth/logout', { cookie: cookieOf(cookieOnly) })).status === 200 && (await api('GET', '/auth/me', { token: cookieOnly.data.accessToken })).status === 401);
  const expiredOnly = await login(riya.email);
  const expiredForLogout = signToken({ sid: sidOf(expiredOnly.data.accessToken), role: 'student' }, { subject: riya.id, expiresIn: -60 });
  check('logout with only an expired (authentic) access token still ends that session', (await api('POST', '/auth/logout', { token: expiredForLogout })).status === 200 && (await sessions.findOne({ _id: oid(sidOf(expiredOnly.data.accessToken)) })).revokedAt);
  const forgedLogout = jwt.sign({ sid: sidOf(tokenB) }, 'another-secret-entirely-0123456789-abcdefghijkl', { algorithm: 'HS256', issuer: 'campusx-api', audience: 'campusx-app', subject: riya.id, expiresIn: 600 });
  check("a forged token can't log someone else's session out", (await api('POST', '/auth/logout', { token: forgedLogout })).status === 200 && (await api('GET', '/auth/me', { token: tokenB })).status === 200);

  const rotateStart = await login(riya.email);
  const firstCookie = cookieOf(rotateStart);
  const rotated = await api('POST', '/auth/refresh', { cookie: firstCookie });
  check('refresh → 200, new access token, rotated cookie', rotated.status === 200 && rotated.data.accessToken && cookieOf(rotated) !== firstCookie, rotated.body);
  const raceRefresh = await api('POST', '/auth/refresh', { cookie: firstCookie });
  check('the just-rotated cookie within the grace window → 200 without a new cookie (two tabs)', raceRefresh.status === 200 && !raceRefresh.headers.get('set-cookie'), raceRefresh.status);
  check('refresh without a cookie → 401', (await api('POST', '/auth/refresh')).status === 401);
  check('refresh with a made-up cookie → 401', (await api('POST', '/auth/refresh', { cookie: 'cx_refresh=made-up-token' })).status === 401);

  // ------------------------------------------------------------------ tokens
  section('Invalid, expired and forged tokens');
  const sid = sidOf(tokenB);
  const tokenCases = [
    ['garbage', 'not.a.token'],
    ['expired', signToken({ sid }, { subject: riya.id, expiresIn: -5 })],
    ['signed with another secret', signToken({ sid }, { subject: riya.id, secret: 'not-the-campusx-secret-0123456789-abcdefghijklmn' })],
    ['wrong issuer', signToken({ sid }, { subject: riya.id, issuer: 'someone-else' })],
    ['wrong audience', signToken({ sid }, { subject: riya.id, audience: 'other-app' })],
    ['HS512 instead of HS256', jwt.sign({ sid }, JWT_SECRET, { algorithm: 'HS512', issuer: 'campusx-api', audience: 'campusx-app', subject: riya.id, expiresIn: 600 })],
    ['alg none', `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: riya.id, sid, iss: 'campusx-api', aud: 'campusx-app', exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url')}.`],
    ['no session id', signToken({}, { subject: riya.id })],
    ['a session that does not exist', signToken({ sid: '0123456789abcdef01234567' }, { subject: riya.id })],
    ['a revoked session', signToken({ sid: sidOf(tokenA) }, { subject: riya.id })],
    ['an account that does not exist', signToken({ sid }, { subject: '0123456789abcdef01234567' })],
    ['a malformed subject', signToken({ sid }, { subject: 'riya' })],
  ];
  for (const [label, token] of tokenCases) {
    const res = await api('GET', '/auth/me', { token });
    check(`${label} → 401 with the session-expired message`, res.status === 401 && /session has expired|log in/i.test(res.body?.message ?? ''), [res.status, res.body?.message]);
  }
  check('"Bearer" with no token → 401', (await api('GET', '/auth/me', { headers: { authorization: 'Bearer' } })).status === 401);
  check('Basic auth instead of Bearer → 401', (await api('GET', '/auth/me', { headers: { authorization: `Basic ${Buffer.from('a:b').toString('base64')}` } })).status === 401);

  // ------------------------------------------------------------------ account status
  section('Inactive, suspended, blocked and deactivated accounts');
  for (const status of ['pending', 'suspended', 'blocked', 'deactivated']) {
    const account = await student(status[0].toUpperCase() + status.slice(1));
    const cookie = account.cookie;
    await users.updateOne({ _id: oid(account.id) }, { $set: { status } });
    const meRes = await api('GET', '/auth/me', { token: account.token });
    check(`${status}: existing access token → 403 with a status message`, meRes.status === 403 && meRes.body.message.length > 10, meRes.body);
    check(`${status}: password change refused (403)`, (await changePassword(account, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).status === 403);
    const right = await login(account.email);
    check(`${status}: correct password → 403, no token issued`, right.status === 403 && !right.data?.accessToken && !right.headers.get('set-cookie'), right.body);
    const wrongPw = await login(account.email, 'Wrong#Password1');
    check(`${status}: wrong password → 401 (status only revealed with the right password)`, wrongPw.status === 401 && wrongPw.body.message === 'Invalid email or password.', wrongPw.body);
    const refreshRes = await api('POST', '/auth/refresh', { cookie });
    check(`${status}: refresh → 403 and that session is revoked`, refreshRes.status === 403 && (await sessions.findOne({ _id: oid(sidOf(account.token)) })).revokedReason === 'account_inactive', refreshRes.status);
    await users.updateOne({ _id: oid(account.id) }, { $set: { status: 'active' } });
    check(`${status} → active again: sign-in works`, (await login(account.email)).status === 200);
  }

  // ------------------------------------------------------------------ lockout
  section('Account lockout');
  const lata = await student('Lata');
  const lockIp = freshIp();
  const lockStatuses = [];
  for (let i = 0; i < 5; i += 1) lockStatuses.push((await login(lata.email, `Wrong#${i}guess`, lockIp)).status);
  check('5 wrong passwords → 401 ×4 then 423', JSON.stringify(lockStatuses) === '[401,401,401,401,423]', lockStatuses);
  const lockedRight = await login(lata.email);
  check('while locked even the right password → 423 with minutes to wait', lockedRight.status === 423 && /try again in \d+ minute/i.test(lockedRight.body.message), lockedRight.body);
  check("lata's existing session keeps working (the lock only stops new sign-ins)", (await api('GET', '/auth/me', { token: lata.token })).status === 200);
  const lockedDoc = await users.findOne({ _id: oid(lata.id) });
  check('lock lasts ~15 minutes; the account itself stays active', lockedDoc.lockedUntil - Date.now() > 13 * 60_000 && lockedDoc.lockedUntil - Date.now() <= 15 * 60_000 + 5000 && lockedDoc.status === 'active');
  await users.updateOne({ _id: oid(lata.id) }, { $set: { lockedUntil: new Date(Date.now() - 1000) } });
  const unlocked = await login(lata.email);
  check('after the lock ends the right password works and the counters reset', unlocked.status === 200 && (await users.findOne({ _id: oid(lata.id) })).lockedUntil === null);
  const ghostLock = [];
  for (let i = 0; i < 5; i += 1) ghostLock.push((await login('ghost.lock@qa.campusx.dev', `Wrong#${i}guess`, freshIp())).status);
  check('an unknown email locks exactly like a real one (no enumeration)', JSON.stringify(ghostLock) === '[401,401,401,401,423]', ghostLock);

  // ------------------------------------------------------------------ password change
  section('Password change: authentication and validation');
  const bad = await student('Badinput');
  check('no token → 401', (await api('PUT', '/auth/password', { body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD } })).status === 401);
  const expiredChange = await changePassword({ token: signToken({ sid: sidOf(bad.token), role: 'student' }, { subject: bad.id, expiresIn: -5 }) }, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
  check('expired access token → 401 (the app refreshes and retries; never a field error)', expiredChange.status === 401, expiredChange.status);
  check('forged token → 401', (await changePassword({ token: signToken({ sid: sidOf(bad.token) }, { subject: bad.id, secret: 'forged-secret-0123456789-abcdefghijklmnopqrstuvwxyz' }) }, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).status === 401);
  const hashBefore = (await users.findOne({ _id: oid(bad.id) })).passwordHash;
  const invalidCases = [
    ['missing current password', { newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }, 'currentPassword'],
    ['current password as an object', { currentPassword: { $ne: '' }, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }, 'currentPassword'],
    ['new password under 8 characters', { currentPassword: PASSWORD, newPassword: 'Ab1cdef', confirmPassword: 'Ab1cdef' }, 'newPassword'],
    ['new password without a number', { currentPassword: PASSWORD, newPassword: 'OnlyLettersHere', confirmPassword: 'OnlyLettersHere' }, 'newPassword'],
    ['new password without a letter', { currentPassword: PASSWORD, newPassword: '1234567890', confirmPassword: '1234567890' }, 'newPassword'],
    ['common new password', { currentPassword: PASSWORD, newPassword: 'Password123', confirmPassword: 'Password123' }, 'newPassword'],
    ['new password over 72 bytes', { currentPassword: PASSWORD, newPassword: `A1${'é'.repeat(36)}`, confirmPassword: `A1${'é'.repeat(36)}` }, 'newPassword'],
    ['confirmation mismatch', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: `${NEW_PASSWORD}!` }, 'confirmPassword'],
    ['new password same as the current one', { currentPassword: PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD }, 'newPassword'],
    ['new password as a number', { currentPassword: PASSWORD, newPassword: 12345678, confirmPassword: 12345678 }, 'newPassword'],
  ];
  // Every attempt counts toward the limit (5 per 15 minutes per student), so the cases are spread out.
  let caseStudent = bad;
  for (const [index, [label, body, field]] of invalidCases.entries()) {
    if (index > 0 && index % 4 === 0) caseStudent = await student('Validation');
    const res = await changePassword(caseStudent, body);
    check(`${label} → 422 on field ${field}`, res.status === 422 && res.body.errors?.some((error) => error.field === field), [res.status, res.body?.errors]);
  }
  check('refused changes leave the password hash untouched', (await users.findOne({ _id: oid(bad.id) })).passwordHash === hashBefore);

  section('Password change: wrong current password');
  const wanda = await student('Wanda');
  const wandaOther = await login(wanda.email);
  const wandaBefore = (await users.findOne({ _id: oid(wanda.id) })).passwordHash;
  const wrongCurrent = await changePassword(wanda, { currentPassword: 'Not#MyPassword9', newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
  check('wrong current password → 422 field error (not 401, so the app keeps the session)', wrongCurrent.status === 422 && wrongCurrent.body.errors?.[0]?.field === 'currentPassword' && wrongCurrent.body.message === 'Your current password is incorrect.', wrongCurrent.body);
  check('...hash unchanged, other device still signed in', (await users.findOne({ _id: oid(wanda.id) })).passwordHash === wandaBefore && (await api('GET', '/auth/me', { token: wandaOther.data.accessToken })).status === 200);
  await sleep(150);
  check('...no PASSWORD_CHANGED audit row and no notification', (await auditRows({ action: 'PASSWORD_CHANGED', targetId: oid(wanda.id) })).length === 0 && !(await notificationsOf(wanda.id)).some((item) => item.title === 'Password changed'));
  check('...the old password still signs in', (await login(wanda.email)).status === 200);

  section('Password change: success');
  const asha = await student('Asha');
  const phone = await login(asha.email);
  const laptop = await login(asha.email);
  const phoneSocket = await connectSocket(phone.data.accessToken);
  const ownSocket = await connectSocket(asha.token);
  check('seed: two other devices signed in with live sockets', !phoneSocket.error && !ownSocket.error, [phoneSocket.error, ownSocket.error]);
  const phoneDisconnected = new Promise((resolve) => phoneSocket.socket.on('disconnect', () => resolve(true)));
  let ownDisconnected = false;
  ownSocket.socket.on('disconnect', () => (ownDisconnected = true));
  await users.updateOne({ _id: oid(asha.id) }, { $set: { failedLoginAttempts: 3 } });
  const ashaBefore = await users.findOne({ _id: oid(asha.id) });
  const changed = await changePassword(asha, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }, { ip: '10.250.0.7' });
  check('correct details → 200 with a clear message', changed.status === 200 && /password changed/i.test(changed.body.message), changed.body);
  check('response says 2 other devices were signed out', changed.data?.otherSessionsSignedOut === 2, changed.data);
  check('response is no-store and carries no password, hash or token', changed.headers.get('cache-control') === 'no-store' && !changed.text.includes(NEW_PASSWORD) && !changed.text.includes(PASSWORD) && !/\$2[aby]\$|accessToken/.test(changed.text));
  const ashaAfter = await users.findOne({ _id: oid(asha.id) });
  check('the stored hash changed and is a bcrypt cost-12 hash', ashaAfter.passwordHash !== ashaBefore.passwordHash && /^\$2[aby]\$12\$/.test(ashaAfter.passwordHash));
  check('the new hash verifies the new password, not the old one', (await bcrypt.compare(NEW_PASSWORD, ashaAfter.passwordHash)) && !(await bcrypt.compare(PASSWORD, ashaAfter.passwordHash)));
  check('no plaintext password anywhere in the user document', !JSON.stringify(ashaAfter).includes(NEW_PASSWORD) && !JSON.stringify(ashaAfter).includes(PASSWORD));
  check('sign-in failure counter reset', ashaAfter.failedLoginAttempts === 0 && ashaAfter.lockedUntil === null, [ashaAfter.failedLoginAttempts, ashaAfter.lockedUntil]);
  check('this device stays signed in (access token)', (await api('GET', '/auth/me', { token: asha.token })).status === 200);
  const ownRefresh = await api('POST', '/auth/refresh', { cookie: asha.cookie });
  check('this device stays signed in (refresh cookie)', ownRefresh.status === 200, ownRefresh.status);
  check('other devices: access tokens → 401', (await api('GET', '/auth/me', { token: phone.data.accessToken })).status === 401 && (await api('GET', '/auth/me', { token: laptop.data.accessToken })).status === 401);
  check('other devices: refresh cookies → 401', (await api('POST', '/auth/refresh', { cookie: cookieOf(phone) })).status === 401 && (await api('POST', '/auth/refresh', { cookie: cookieOf(laptop) })).status === 401);
  const revoked = await sessions.find({ user: oid(asha.id), revokedReason: 'password_changed' }).toArray();
  check('exactly the two other sessions are revoked with reason "password_changed"', revoked.length === 2 && revoked.every((row) => row._id.toString() !== sidOf(asha.token)), revoked.map((row) => row._id));
  check("other devices' live sockets are disconnected", await Promise.race([phoneDisconnected, sleep(3000).then(() => false)]));
  await sleep(300);
  check("this device's socket stays connected", !ownDisconnected && ownSocket.socket.connected);
  phoneSocket.socket.close();
  ownSocket.socket.close();
  const oldLogin = await login(asha.email, PASSWORD);
  check('the old password no longer signs in (401)', oldLogin.status === 401 && oldLogin.body.message === 'Invalid email or password.', oldLogin.body);
  const newLogin = await login(asha.email, NEW_PASSWORD);
  check('the new password signs in (200)', newLogin.status === 200 && newLogin.data.user.id === asha.id, newLogin.body);
  await sleep(200);
  const pwAudit = await auditRows({ action: 'PASSWORD_CHANGED', targetId: oid(asha.id) });
  check('audited once: PASSWORD_CHANGED by the system, with address and device count', pwAudit.length === 1 && pwAudit[0].actorRole === 'system' && pwAudit[0].ip === '10.250.0.7' && pwAudit[0].metadata?.otherDevicesSignedOut === 2, pwAudit);
  const auditText = JSON.stringify(pwAudit);
  check('audit row holds no password, hash, token or email', !auditText.includes(NEW_PASSWORD) && !auditText.includes(PASSWORD) && !/\$2[aby]\$|eyJ|@qa\.campusx/.test(auditText) && !auditText.includes(asha.cookie.split('=')[1]));
  const notices = (await notificationsOf(asha.id)).filter((item) => item.title === 'Password changed');
  check('the student gets one "Password changed" notification', notices.length === 1 && notices[0].type === 'SYSTEM_NOTIFICATION', notices);
  check('the notification says what happened, with nothing sensitive', /other devices were signed out/.test(notices[0]?.message ?? '') && !/\$2|@|10\.250|password:/i.test(notices[0]?.message ?? '') && !notices[0]?.message.includes(NEW_PASSWORD), notices[0]?.message);
  const ownNotices = await api('GET', '/notifications', { token: asha.token });
  check('...and sees it through the notifications API', ownNotices.status === 200 && JSON.stringify(ownNotices.data).includes('Password changed'), ownNotices.status);
  asha.token = newLogin.data.accessToken;
  const second = await changePassword(asha, { currentPassword: NEW_PASSWORD, newPassword: 'Second#Change2028', confirmPassword: 'Second#Change2028' });
  await sleep(200);
  check('a second change works and gets its own notification (never merged)', second.status === 200 && (await notificationsOf(asha.id)).filter((item) => item.title === 'Password changed').length === 2, second.body);
  check('subsequent login uses the latest password only', (await login(asha.email, 'Second#Change2028')).status === 200 && (await login(asha.email, NEW_PASSWORD)).status === 401);
  const serverLog = t.stack.log();
  check('the server log never contains old or new passwords or the hash', ![PASSWORD, NEW_PASSWORD, 'Second#Change2028', ashaAfter.passwordHash].some((secret) => serverLog.includes(secret)));

  section('Password change: rate limit');
  const ravi = await student('Ravi');
  const raviStatuses = [];
  for (let i = 0; i < 6; i += 1) raviStatuses.push((await changePassword(ravi, { currentPassword: `Wrong#Guess${i}`, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).status);
  check('5 attempts per 15 minutes per student: 422 ×5 then 429', JSON.stringify(raviStatuses) === '[422,422,422,422,422,429]', raviStatuses);
  const limited = await changePassword(ravi, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
  check('once limited, even the right current password → 429 with a clear message (no guessing past it)', limited.status === 429 && /too many password change attempts/i.test(limited.body.message) && limited.headers.get('ratelimit-policy'), limited.body);
  check('...and the password did not change', (await login(ravi.email, PASSWORD)).status === 200);
  const neighbour = await student('Neighbour');
  check('another student on the same network is not affected', (await changePassword(neighbour, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }, { ip: '10.0.0.1' })).status === 200);
  await sleep(200);
  const limitAudit = await auditRows({ action: 'RATE_LIMIT_EXCEEDED', targetId: oid(ravi.id) });
  check('the limit hit is recorded (RATE_LIMIT_EXCEEDED, limiter "password-change")', limitAudit.length === 1 && limitAudit[0].metadata?.limiter === 'password-change', limitAudit);

  section('Password change: two changes at once');
  const twin = await student('Twin');
  const [first, secondRace] = await Promise.all([
    changePassword(twin, { currentPassword: PASSWORD, newPassword: 'Racing#First2027', confirmPassword: 'Racing#First2027' }),
    changePassword(twin, { currentPassword: PASSWORD, newPassword: 'Racing#Second2027', confirmPassword: 'Racing#Second2027' }),
  ]);
  const raceStatuses = [first.status, secondRace.status].sort();
  check('two simultaneous changes with the same current password → one 200, one 422', JSON.stringify(raceStatuses) === '[200,422]', raceStatuses);
  const winner = first.status === 200 ? 'Racing#First2027' : 'Racing#Second2027';
  const loser = first.status === 200 ? 'Racing#Second2027' : 'Racing#First2027';
  check("only the winner's new password works", (await login(twin.email, winner)).status === 200 && (await login(twin.email, loser)).status === 401);
  await sleep(200);
  check('one audit row and one notification for the one change', (await auditRows({ action: 'PASSWORD_CHANGED', targetId: oid(twin.id) })).length === 1 && (await notificationsOf(twin.id)).filter((item) => item.title === 'Password changed').length === 1);

  // Regression (Phase 17 QA): the update only applies while the stored hash is still the one that was checked.
  section('Password change: five changes at once');
  const quint = await student('Quint');
  const quintOther = await login(quint.email);
  const quintNew = Array.from({ length: 5 }, (_, i) => `Racing#Five${i}2027`);
  const quintRace = await Promise.all(quintNew.map((newPassword) => changePassword(quint, { currentPassword: PASSWORD, newPassword, confirmPassword: newPassword })));
  const quintWinners = quintRace.map((res, i) => (res.status === 200 ? i : -1)).filter((i) => i >= 0);
  check('five simultaneous changes → exactly one 200', quintWinners.length === 1, quintRace.map((res) => res.status));
  check('...the other four → 422 on currentPassword ("Your current password is incorrect.")', quintRace.filter((res) => res.status === 422).length === 4 && quintRace.filter((res) => res.status === 422).every((res) => res.body.errors?.[0]?.field === 'currentPassword' && res.body.message === 'Your current password is incorrect.'), quintRace.map((res) => res.body?.message));
  const quintStored = (await users.findOne({ _id: oid(quint.id) })).passwordHash;
  check("...the stored hash is the winner's password and no loser's", quintWinners.length === 1 && (await bcrypt.compare(quintNew[quintWinners[0]], quintStored)) && !(await Promise.all(quintNew.filter((_, i) => i !== quintWinners[0]).map((pw) => bcrypt.compare(pw, quintStored)))).some(Boolean));
  check('...the other device was signed out once (one revoked session)', (await sessions.countDocuments({ user: oid(quint.id), revokedReason: 'password_changed' })) === 1 && (await api('GET', '/auth/me', { token: quintOther.data.accessToken })).status === 401);
  await sleep(200);
  const quintAudit = await auditRows({ action: 'PASSWORD_CHANGED', targetId: oid(quint.id) });
  check('...one audit row, with the device count stored (not redacted)', quintAudit.length === 1 && quintAudit[0].metadata?.otherDevicesSignedOut === 1, quintAudit.map((row) => row.metadata));
  check('...one notification', (await notificationsOf(quint.id)).filter((item) => item.title === 'Password changed').length === 1);

  section('Password change: the database refuses the update');
  const dora = await student('Dora');
  const doraOther = await login(dora.email);
  const doraDoc = await users.findOne({ _id: oid(dora.id) });
  // A collection validator only this account's current document satisfies ("moderate": other accounts are
  // not checked), so its password update is refused by MongoDB itself.
  await db.command({ collMod: 'users', validator: { passwordHash: doraDoc.passwordHash }, validationLevel: 'moderate', validationAction: 'error' });
  let failed;
  try {
    failed = await changePassword(dora, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
  } finally {
    await db.command({ collMod: 'users', validator: {}, validationLevel: 'off' });
  }
  check('update failure → 500 with a generic message', failed.status === 500 && failed.body.message === 'Something went wrong. Please try again.', failed.body);
  check('...and no password or hash in the response', !failed.text.includes(NEW_PASSWORD) && !failed.text.includes(PASSWORD) && !/\$2[aby]\$/.test(failed.text));
  check('...the password is unchanged (old works, new does not)', (await users.findOne({ _id: oid(dora.id) })).passwordHash === doraDoc.passwordHash && (await login(dora.email, PASSWORD)).status === 200 && (await login(dora.email, NEW_PASSWORD)).status === 401);
  check('...other devices were not signed out', (await api('GET', '/auth/me', { token: doraOther.data.accessToken })).status === 200);
  await sleep(200);
  check('...nothing audited and no notification', (await auditRows({ action: 'PASSWORD_CHANGED', targetId: oid(dora.id) })).length === 0 && !(await notificationsOf(dora.id)).some((item) => item.title === 'Password changed'));
  check('...the server log has the failure but not the hash', /PUT \/api\/v1\/auth\/password failed/.test(t.stack.log()) && !t.stack.log().includes(doraDoc.passwordHash));
  const retry = await changePassword(dora, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
  check('once the database accepts writes again, retrying works', retry.status === 200 && (await login(dora.email, NEW_PASSWORD)).status === 200, retry.body);
} catch (error) {
  check('suite ran to the end without crashing', false, error.stack);
}
await t.finish();
