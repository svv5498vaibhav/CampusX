// Notifications and real time (Phase 11): like/comment/team/achievement/community/opportunity/badge/
// level/moderation notifications, grouping, no self-notifications, withdrawal of a taken-back like,
// unread count, read/read-all/delete, preferences, ownership, Socket.IO delivery and the REST fallback.
// (CampusX comments are flat: there are no replies, so "reply" notifications don't exist.)
import { createSuite, eventually, oid, sleep } from '../lib/harness.mjs';
import { jpg } from '../lib/files.mjs';

const t = await createSuite('notifications', { cloudinary: true });
const { check, section, api, register, upload, db, connectSocket } = t;
const list = async (who, query = '') => (await api('GET', `/notifications${query}`, { token: who.token })).data;
const unread = async (who) => (await api('GET', '/notifications/unread-count', { token: who.token })).data.unreadCount;
const ofType = async (who, type) => (await list(who, '?limit=50')).notifications.filter((note) => note.type === type);

try {
  section('Setup');
  const asha = await register('Asha', 'Rao');
  const bilal = await register('Bilal', 'Khan');
  const chitra = await register('Chitra', 'Iyer');
  const mod = await register('Milo', 'Moderator');
  await db.collection('users').updateOne({ _id: oid(mod.id) }, { $set: { role: 'moderator' } });
  await t.relogin(mod);
  await sleep(600);
  check('welcome notification after onboarding', (await ofType(asha, 'SYSTEM_NOTIFICATION')).length === 1);

  section('Live delivery over Socket.IO');
  const { socket, error } = await connectSocket(asha.token);
  check('socket connects with the access token', !error, error);
  const live = [];
  const counts = [];
  socket.on('notification:new', (payload) => live.push(payload));
  socket.on('notification:count', (payload) => counts.push(payload.unreadCount));
  const post = await api('POST', '/posts', { token: asha.token, body: { content: 'Robotics club demo on Friday in the main hall, everyone welcome.', visibility: 'public' } });
  const postId = post.data.post.id;
  await api('POST', `/posts/${postId}/like`, { token: bilal.token });
  const pushed = await eventually(() => live.find((payload) => payload.notification?.type === 'POST_LIKED'));
  check('like → notification pushed live with the unread count', Boolean(pushed) && typeof pushed.unreadCount === 'number', live.map((payload) => payload.notification?.type));
  check('the pushed notification names the liker (public summary only)', pushed?.notification?.actor?.id === bilal.id && !JSON.stringify(pushed).includes(bilal.email));
  check('REST fallback lists the same notification', (await ofType(asha, 'POST_LIKED')).some((note) => note.id === pushed?.notification?.id));

  section('Repeats, grouping, withdrawal, no self-notifications');
  await api('DELETE', `/posts/${postId}/like`, { token: bilal.token });
  await sleep(600);
  check('a like taken back before it was seen is withdrawn', (await ofType(asha, 'POST_LIKED')).length === 0);
  await api('POST', `/posts/${postId}/like`, { token: bilal.token });
  await api('POST', `/posts/${postId}/like`, { token: bilal.token });
  await sleep(600);
  check('liking again notifies once (never twice)', (await ofType(asha, 'POST_LIKED')).length === 1);
  await api('POST', `/posts/${postId}/like`, { token: asha.token });
  await api('POST', `/posts/${postId}/comments`, { token: asha.token, body: { content: 'Thanks for the interest everyone!' } });
  await sleep(600);
  check('own likes and comments never notify yourself', (await ofType(asha, 'POST_LIKED')).length === 1 && (await ofType(asha, 'POST_COMMENTED')).length === 0);
  await api('POST', `/posts/${postId}/comments`, { token: bilal.token, body: { content: 'I will bring my line follower bot.' } });
  await api('POST', `/posts/${postId}/comments`, { token: bilal.token, body: { content: 'And a spare battery pack too.' } });
  await api('POST', `/posts/${postId}/comments`, { token: chitra.token, body: { content: 'Count me in for the demo too.' } });
  await sleep(700);
  const commented = await ofType(asha, 'POST_COMMENTED');
  const fromBilal = commented.filter((note) => note.actor?.id === bilal.id);
  check("one student's repeated comments are grouped (\"left 2 comments\"), other students stay separate", commented.length === 2 && fromBilal.length === 1 && /2 comments/.test(fromBilal[0].message), commented.map((note) => note.message));

  section('Other notification types');
  await api('POST', '/projects', { token: asha.token, body: { title: 'Campus Bus Tracker', shortDescription: 'Live bus locations for the college shuttle.', description: 'A web app showing where the college shuttle is using GPS pings from the driver phone.', category: 'web', teamMembers: [{ user: bilal.id, role: 'designer' }] } });
  await sleep(600);
  check('team invitation', (await ofType(bilal, 'PROJECT_TEAM_INVITE')).length === 1);
  const achievement = await api('POST', '/achievements', { token: asha.token, body: { title: 'Winner, Campus Code Sprint', type: 'competition', date: '2026-08-15', organization: 'VNIT Coding Club' } });
  await upload(`/achievements/${achievement.data.achievement.id}/proof`, asha.token, 'proof', [jpg()]);
  await api('PATCH', `/achievements/${achievement.data.achievement.id}/verification`, { token: mod.token, body: { status: 'verified' } });
  await sleep(700);
  check('achievement verified', (await ofType(asha, 'ACHIEVEMENT_VERIFIED')).length === 1);
  check('badges and level-up', (await ofType(asha, 'BADGE_EARNED')).length >= 1 && (await ofType(asha, 'LEVEL_UP')).length === 1, (await list(asha, '?limit=50')).notifications.map((note) => note.type));
  const community = await api('POST', '/communities', { token: asha.token, body: { name: 'Night Owl Coders', description: 'Late night coding sessions and doubt solving.', type: 'student-created', visibility: 'college', tags: ['coding'] } });
  await api('POST', `/communities/${community.data.community.id}/join`, { token: chitra.token });
  await sleep(600);
  check('community owner hears about a new member', (await ofType(asha, 'COMMUNITY_JOINED')).length === 1);
  const opportunity = await api('POST', '/opportunities', { token: mod.token, body: { title: 'Campus AI Hackathon 2026', shortDescription: 'A 24 hour hackathon on AI for campus life.', description: 'Build AI tools that make campus life easier. Teams of up to four students from any branch.', type: 'hackathon', organizer: 'CampusX Tech Club', mode: 'online', applicationDeadline: new Date(Date.now() + 20 * 86400000).toISOString(), status: 'published' } });
  await api('POST', `/opportunities/${opportunity.data.opportunity.id}/track`, { token: chitra.token, body: {} });
  await api('PUT', `/opportunities/${opportunity.data.opportunity.id}`, { token: mod.token, body: { applicationDeadline: new Date(Date.now() + 25 * 86400000).toISOString() } });
  await sleep(700);
  check('students tracking an opportunity hear about a changed deadline', (await list(chitra, '?limit=50')).notifications.some((note) => /OPPORTUNITY/.test(note.type)), (await list(chitra, '?limit=50')).notifications.map((note) => note.type));
  const bad = await api('POST', '/posts', { token: chitra.token, body: { content: 'My notes for the DBMS end semester exam are available, message me for the drive folder.', visibility: 'public' } });
  const filed = await api('POST', '/reports', { token: bilal.token, body: { targetType: 'post', targetId: bad.data.post.id, reason: 'spam' } });
  check('report filed on a visible post', filed.status === 201, filed.body);
  const admin = await register('Ada', 'Admin');
  await db.collection('users').updateOne({ _id: oid(admin.id) }, { $set: { role: 'admin' } });
  await t.relogin(admin);
  await api('PATCH', `/admin/content/post/${bad.data.post.id}`, { token: admin.token, body: { action: 'remove', reason: 'Spam advertising removed', confirm: true } });
  await sleep(800);
  check('content removed: the author is told (system notification)', (await ofType(chitra, 'CONTENT_REMOVED')).length === 1);
  check('the removal notice never names the reporter', !JSON.stringify(await ofType(chitra, 'CONTENT_REMOVED')).includes(bilal.id));
  check('the reporter hears that the report was handled', (await list(bilal, '?limit=50')).notifications.some((note) => note.type === 'REPORT_REVIEWED'), (await list(bilal, '?limit=50')).notifications.map((note) => note.type));

  section('Read, read all, delete, ownership');
  const before = await unread(asha);
  check('unread count matches the unread list', before === (await list(asha, '?filter=unread&limit=50')).notifications.length, before);
  const first = (await list(asha)).notifications[0];
  const readOne = await api('PATCH', `/notifications/${first.id}/read`, { token: asha.token });
  check('mark one read → unread count goes down by one', readOne.status === 200 && (await unread(asha)) === before - 1);
  const readEvent = await eventually(() => counts.at(-1) === before - 1);
  check('the read state reaches other tabs live (notification:count)', Boolean(readEvent), counts.slice(-3));
  check("someone else's notification id → 404", (await api('PATCH', `/notifications/${first.id}/read`, { token: bilal.token })).status === 404);
  check('malformed id → 404 or 422', [404, 422].includes((await api('PATCH', '/notifications/not-an-id/read', { token: asha.token })).status));
  const all = await api('PATCH', '/notifications/read-all', { token: asha.token });
  check('mark all read → 0 unread', all.status === 200 && (await unread(asha)) === 0);
  const del = await api('DELETE', `/notifications/${first.id}`, { token: asha.token });
  check('delete one → gone', del.status === 200 && !(await list(asha, '?limit=50')).notifications.some((note) => note.id === first.id));
  check("deleting someone else's → 404", (await api('DELETE', `/notifications/${(await list(bilal)).notifications[0].id}`, { token: asha.token })).status === 404);
  const cleared = await api('DELETE', '/notifications/read', { token: asha.token });
  check('clear read notifications', cleared.status === 200 && (await list(asha)).notifications.length === 0);
  check('unknown filter → 422; page size above the maximum → 422', (await api('GET', '/notifications?filter=archived', { token: asha.token })).status === 422 && (await api('GET', '/notifications?limit=500', { token: asha.token })).status === 422);

  section('Preferences');
  const prefs = await api('GET', '/notifications/preferences', { token: asha.token });
  check('preferences listed with categories', prefs.status === 200 && JSON.stringify(prefs.body).includes('likes'));
  check('system notifications cannot be turned off (422)', (await api('PUT', '/notifications/preferences', { token: asha.token, body: { system: false } })).status === 422);
  check('non-boolean preference → 422', (await api('PUT', '/notifications/preferences', { token: asha.token, body: { likes: 'nope' } })).status === 422);
  check('turn off likes → 200', (await api('PUT', '/notifications/preferences', { token: asha.token, body: { likes: false } })).status === 200);
  await api('POST', `/posts/${postId}/like`, { token: chitra.token });
  await sleep(600);
  check('with likes off, no like notification is created', (await ofType(asha, 'POST_LIKED')).length === 0);
  socket.close();
} catch (error) {
  check('suite ran to the end without crashing', false, error.stack);
}
await t.finish();
