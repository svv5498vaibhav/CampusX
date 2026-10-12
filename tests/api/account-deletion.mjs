// Account deletion (DELETE /auth/account): authentication, origin, validation (password + typed DELETE),
// rate limiting, staff refusal, never another student's account, the full data policy (deleted, handed on,
// kept, Anonymous Zone untouched), other students' points and counts reconciled, sessions/sockets ended,
// Cloudinary files removed with retries and a give-up, concurrent requests, an interrupted deletion finished
// by the cleanup job, and the transactional path (commit and rollback) on a real replica set.
import { PASSWORD, clientFor, createSuite, eventually, mongoose, oid, sleep } from '../lib/harness.mjs';
import { jpg } from '../lib/files.mjs';
import { API_PORT, DB_PORT } from '../lib/paths.mjs';
import { runAccountCleanup, setRoleByScript } from '../lib/scripts.mjs';
import { startBackend, startReplicaSet } from '../lib/stack.mjs';

const t = await createSuite('account-deletion', { cloudinary: true });
const { check, section, api, register, login, relogin, upload, connectSocket, db, step } = t;
const cloud = t.cloudinary;

const CONFIRM = 'DELETE';
const WRONG_PASSWORD = 'Wr0ngPassw0rd!x';
const OTHER_PASSWORD = 'Victim#Pass2026';
const remove = (who, body, options = {}) => api('DELETE', '/auth/account', { token: who.token, body, ...options });
const good = (password = PASSWORD) => ({ password, confirmation: CONFIRM });
const count = (collection, filter) => db.collection(collection).countDocuments(filter);
const userDoc = (who) => db.collection('users').findOne({ _id: oid(who.id) });
const jobOf = (who) => db.collection('accountdeletions').findOne({ user: oid(who.id) });
const auditRows = (who) => db.collection('moderationauditlogs').find({ action: 'ACCOUNT_DELETED', targetId: oid(who.id) }).toArray();
const fieldOf = (res) => res.body?.errors?.[0]?.field;
const cleanup = (options = {}) => runAccountCleanup(t.stack.mongoUri, { env: cloud.env, ...options });

try {
  section('Guards and validation');
  const vera = await register('Vera', 'Iyer');
  check('no token → 401', (await api('DELETE', '/auth/account', { body: good() })).status === 401);
  check('a forged token → 401', (await api('DELETE', '/auth/account', { token: 'not.a.token', body: good() })).status === 401);
  const foreign = await remove(vera, good(), { origin: 'https://evil.example' });
  check('a foreign Origin → 403 (CSRF guard)', foreign.status === 403, foreign.body);
  check('no account id in the path: DELETE /auth/account/:id → 404', (await api('DELETE', `/auth/account/${vera.id}`, { token: vera.token, body: good() })).status === 404);
  const noPassword = await remove(vera, { confirmation: CONFIRM });
  check('missing password → 422 (field password)', noPassword.status === 422 && fieldOf(noPassword) === 'password', noPassword.body);
  const noConfirmation = await remove(vera, { password: PASSWORD });
  check('missing confirmation → 422 (field confirmation)', noConfirmation.status === 422 && fieldOf(noConfirmation) === 'confirmation', noConfirmation.body);
  const lowercase = await remove(vera, { password: PASSWORD, confirmation: 'delete' });
  check('"delete" in lower case → 422 (field confirmation): the exact word is required', lowercase.status === 422 && fieldOf(lowercase) === 'confirmation' && /Type DELETE/.test(lowercase.body?.errors?.[0]?.message), lowercase.body);
  const wrong = await remove(vera, good(WRONG_PASSWORD));
  check('wrong password → 422 field error "Your password is incorrect." (never 401: the app must not sign out)', wrong.status === 422 && fieldOf(wrong) === 'password' && wrong.body.errors[0].message === 'Your password is incorrect.', wrong.body);
  const tooLong = await remove(vera, good('x'.repeat(73)));
  check('a password over 72 bytes → 422', tooLong.status === 422 && fieldOf(tooLong) === 'password');
  const afterRefusals = await userDoc(vera);
  check('nothing deleted after refused attempts: account active, session works, no deletion record or audit row', afterRefusals?.status === 'active' && (await api('GET', '/auth/me', { token: vera.token })).status === 200 && !(await jobOf(vera)) && (await auditRows(vera)).length === 0);

  section('Rate limiting');
  const limited = await remove(vera, good());
  check('6th attempt within 15 minutes → 429, even with the right password', limited.status === 429 && /Too many account deletion attempts/.test(limited.body?.message), limited.body);
  check('the limited account is still there and signed in', (await userDoc(vera))?.status === 'active' && (await api('GET', '/auth/me', { token: vera.token })).status === 200);
  const wade = await register('Wade', 'Nair');
  const wadeDeleted = await remove(wade, { password: PASSWORD, confirmation: '  DELETE  ' });
  check("the limit is per student: another student isn't limited (and spaces around DELETE are fine) → 200", wadeDeleted.status === 200 && wadeDeleted.data?.status === 'deleted', wadeDeleted.body);
  check('repeating the request with the old token → 401 (account gone)', (await remove(wade, good())).status === 401);

  section('Staff accounts');
  const mod = await register('Mona', 'Kapoor');
  await setRoleByScript(t.stack.mongoUri, mod.email, 'moderator');
  await relogin(mod);
  const staff = await remove(mod, good());
  check('a moderator → 403 with an explanation, account untouched', staff.status === 403 && /staff role/.test(staff.body?.message) && (await userDoc(mod))?.status === 'active' && (await userDoc(mod))?.role === 'moderator', staff.body);

  section("Never another student's account");
  const victim = await register('Vikram', 'Shah');
  await t.must(api('PUT', '/auth/password', { token: victim.token, body: { currentPassword: PASSWORD, newPassword: OTHER_PASSWORD, confirmPassword: OTHER_PASSWORD } }), 'victim password change');
  // (The password change keeps this device signed in, so victim.token stays valid.)
  const attacker = await register('Arjun', 'Mehta');
  const withVictimPassword = await remove(attacker, { ...good(OTHER_PASSWORD), userId: victim.id, id: victim.id, user: victim.id });
  check("the victim's password with the victim's id in the body → 422 (checked against the attacker's own account)", withVictimPassword.status === 422 && fieldOf(withVictimPassword) === 'password', withVictimPassword.body);
  const ownPassword = await remove(attacker, { ...good(), userId: victim.id, id: victim.id, user: victim.id });
  check('ids in the body are ignored: the request deletes only the signed-in account', ownPassword.status === 200 && !(await userDoc(attacker)) && (await userDoc(victim))?.status === 'active', ownPassword.body);
  check('the other student is still signed in', (await api('GET', '/auth/me', { token: victim.token })).status === 200);

  section('Setup: a student with data everywhere');
  const riya = await register('Riya', 'Deshmukh');
  const sam = await register('Sameer', 'Kulkarni');
  const kavya = await register('Kavya', 'Joshi');
  await t.must(upload('/profile/avatar', riya.token, 'photo', [jpg()]), 'avatar');
  await t.must(upload('/profile/cover', riya.token, 'cover', [jpg('cover.jpg')]), 'cover');
  const riyaPost = (await t.must(api('POST', '/posts', { token: riya.token, body: { content: 'Robotics club demo this Friday evening near the library lawn, bring your bots.', visibility: 'public' } }), 'riya post')).data.post.id;
  const riyaPhotoPost = (await t.must(upload('/posts', riya.token, 'media', [jpg('demo.jpg')], { fields: { content: 'Our line follower finally works after three weekends of tuning.', visibility: 'public' } }), 'riya photo post')).data.post.id;
  const samPost = (await t.must(api('POST', '/posts', { token: sam.token, body: { content: 'Looking for teammates for the inter-college hackathon next month.', visibility: 'public' } }), 'sam post')).data.post.id;
  await t.must(api('POST', `/posts/${riyaPost}/comments`, { token: sam.token, body: { content: 'Count me in, I will bring the sensors kit.' } }), 'sam comment on riya post');
  await t.must(api('POST', `/posts/${samPost}/comments`, { token: riya.token, body: { content: 'I can handle the backend and the demo video.' } }), 'riya comment on sam post');
  await t.must(api('POST', `/posts/${samPost}/comments`, { token: kavya.token, body: { content: 'Happy to help with the pitch deck design.' } }), 'kavya comment on sam post');
  await t.must(api('POST', `/posts/${samPost}/like`, { token: riya.token }), 'riya like');
  await t.must(api('POST', `/posts/${samPost}/save`, { token: riya.token }), 'riya save');
  const samProject = (await t.must(api('POST', '/projects', { token: sam.token, body: { title: 'Campus Shuttle Tracker', shortDescription: 'Live shuttle locations for the campus bus.', description: 'A web app showing where the campus shuttle is, from GPS pings sent by the driver phone.', category: 'web', teamMembers: [{ user: riya.id, role: 'developer' }] } }), 'sam project')).data.project.id;
  await t.must(api('POST', `/projects/${samProject}/team/accept`, { token: riya.token }), 'team accept');
  await t.must(api('POST', `/projects/${samProject}/like`, { token: riya.token }), 'project like');
  const riyaProject = (await t.must(api('POST', '/projects', { token: riya.token, body: { title: 'Line Follower Robot', shortDescription: 'An Arduino robot that follows a track.', description: 'An Arduino based robot with IR sensors and a PID loop that follows a black line on the floor.', category: 'web' } }), 'riya project')).data.project.id;
  await t.must(upload(`/projects/${riyaProject}/images`, riya.token, 'images', [jpg('robot.jpg')]), 'project image');
  const riyaAchievement = (await t.must(api('POST', '/achievements', { token: riya.token, body: { title: 'Runner-up, Robo Race 2026', type: 'competition', date: '2026-08-20', organization: 'VNIT Robotics Club' } }), 'achievement')).data.achievement.id;
  await t.must(upload(`/achievements/${riyaAchievement}/proof`, riya.token, 'proof', [jpg('certificate.jpg')]), 'proof');
  const communityA = (await t.must(api('POST', '/communities', { token: riya.token, body: { name: 'Robotics Circle', description: 'Weekend robotics builds and sensor experiments for beginners.', type: 'interest', visibility: 'public', tags: ['robotics'] } }), 'community A')).data.community.id;
  const communityB = (await t.must(api('POST', '/communities', { token: riya.token, body: { name: 'Campus Chess Society', description: 'Rapid chess evenings and puzzle sessions every Wednesday night.', type: 'interest', visibility: 'public', tags: ['chess'] } }), 'community B')).data.community.id;
  const communityC = (await t.must(api('POST', '/communities', { token: sam.token, body: { name: 'Hostel Music Jam', description: 'Acoustic sessions on the hostel terrace every Saturday evening.', type: 'interest', visibility: 'public', tags: ['music'] } }), 'community C')).data.community.id;
  await t.must(api('POST', `/communities/${communityA}/join`, { token: sam.token }), 'sam joins A');
  await t.must(api('POST', `/communities/${communityB}/join`, { token: kavya.token }), 'kavya joins B');
  await t.must(api('PATCH', `/communities/${communityB}/members/${kavya.id}/role`, { token: riya.token, body: { role: 'moderator' } }), 'kavya moderator');
  await t.must(api('POST', `/communities/${communityC}/join`, { token: riya.token }), 'riya joins C');
  await t.must(api('GET', '/search?q=robotics', { token: riya.token }), 'search');
  await t.must(api('PATCH', '/roadmap/milestones/s1-git-github/complete', { token: riya.token }), 'roadmap');
  await t.must(api('PUT', '/notifications/preferences', { token: riya.token, body: { likes: false } }), 'preferences');
  await db.collection('opportunityapplications').insertOne({ opportunity: new mongoose.Types.ObjectId(), user: oid(riya.id), status: 'saved', notes: '', statusChangedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
  await db.collection('recommendationfeedbacks').insertOne({ user: oid(riya.id), targetType: 'post', targetId: oid(samPost), action: 'dismiss', traits: [], createdAt: new Date() });
  await db.collection('recommendationinteractions').insertOne({ user: oid(riya.id), targetType: 'post', targetId: oid(samPost), impressions: 2, clicks: 0, createdAt: new Date(), updatedAt: new Date() });
  const riyaAnon = (await t.must(upload('/anonymous/posts', riya.token, 'images', [jpg('mess.jpg')], { fields: { category: 'hostel', title: 'Mess timings feedback', content: 'Dinner at the mess closes far too early for students coming back from late labs.' } }), 'riya anonymous post')).data.post.id;
  const samAnon = (await t.must(api('POST', '/anonymous/posts', { token: sam.token, body: { category: 'event', title: 'Fest volunteers needed', content: 'The cultural fest team is short of volunteers for the stage crew this year.' } }), 'sam anonymous post')).data.post.id;
  await t.must(api('POST', `/anonymous/posts/${samAnon}/comments`, { token: riya.token, body: { content: 'I can help with lights on the second day.' } }), 'riya anonymous comment');
  await t.must(api('POST', `/anonymous/posts/${samAnon}/like`, { token: riya.token }), 'riya anonymous like');
  await t.must(api('POST', '/reports', { token: riya.token, body: { targetType: 'post', targetId: samPost, reason: 'spam', description: 'Checking the report flow.' } }), 'riya report');
  await t.must(api('POST', '/reports', { token: sam.token, body: { targetType: 'post', targetId: riyaPost, reason: 'misleading' } }), 'sam report');
  const secondDevice = await login(riya.email);
  const likeAward = { user: oid(sam.id), sourceType: 'post-like', sourceId: `${samPost}:${riya.id}`, kind: 'award' };
  const commentAward = { user: oid(sam.id), sourceType: 'post-comment', sourceId: `${samPost}:${riya.id}`, kind: 'award' };
  const awarded = await eventually(async () => (await db.collection('pointtransactions').findOne({ ...likeAward, reversed: false })) && (await db.collection('pointtransactions').findOne({ ...commentAward, reversed: false })), { timeout: 8000 });
  check("before: Sameer earned points for Riya's like and comment", Boolean(awarded));
  check('before: Sameer has notifications caused by Riya', (await count('notifications', { recipient: oid(sam.id), actor: oid(riya.id) })) > 0);
  check('before: Riya has her own records (sessions, points, roadmap, history, memberships)', (await count('sessions', { user: oid(riya.id) })) === 2 && (await count('studentgamifications', { user: oid(riya.id) })) === 1 && (await count('studentroadmapprogresses', { user: oid(riya.id) })) === 1 && (await count('searchhistories', { user: oid(riya.id) })) === 1 && (await count('communitymembers', { user: oid(riya.id) })) === 3);

  const riyaBefore = await userDoc(riya);
  const ownMedia = [
    riyaBefore.avatarPublicId,
    riyaBefore.coverImagePublicId,
    ...(await db.collection('posts').find({ author: oid(riya.id) }).toArray()).flatMap((post) => post.media.map((item) => item.publicId)),
    ...(await db.collection('projects').find({ owner: oid(riya.id) }).toArray()).flatMap((project) => project.images.map((image) => image.publicId)),
    ...(await db.collection('achievements').find({ owner: oid(riya.id) }).toArray()).flatMap((achievement) => achievement.proof.map((item) => item.publicId)),
  ];
  const anonMedia = (await db.collection('anonymousposts').findOne({ _id: oid(riyaAnon) })).media.map((item) => item.publicId);
  check('setup: 5 files of her own on Cloudinary (photo, cover, post photo, project image, proof), plus 1 in the Anonymous Zone', ownMedia.filter(Boolean).length === 5 && anonMedia.length === 1, ownMedia);

  const { socket, error: socketError } = await connectSocket(riya.token);
  let socketClosed = false;
  socket.on('disconnect', () => {
    socketClosed = true;
  });
  check('setup: a live socket is open', !socketError && socket.connected, socketError);

  section('Deleting the account');
  const deleted = await remove(riya, good());
  check('200 "permanently deleted", status "deleted"', deleted.status === 200 && deleted.data?.status === 'deleted' && /permanently deleted/.test(deleted.body?.message), deleted.body);
  const setCookie = deleted.headers.get('set-cookie') ?? '';
  check('the refresh cookie is cleared; the response is not cached', /cx_refresh=;/.test(setCookie) && /Expires=Thu, 01 Jan 1970/i.test(setCookie) && deleted.headers.get('cache-control') === 'no-store', setCookie);
  check('no password, hash or email in the response', !/password|hash/i.test(JSON.stringify(deleted.body)) && !deleted.text.includes(riya.email));

  section('Sessions and sign-in');
  check('the access token stops working at once (401)', (await api('GET', '/auth/me', { token: riya.token })).status === 401);
  check('the other device is signed out too (401)', (await api('GET', '/auth/me', { token: secondDevice.data.accessToken })).status === 401);
  check('both refresh cookies are dead (401)', (await api('POST', '/auth/refresh', { cookie: riya.cookie })).status === 401 && (await api('POST', '/auth/refresh', { cookie: secondDevice.headers.get('set-cookie')?.split(';')[0] })).status === 401);
  const relog = await login(riya.email);
  check('signing in again → 401 "Invalid email or password." (no hint the account existed)', relog.status === 401 && relog.body?.message === 'Invalid email or password.', relog.body);
  check('the live socket was disconnected', Boolean(await eventually(() => socketClosed, { timeout: 4000 })));
  const { error: handshake } = await connectSocket(riya.token);
  check('a new socket handshake with the old token is refused', handshake === 'unauthorized', handshake);

  section('Her data: deleted');
  const me = { _id: oid(riya.id) };
  check('the user document is gone; no sessions left', !(await userDoc(riya)) && (await count('sessions', { user: me._id })) === 0);
  check('her posts are gone, with every comment on them (Sameer’s too)', (await count('posts', { author: me._id })) === 0 && (await count('comments', { post: { $in: [oid(riyaPost), oid(riyaPhotoPost)] } })) === 0);
  check('her comments elsewhere are gone', (await count('comments', { author: me._id })) === 0);
  const samPostAfter = await db.collection('posts').findOne({ _id: oid(samPost) });
  check("Sameer's post: her like and save removed, comment count recalculated (Kavya's comment remains: 1)", !samPostAfter.likes.some((id) => String(id) === riya.id) && !samPostAfter.saves.some((id) => String(id) === riya.id) && samPostAfter.commentsCount === 1, { likes: samPostAfter.likes.length, comments: samPostAfter.commentsCount });
  const samProjectAfter = await db.collection('projects').findOne({ _id: oid(samProject) });
  check("Sameer's project: her like and her place on the team removed, the project itself stays", samProjectAfter && !samProjectAfter.likes.some((id) => String(id) === riya.id) && !samProjectAfter.teamMembers.some((member) => String(member.user) === riya.id));
  check('her projects and achievements are gone', (await count('projects', { owner: me._id })) === 0 && (await count('achievements', { owner: me._id })) === 0);
  for (const [label, collection, filter] of [
    ['community memberships', 'communitymembers', { user: me._id }],
    ['opportunity tracking', 'opportunityapplications', { user: me._id }],
    ['roadmap progress', 'studentroadmapprogresses', { user: me._id }],
    ['points ledger', 'pointtransactions', { user: me._id }],
    ['gamification record', 'studentgamifications', { user: me._id }],
    ['notifications she received', 'notifications', { recipient: me._id }],
    ['notifications she caused for others', 'notifications', { actor: me._id }],
    ['notification settings', 'notificationpreferences', { user: me._id }],
    ['search history', 'searchhistories', { user: me._id }],
    ['recommendation profile', 'recommendationprofiles', { user: me._id }],
    ['recommendation feedback', 'recommendationfeedbacks', { user: me._id }],
    ['recommendation interactions', 'recommendationinteractions', { user: me._id }],
  ]) {
    check(`${label}: none left`, (await count(collection, filter)) === 0);
  }

  section('Communities: handed on or archived, never deleted');
  const [a, b, c] = await Promise.all([communityA, communityB, communityC].map((id) => db.collection('communities').findOne({ _id: oid(id) })));
  check('A (no moderator): archived, kept, no longer names her, 1 member (Sameer)', a?.status === 'archived' && a.createdBy === null && a.memberCount === 1, a && { status: a.status, createdBy: a.createdBy, members: a.memberCount });
  const kavyaMembership = await db.collection('communitymembers').findOne({ community: oid(communityB), user: oid(kavya.id) });
  check('B: handed to its moderator Kavya (now owner), still active, 1 member', b?.status === 'active' && kavyaMembership?.role === 'owner' && b.memberCount === 1 && b.createdBy === null, { status: b?.status, role: kavyaMembership?.role, members: b?.memberCount });
  check("C (Sameer's): her membership removed, count back to 1", c?.memberCount === 1);
  const kavyaNotes = await eventually(async () => (await api('GET', '/notifications', { token: kavya.token })).data?.notifications?.find((note) => /now an owner of Campus Chess Society/.test(note.message)), { timeout: 4000 });
  check('Kavya is told she now owns B (without naming the deleted student)', Boolean(kavyaNotes) && !/Riya/.test(kavyaNotes.message), kavyaNotes?.message);

  section('Kept for safety, and the Anonymous Zone untouched');
  check('the report she filed is kept', (await count('reports', { reporter: me._id })) === 1);
  check('the report about her post is kept', (await count('reports', { targetId: oid(riyaPost) })) === 1);
  const anonAfter = await db.collection('anonymousposts').findOne({ _id: oid(riyaAnon) });
  check('her anonymous post is untouched: still live, its internal author reference kept', anonAfter?.status === 'active' && String(anonAfter.author) === riya.id);
  check('her anonymous comment and like are untouched', (await count('anonymouscomments', { author: me._id, status: 'active' })) === 1 && (await db.collection('anonymousposts').findOne({ _id: oid(samAnon) })).likes.some((id) => String(id) === riya.id));
  const visibleAnon = await api('GET', `/anonymous/posts/${riyaAnon}`, { token: sam.token });
  check('other students still see it, with no author', visibleAnon.status === 200 && !JSON.stringify(visibleAnon.body).includes(riya.id));
  const [audit] = await auditRows(riya);
  check('one ACCOUNT_DELETED audit row (automated, Security), with counts only', audit?.actorRole === 'system' && audit.metadata?.posts === 2 && audit.metadata?.projects === 1 && audit.metadata?.achievements === 1 && audit.metadata?.communitiesArchived === 1 && audit.metadata?.communitiesHandedOver === 1 && audit.metadata?.files === 5, audit?.metadata);
  const auditText = JSON.stringify(audit);
  check('the audit row holds no email, password or Anonymous Zone details', !auditText.includes(riya.email) && !auditText.includes(PASSWORD) && !/anonymous/i.test(auditText));

  section('Files');
  const filesGone = await eventually(() => ownMedia.every((id) => cloud.destroyed.includes(id)), { timeout: 8000 });
  check('every file of hers was removed from Cloudinary (photo, cover, post photo, project image, proof)', Boolean(filesGone), { missing: ownMedia.filter((id) => !cloud.destroyed.includes(id)) });
  check('the anonymous post photo was not touched', !anonMedia.some((id) => cloud.destroyed.includes(id)));
  const job = await eventually(async () => {
    const record = await jobOf(riya);
    return record?.completedAt ? record : null;
  });
  check('the deletion record is complete: purged, followed up, no files left, nothing personal', job && job.purgedAt && job.finishedAt && job.media.length === 0 && !job.affected && !JSON.stringify(job).includes(riya.email), job);

  section("Other students' points, notifications and views");
  const reversed = await eventually(async () => (await db.collection('pointtransactions').findOne({ ...likeAward, reversed: true })) && (await db.collection('pointtransactions').findOne({ ...commentAward, reversed: true })), { timeout: 8000 });
  check("Sameer's points for her like and comment were reversed (they no longer exist)", Boolean(reversed));
  await sleep(500);
  const ledger = (await db.collection('pointtransactions').find({ user: oid(sam.id) }).toArray()).reduce((sum, row) => sum + row.points, 0);
  const samRecord = await db.collection('studentgamifications').findOne({ user: oid(sam.id) });
  check("Sameer's total still equals his ledger", samRecord?.totalPoints === ledger, { total: samRecord?.totalPoints, ledger });
  check('no notification anywhere still names her as the actor', (await count('notifications', { actor: me._id })) === 0);
  check('her public profile → 404', (await api('GET', `/profile/${riya.id}`, { token: sam.token })).status === 404);
  check('search no longer finds her', !JSON.stringify((await api('GET', '/search?q=Riya%20Deshmukh', { token: sam.token })).body).includes(riya.id));
  check('leaderboards no longer list her', !JSON.stringify((await api('GET', '/rankings/overall', { token: sam.token })).body).includes(riya.id));
  const reRegistered = await api('POST', '/auth/register', { ip: '10.99.0.1', body: { firstName: 'Riya', lastName: 'Deshmukh', email: riya.email, password: PASSWORD, confirmPassword: PASSWORD } });
  check('the email address can be used for a new account (a different id)', reRegistered.status === 201 && reRegistered.data.user.id !== riya.id, reRegistered.body);

  section('Concurrent requests');
  const dup = await register('Dev', 'Patil');
  const results = await Promise.all([1, 2, 3].map(() => remove(dup, good())));
  const statuses = results.map((res) => res.status).sort();
  check('three at once: exactly one 200, the others 409/401/403', statuses.filter((status) => status === 200).length === 1 && statuses.every((status) => [200, 401, 403, 409].includes(status)), statuses);
  check('deleted once, audited once', !(await userDoc(dup)) && (await auditRows(dup)).length === 1);

  section('Cloudinary failures: retried, then given up');
  const cleo = await register('Cleo', 'Dsouza');
  await t.must(upload('/profile/avatar', cleo.token, 'photo', [jpg()]), 'cleo avatar');
  await t.must(upload('/posts', cleo.token, 'media', [jpg('notes.jpg')], { fields: { content: 'Handwritten notes for the signals and systems midterm, all units.', visibility: 'public' } }), 'cleo post');
  cloud.failDestroys(1000);
  const cleoDeleted = await remove(cleo, good());
  check('Cloudinary down: the account is still deleted (200)', cleoDeleted.status === 200 && !(await userDoc(cleo)), cleoDeleted.body);
  const pending = await eventually(async () => {
    const record = await jobOf(cleo);
    return record?.mediaAttempts === 1 ? record : null;
  });
  check('both files wait for a retry: attempt 1 recorded, next attempt scheduled, not complete', pending && pending.media.length === 2 && pending.lastError && pending.nextMediaAttemptAt > new Date() && !pending.completedAt, pending);
  const notDue = await cleanup();
  check('the cleanup job leaves them until the retry is due', notDue.code === 0 && notDue.result?.mediaRemoved === 0 && (await jobOf(cleo)).media.length === 2, notDue.result ?? notDue.output.slice(-400));
  cloud.failDestroys(0);
  const due = await cleanup({ now: new Date(pending.nextMediaAttemptAt.getTime() + 1000) });
  const cleoDone = await jobOf(cleo);
  check('once due and Cloudinary is back: both removed, record complete', due.result?.mediaRemoved === 2 && cleoDone.media.length === 0 && cleoDone.completedAt && pending.media.every((item) => cloud.destroyed.includes(item.publicId)), { result: due.result, job: cleoDone });

  const gus = await register('Gus', 'Fernandes');
  await t.must(upload('/profile/avatar', gus.token, 'photo', [jpg()]), 'gus avatar');
  cloud.failDestroys(1000);
  await t.must(remove(gus, good()), 'gus delete');
  await eventually(async () => (await jobOf(gus))?.mediaAttempts === 1);
  await db.collection('accountdeletions').updateOne({ user: oid(gus.id) }, { $set: { mediaAttempts: 9, nextMediaAttemptAt: new Date(Date.now() - 1000) } });
  const lastTry = await cleanup();
  const gaveUp = await jobOf(gus);
  check('after the last attempt: given up, logged for manual cleanup, record complete', gaveUp.mediaGaveUpAt && gaveUp.completedAt && gaveUp.media.length === 1 && /remove them manually/.test(lastTry.output), { job: gaveUp, log: lastTry.output.slice(-300) });
  cloud.failDestroys(0);

  section('An interrupted deletion (no transactions) is finished by the cleanup job');
  const ivan = await register('Ivan', 'Rodrigues');
  const ivanPost = (await t.must(api('POST', '/posts', { token: ivan.token, body: { content: 'Selling my old engineering drawing kit, barely used, DM me.', visibility: 'public' } }), 'ivan post')).data.post.id;
  await t.must(api('POST', `/posts/${samPost}/like`, { token: ivan.token }), 'ivan like');
  // Fault injection: a damaged deletion record makes the purge fail half way (after the posts, at the likes).
  await db.collection('accountdeletions').insertOne({ user: oid(ivan.id), requestedAt: new Date(), purgedAt: null, finishedAt: null, completedAt: null, media: [], affected: { likedPosts: 'damaged' } });
  const scheduled = await remove(ivan, good());
  check('202 "closed and is being deleted", status "scheduled", cookie cleared', scheduled.status === 202 && scheduled.data?.status === 'scheduled' && /cx_refresh=;/.test(scheduled.headers.get('set-cookie') ?? ''), scheduled.body);
  const locked = await userDoc(ivan);
  check('meanwhile the account is locked ("deleting"), not reported deleted, partly purged', locked?.status === 'deleting' && (await count('posts', { _id: oid(ivanPost) })) === 0);
  check('its session is ended (401) and signing in says it is being deleted (403)', (await api('GET', '/auth/me', { token: ivan.token })).status === 401 && (await login(ivan.email)).body?.message === 'This account is being deleted.');
  check('refresh is refused', (await api('POST', '/auth/refresh', { cookie: ivan.cookie })).status === 401);
  const { error: lockedSocket } = await connectSocket(ivan.token);
  check('socket handshakes are refused', lockedSocket === 'unauthorized', lockedSocket);
  await db.collection('accountdeletions').updateOne({ user: oid(ivan.id) }, { $set: { 'affected.likedPosts': [] } });
  check('the job leaves a deletion alone for 5 minutes (it may still be running)', (await cleanup()).result?.resumed === 0 && (await userDoc(ivan))?.status === 'deleting');
  await db.collection('users').updateOne({ _id: oid(ivan.id) }, { $set: { updatedAt: new Date(Date.now() - 10 * 60 * 1000) } });
  const resumed = await cleanup();
  check('after that the job finishes it: account gone, like removed, audited, record complete', resumed.result?.resumed === 1 && !(await userDoc(ivan)) && !(await db.collection('posts').findOne({ _id: oid(samPost) })).likes.some((id) => String(id) === ivan.id) && (await auditRows(ivan)).length === 1 && (await jobOf(ivan))?.completedAt, resumed.result ?? resumed.output.slice(-400));

  section('Logs');
  const log = t.stack.log();
  check('the server log never contains a submitted password', ![PASSWORD, WRONG_PASSWORD, OTHER_PASSWORD].some((secret) => log.includes(secret)));
  check('account deletions are logged as security events by id', log.includes(`Security: ACCOUNT_DELETED user=${riya.id}`));

  await step('Transactions (replica set)', async () => {
    section('Transactions (replica set): all or nothing');
    const rs = await startReplicaSet(DB_PORT + 10);
    t.cleanups.push(() => rs.stop());
    const dbName = `campusx_test_account_deletion_rs_${Date.now()}`;
    const previousPort = process.env.CAMPUSX_TEST_DB_PORT;
    process.env.CAMPUSX_TEST_DB_PORT = String(rs.port);
    let backend;
    try {
      backend = await startBackend({ name: 'account-deletion-rs', dbName, port: API_PORT + 7, env: { MONGODB_URI: rs.uri(dbName), ...cloud.env } });
    } finally {
      if (previousPort === undefined) delete process.env.CAMPUSX_TEST_DB_PORT;
      else process.env.CAMPUSX_TEST_DB_PORT = previousPort;
    }
    t.cleanups.unshift(() => backend.stop());
    const rsConn = await mongoose.createConnection(rs.uri(dbName)).asPromise();
    t.cleanups.unshift(() => rsConn.close());
    const rsDb = rsConn.db;
    const client = clientFor(backend.base);

    const tara = await client.register('Tara', 'Menon');
    const owen = await client.register('Owen', 'Pinto');
    await client.must(client.upload('/profile/avatar', tara.token, 'photo', [jpg()]), 'tara avatar');
    const owenPost = (await client.must(client.api('POST', '/posts', { token: owen.token, body: { content: 'Group study for the compilers exam in the reading room tonight.', visibility: 'public' } }), 'owen post')).data.post.id;
    await client.must(client.api('POST', '/posts', { token: tara.token, body: { content: 'Lost a blue water bottle near the mechanical workshop today.', visibility: 'public' } }), 'tara post');
    await client.must(client.api('POST', `/posts/${owenPost}/comments`, { token: tara.token, body: { content: 'I will join after my lab, save me a seat.' } }), 'tara comment');
    await client.must(client.api('POST', `/posts/${owenPost}/like`, { token: tara.token }), 'tara like');
    const committed = await client.api('DELETE', '/auth/account', { token: tara.token, body: good() });
    const taraJob = await rsDb.collection('accountdeletions').findOne({ user: oid(tara.id) });
    check('commit: 200, account, posts, comment and like gone, record purged and followed up', committed.status === 200 && !(await rsDb.collection('users').findOne({ _id: oid(tara.id) })) && (await rsDb.collection('posts').countDocuments({ author: oid(tara.id) })) === 0 && (await rsDb.collection('comments').countDocuments({ author: oid(tara.id) })) === 0 && !(await rsDb.collection('posts').findOne({ _id: oid(owenPost) })).likes.length && taraJob?.purgedAt && taraJob?.finishedAt, committed.body);
    check('commit: the post comment count was recalculated inside the transaction (0)', (await rsDb.collection('posts').findOne({ _id: oid(owenPost) })).commentsCount === 0);

    const uma = await client.register('Uma', 'Rao');
    const umaPost = (await client.must(client.api('POST', '/posts', { token: uma.token, body: { content: 'Free tickets for the robotics workshop on Sunday, first come first served.', visibility: 'public' } }), 'uma post')).data.post.id;
    await client.must(client.api('POST', `/posts/${owenPost}/like`, { token: uma.token }), 'uma like');
    await rsDb.collection('accountdeletions').insertOne({ user: oid(uma.id), requestedAt: new Date(), purgedAt: null, finishedAt: null, completedAt: null, media: [], affected: { likedPosts: 'damaged' } });
    const failed = await client.api('DELETE', '/auth/account', { token: uma.token, body: good() });
    check('a failure half way → 500 "nothing was removed"', failed.status === 500 && /nothing was removed/.test(failed.body?.message), failed.body);
    const umaAfter = await rsDb.collection('users').findOne({ _id: oid(uma.id) });
    check('rolled back: the account is active again, her post and like are still there', umaAfter?.status === 'active' && (await rsDb.collection('posts').countDocuments({ _id: oid(umaPost) })) === 1 && (await rsDb.collection('posts').findOne({ _id: oid(owenPost) })).likes.some((id) => String(id) === uma.id));
    check('rolled back: her session still works (the app keeps her signed in)', (await client.api('GET', '/auth/me', { token: uma.token })).status === 200);
    check('rolled back: no purge recorded, nothing audited', !(await rsDb.collection('accountdeletions').findOne({ user: oid(uma.id) })).purgedAt && (await rsDb.collection('moderationauditlogs').countDocuments({ action: 'ACCOUNT_DELETED', targetId: oid(uma.id) })) === 0);
    await rsDb.collection('accountdeletions').updateOne({ user: oid(uma.id) }, { $set: { 'affected.likedPosts': [] } });
    const retried = await client.api('DELETE', '/auth/account', { token: uma.token, body: good() });
    check('trying again once the problem is gone → 200, everything removed', retried.status === 200 && !(await rsDb.collection('users').findOne({ _id: oid(uma.id) })) && (await rsDb.collection('posts').countDocuments({ _id: oid(umaPost) })) === 0, retried.body);
    check('the replica-set backend logged the rollback', /was rolled back/.test(backend.log()));
  });
} catch (error) {
  check(`suite crashed: ${error?.message}`, false, error?.stack);
} finally {
  await t.finish();
}
