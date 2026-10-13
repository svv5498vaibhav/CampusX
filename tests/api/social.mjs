// Follows, blocks and direct messages: follow/unfollow, duplicate and simultaneous requests, self-follow,
// counts from the relationships, paginated followers/following lists, search inside a list, follow status
// for cards, blocks in both directions, suspended accounts, "started following you" notifications (once,
// withdrawn when taken back, preference off), live updates over Socket.IO, conversations (one per pair even
// when opened at once), messages (validation, retries, unsafe links, posting pause, rate limit), participant
// authorization, read state, and account deletion removing all of it.
import { collect, createSuite, eventually, mongoose, oid, sleep } from '../lib/harness.mjs';

const t = await createSuite('social');
const { check, section, api, register, db, connectSocket } = t;

const follow = (who, target) => api('POST', `/users/${target.id ?? target}/follow`, { token: who.token });
const unfollow = (who, target) => api('DELETE', `/users/${target.id ?? target}/follow`, { token: who.token });
const block = (who, target) => api('POST', `/users/${target.id ?? target}/block`, { token: who.token });
const unblock = (who, target) => api('DELETE', `/users/${target.id ?? target}/block`, { token: who.token });
const profileOf = async (viewer, target) => (await api('GET', `/profile/${target.id}`, { token: viewer.token })).data?.profile;
const ownProfile = async (who) => (await api('GET', '/profile', { token: who.token })).data?.profile;
const notificationsOf = async (who, type) => ((await api('GET', '/notifications?limit=50', { token: who.token })).data?.notifications ?? []).filter((note) => !type || note.type === type);
const followRows = (filter) => db.collection('follows').countDocuments(filter);
const openChat = (who, target) => api('POST', '/conversations', { token: who.token, body: { userId: target.id ?? target } });
const send = (who, conversationId, text, extra = {}) => api('POST', `/conversations/${conversationId}/messages`, { token: who.token, body: { text, ...extra } });
const inbox = async (who, query = '') => (await api('GET', `/conversations${query}`, { token: who.token })).data;
const unreadConversations = async (who) => (await api('GET', '/conversations/unread-count', { token: who.token })).data?.unreadCount;
const leaksPrivate = (body) => collect(body, 'email').length > 0 || collect(body, 'rollNumber').length > 0 || collect(body, 'passwordHash').length > 0;

/** Active students written straight to the database (bulk data for pagination). */
async function insertStudents(prefix, count) {
  const now = new Date();
  const docs = Array.from({ length: count }, (_, index) => ({
    _id: new mongoose.Types.ObjectId(),
    email: `${prefix.toLowerCase()}${index}@bulk.campusx.dev`,
    passwordHash: 'not-a-real-hash',
    firstName: `${prefix}${String(index).padStart(2, '0')}`,
    lastName: index % 2 ? 'Patil' : 'Shah',
    role: 'student',
    status: 'active',
    onboardingCompleted: true,
    college: 'vnit-nagpur',
    branch: 'cse',
    semester: 3,
    interests: [],
    skills: [],
    bio: '',
    createdAt: now,
    updatedAt: now,
  }));
  await db.collection('users').insertMany(docs);
  return docs;
}

try {
  section('Setup');
  const asha = await register('Asha', 'Rao');
  const bilal = await register('Bilal', 'Khan');
  const chitra = await register('Chitra', 'Iyer');
  const dev = await register('Dev', 'Menon');
  const esha = await register('Esha', 'Nair');
  const admin = await register('Ada', 'Admin');
  await db.collection('users').updateOne({ _id: oid(admin.id) }, { $set: { role: 'admin' } });
  await t.relogin(admin);
  await sleep(500);
  check('six accounts ready', [asha, bilal, chitra, dev, esha, admin].every((who) => who.token));

  section('Guards and validation');
  check('follow without a token → 401', (await api('POST', `/users/${bilal.id}/follow`)).status === 401);
  check('followers without a token → 401', (await api('GET', `/users/${bilal.id}/followers`)).status === 401);
  check('conversations without a token → 401', (await api('GET', '/conversations')).status === 401);
  check('open conversation without a token → 401', (await api('POST', '/conversations', { body: { userId: bilal.id } })).status === 401);
  check('forged token → 401', (await api('POST', `/users/${bilal.id}/follow`, { token: `${asha.token.slice(0, -4)}abcd` })).status === 401);
  check('malformed student id → 422', (await follow(asha, 'not-an-id')).status === 422);
  check('unknown student → 404', (await follow(asha, '64b7f0f0f0f0f0f0f0f0f0f0')).status === 404);
  const selfFollow = await follow(asha, asha);
  check('following yourself → 422', selfFollow.status === 422, selfFollow.body);
  check('unfollowing yourself → 422', (await unfollow(asha, asha)).status === 422);
  check('no relationship was saved for the self-follow', (await followRows({ follower: oid(asha.id), following: oid(asha.id) })) === 0);

  section('Follow and unfollow');
  const first = await follow(asha, bilal);
  check('follow → 201', first.status === 201, first.body);
  check('response: following, counts from the database', first.data?.relationship?.isFollowing === true && first.data?.counts?.followersCount === 1 && first.data?.viewerCounts?.followingCount === 1, first.data);
  check('response names no email', !leaksPrivate(first.body));
  const again = await follow(asha, bilal);
  check('following again → 200, nothing changed', again.status === 200 && again.data?.changed === false && again.data?.counts?.followersCount === 1, again.data);
  const burst = await Promise.all(Array.from({ length: 10 }, () => follow(chitra, bilal)));
  check('10 simultaneous follows → exactly one 201, the rest 200', burst.filter((res) => res.status === 201).length === 1 && burst.every((res) => [200, 201].includes(res.status)), burst.map((res) => res.status));
  check('one relationship stored for the burst', (await followRows({ follower: oid(chitra.id), following: oid(bilal.id) })) === 1);
  const viewed = await profileOf(asha, bilal);
  check("profile shows the real follower count (2) and the viewer's relationship", viewed?.social?.followersCount === 2 && viewed?.social?.followingCount === 0 && viewed?.social?.relationship?.isFollowing === true && viewed?.social?.relationship?.followsYou === false, viewed?.social);
  const own = await ownProfile(bilal);
  check('own profile shows counts and no relationship', own?.social?.followersCount === 2 && own?.social?.relationship === null, own?.social);
  await follow(bilal, asha);
  check('"follows you" once the other student follows back', (await profileOf(asha, bilal))?.social?.relationship?.followsYou === true);
  const off = await unfollow(chitra, bilal);
  check('unfollow → 200, count goes down', off.status === 200 && off.data?.changed === true && off.data?.counts?.followersCount === 1 && off.data?.relationship?.isFollowing === false, off.data);
  const offAgain = await unfollow(chitra, bilal);
  check('unfollowing again → 200, nothing changed', offAgain.status === 200 && offAgain.data?.changed === false && offAgain.data?.counts?.followersCount === 1);
  const mixed = await Promise.all([follow(dev, esha), unfollow(dev, esha), follow(dev, esha), follow(dev, esha), unfollow(dev, esha), follow(dev, esha)]);
  const devEsha = await followRows({ follower: oid(dev.id), following: oid(esha.id) });
  const eshaCount = (await ownProfile(esha))?.social?.followersCount;
  check('interleaved follow/unfollow requests leave at most one relationship and a count that matches it', devEsha <= 1 && eshaCount === devEsha && mixed.every((res) => res.status < 300), { devEsha, eshaCount });
  await unfollow(dev, esha);

  section('Notifications');
  await sleep(600);
  const followedNotes = await notificationsOf(bilal, 'STUDENT_FOLLOWED');
  const fromAsha = followedNotes.filter((note) => note.actor?.id === asha.id);
  check('"Asha Rao started following you." once, linking to her profile', fromAsha.length === 1 && fromAsha[0].message === 'Asha Rao started following you.' && fromAsha[0].entity?.type === 'student' && fromAsha[0].entity?.id === asha.id && fromAsha[0].entity?.available === true, followedNotes);
  check('the burst of 10 duplicate follows was taken back with the unfollow (no notification left from Chitra)', followedNotes.filter((note) => note.actor?.id === chitra.id).length === 0, followedNotes.map((note) => note.actor?.id));
  await follow(chitra, bilal);
  await sleep(500);
  const chitraNotes = (await notificationsOf(bilal, 'STUDENT_FOLLOWED')).filter((note) => note.actor?.id === chitra.id);
  check('following again notifies once', chitraNotes.length === 1);
  await api('PATCH', `/notifications/${chitraNotes[0]?.id}/read`, { token: bilal.token });
  await unfollow(chitra, bilal);
  await follow(chitra, bilal);
  await sleep(500);
  check('after it was read, unfollow + follow never notifies twice', (await notificationsOf(bilal, 'STUDENT_FOLLOWED')).filter((note) => note.actor?.id === chitra.id).length === 1);
  check('no "unfollowed" notification of any kind', (await notificationsOf(bilal)).every((note) => !/unfollow/i.test(note.message)));
  check('the follower is not notified about their own follow', (await notificationsOf(asha, 'STUDENT_FOLLOWED')).every((note) => note.actor?.id !== asha.id));
  const prefs = await api('PUT', '/notifications/preferences', { token: dev.token, body: { followers: false } });
  check('"New followers" can be turned off', prefs.status === 200 && prefs.data?.preferences?.followers === false, prefs.body);
  await follow(esha, dev);
  await sleep(500);
  check('…and then no follow notification arrives', (await notificationsOf(dev, 'STUDENT_FOLLOWED')).length === 0);
  const categories = (await api('GET', '/notifications/preferences', { token: dev.token })).data?.categories ?? [];
  check('the category is listed for the settings screen', categories.some((category) => category.id === 'followers'));

  section('Live updates over Socket.IO');
  const bilalLive = await connectSocket(bilal.token);
  const ashaLive = await connectSocket(asha.token);
  check('both sockets connect', !bilalLive.error && !ashaLive.error, [bilalLive.error, ashaLive.error]);
  const counts = [];
  const relationshipEvents = [];
  const bilalRelationship = [];
  bilalLive.socket.on('follow:counts', (payload) => counts.push(payload));
  bilalLive.socket.on('relationship:updated', (payload) => bilalRelationship.push(payload));
  ashaLive.socket.on('relationship:updated', (payload) => relationshipEvents.push(payload));
  await unfollow(asha, bilal);
  await follow(asha, bilal);
  const pushed = await eventually(() => counts.length >= 2 && relationshipEvents.length >= 2);
  check("the followed student's tabs get their new counts", Boolean(pushed) && counts.at(-1)?.followersCount === 2, counts);
  check('…without any id saying who it was', counts.every((payload) => Object.keys(payload).sort().join() === 'at,followersCount,followingCount'), counts);
  check("the follower's own tabs get the relationship and both sides' counts", relationshipEvents.at(-1)?.userId === bilal.id && relationshipEvents.at(-1)?.relationship?.isFollowing === true && typeof relationshipEvents.at(-1)?.viewerCounts?.followingCount === 'number', relationshipEvents.at(-1));
  check('the followed student never gets the relationship event', bilalRelationship.length === 0);

  section('Followers and following lists');
  const crowd = await insertStudents('Crowd', 25);
  // Lists are ordered by relationship id. These ids are made by this test process, not the database: wait for
  // the next second so they sort after Esha's follow (ObjectIds order by second, then by process).
  await sleep(1100);
  await db.collection('follows').insertMany(crowd.map((student, index) => ({ follower: student._id, following: oid(dev.id), followerActive: true, followingActive: true, createdAt: new Date(Date.now() - (25 - index) * 1000) })));
  await db.collection('follows').insertMany(crowd.slice(0, 7).map((student) => ({ follower: oid(dev.id), following: student._id, followerActive: true, followingActive: true, createdAt: new Date() })));
  await follow(asha, crowd[3]._id.toString());
  const page1 = await api('GET', `/users/${dev.id}/followers?limit=10`, { token: asha.token });
  check('page 1: 10 students, more to come, total = 26 (25 + Esha)', page1.status === 200 && page1.data?.students?.length === 10 && page1.data?.pagination?.hasMore === true && page1.data?.total === 26, page1.data && { n: page1.data.students?.length, total: page1.data.total, p: page1.data.pagination });
  const page2 = await api('GET', `/users/${dev.id}/followers?limit=10&cursor=${page1.data?.pagination?.nextCursor}`, { token: asha.token });
  const page3 = await api('GET', `/users/${dev.id}/followers?limit=10&cursor=${page2.data?.pagination?.nextCursor}`, { token: asha.token });
  const allIds = [...page1.data.students, ...(page2.data?.students ?? []), ...(page3.data?.students ?? [])].map((student) => student.id);
  check('pages 2 and 3 complete the list without repeats', allIds.length === 26 && new Set(allIds).size === 26 && page3.data?.pagination?.hasMore === false && page3.data?.pagination?.nextCursor === null, { n: allIds.length, unique: new Set(allIds).size });
  check('newest relationship first (the bulk followers were added after Esha followed)', page1.data.students[0]?.id === crowd[24]._id.toString() && page3.data?.students?.at(-1)?.id === esha.id, page1.data.students.slice(0, 2).map((student) => student.firstName));
  const everyone = [...page1.data.students, ...page2.data.students, ...page3.data.students];
  check("each row has the viewer's own follow state", everyone.find((student) => student.id === crowd[3]._id.toString())?.isFollowing === true && everyone.find((student) => student.id === esha.id)?.isFollowing === false);
  check('rows are public summaries: name, photo, campus; never email or roll number', !leaksPrivate(page1.body) && page1.data.students[0]?.college?.name && 'avatarUrl' in page1.data.students[0], page1.data.students[0]);
  const followingList = await api('GET', `/users/${dev.id}/following?limit=50`, { token: chitra.token });
  check('following list: the 7 students Dev follows', followingList.status === 200 && followingList.data?.students?.length === 7 && followingList.data?.total === 7);
  const searched = await api('GET', `/users/${dev.id}/followers?search=crowd0&limit=50`, { token: asha.token });
  check('search inside a list matches name starts ("crowd0" → Crowd00–Crowd09)', searched.status === 200 && searched.data?.students?.length === 10 && searched.data.students.every((student) => student.firstName.startsWith('Crowd0')), searched.data?.students?.map((student) => student.firstName));
  const searchedTwo = await api('GET', `/users/${dev.id}/followers?search=crowd1 patil&limit=50`, { token: asha.token });
  check('every search word must match', searchedTwo.data?.students?.length === 5 && searchedTwo.data.students.every((student) => student.lastName === 'Patil'), searchedTwo.data?.students?.map((student) => `${student.firstName} ${student.lastName}`));
  const regexy = await api('GET', `/users/${dev.id}/followers?search=${encodeURIComponent('.*')}`, { token: asha.token });
  check('search text is literal, never a pattern', regexy.status === 200 && regexy.data?.students?.length === 0);
  const empty = await api('GET', `/users/${esha.id}/following`, { token: asha.token });
  check("a short list: Esha follows only Dev", empty.status === 200 && empty.data?.students?.length === 1 && empty.data?.students?.[0]?.id === dev.id && empty.data?.total === 1, empty.data);
  const emptier = await api('GET', `/users/${chitra.id}/followers`, { token: asha.token });
  check('a student with no followers → empty list, nothing more', emptier.status === 200 && emptier.data?.students?.length === 0 && emptier.data?.total === 0 && emptier.data?.pagination?.hasMore === false);
  for (const query of ['limit=0', 'limit=51', 'cursor=abc', `search=${'x'.repeat(61)}`]) {
    check(`bad list query (${query.slice(0, 20)}) → 422`, (await api('GET', `/users/${dev.id}/followers?${query}`, { token: asha.token })).status === 422);
  }
  check('list of an unknown student → 404', (await api('GET', '/users/64b7f0f0f0f0f0f0f0f0f0f0/followers', { token: asha.token })).status === 404);
  const statuses = await api('GET', `/users/follow-status?ids=${bilal.id},${chitra.id},${asha.id},64b7f0f0f0f0f0f0f0f0f0f0`, { token: asha.token });
  check('follow status for cards: following Bilal, not Chitra, not yourself, unknown left out', statuses.status === 200 && statuses.data?.statuses?.[bilal.id]?.isFollowing === true && statuses.data?.statuses?.[chitra.id]?.isFollowing === false && statuses.data?.statuses?.[asha.id]?.canFollow === false && !(('64b7f0f0f0f0f0f0f0f0f0f0') in statuses.data.statuses), statuses.data);
  check('follow status: too many ids → 422', (await api('GET', `/users/follow-status?ids=${Array.from({ length: 51 }, () => asha.id).map((id, index) => `${id.slice(0, 20)}${String(index).padStart(4, '0')}`).join(',')}`, { token: asha.token })).status === 422);
  check('follow status: bad id → 422', (await api('GET', '/users/follow-status?ids=nope', { token: asha.token })).status === 422);

  section('Blocks');
  check('blocking yourself → 422', (await block(asha, asha)).status === 422);
  const beforeBlock = (await ownProfile(asha))?.social;
  const blocked = await block(bilal, asha);
  check('block → 200, follows both ways end', blocked.status === 200 && blocked.data?.relationship?.blockedByYou === true && blocked.data?.relationship?.isFollowing === false && (await followRows({ $or: [{ follower: oid(asha.id), following: oid(bilal.id) }, { follower: oid(bilal.id), following: oid(asha.id) }] })) === 0, blocked.data);
  const afterBlock = (await ownProfile(asha))?.social;
  check("counts follow at once (Asha lost a follower and a following)", afterBlock.followersCount === beforeBlock.followersCount - 1 && afterBlock.followingCount === beforeBlock.followingCount - 1, { beforeBlock, afterBlock });
  check('the blocked student cannot follow → 403', (await follow(asha, bilal)).status === 403);
  check('the blocker cannot follow either while blocking → 403', (await follow(bilal, asha)).status === 403);
  const blockedView = (await profileOf(asha, bilal))?.social?.relationship;
  check("the blocked student's view: can't follow or message, and the block itself isn't named", blockedView?.canFollow === false && blockedView?.canMessage === false && blockedView?.blockedByYou === false, blockedView);
  check("the blocker's view says they blocked", (await profileOf(bilal, asha))?.social?.relationship?.blockedByYou === true);
  check('blocking again is harmless', (await block(bilal, asha)).status === 200 && (await db.collection('blocks').countDocuments({ blocker: oid(bilal.id), blocked: oid(asha.id) })) === 1);
  check('the blocked student is not notified', (await notificationsOf(asha)).every((note) => !/block/i.test(note.message)));
  const unblocked = await unblock(bilal, asha);
  check('unblock → can follow again', unblocked.status === 200 && unblocked.data?.relationship?.canFollow === true && (await follow(asha, bilal)).status === 201);

  section('Suspended and blocked accounts');
  const chitraFollowsBilal = await followRows({ follower: oid(chitra.id), following: oid(bilal.id) });
  const bilalBefore = (await ownProfile(bilal))?.social?.followersCount;
  const suspended = await api('PATCH', `/admin/users/${chitra.id}/status`, { token: admin.token, body: { action: 'suspend', reason: 'Testing follow counts', confirm: true } });
  check('admin suspends Chitra', suspended.status === 200, suspended.body);
  const bilalDuring = (await ownProfile(bilal))?.social?.followersCount;
  check("a suspended follower drops out of the count…", chitraFollowsBilal === 1 && bilalDuring === bilalBefore - 1, { bilalBefore, bilalDuring });
  check('…and out of the list', !((await api('GET', `/users/${bilal.id}/followers?limit=50`, { token: asha.token })).data?.students ?? []).some((student) => student.id === chitra.id));
  check('the relationship itself is kept (restored with the account)', (await followRows({ follower: oid(chitra.id), following: oid(bilal.id) })) === 1);
  check('following a suspended student → 404', (await follow(asha, chitra)).status === 404);
  check("a suspended student's lists → 404", (await api('GET', `/users/${chitra.id}/following`, { token: asha.token })).status === 404);
  check('the suspended student cannot act (session ended)', [401, 403].includes((await follow(chitra, asha)).status));
  await api('PATCH', `/admin/users/${chitra.id}/status`, { token: admin.token, body: { action: 'unsuspend' } });
  check('restored: back in the count', (await ownProfile(bilal))?.social?.followersCount === bilalBefore);
  await t.relogin(chitra);

  section('Conversations');
  const opened = await openChat(asha, bilal);
  check('Message → a new conversation (201)', opened.status === 201 && opened.data?.created === true && opened.data?.conversation?.participant?.id === bilal.id, opened.body);
  const conversationId = opened.data?.conversation?.id;
  const reopened = await openChat(asha, bilal);
  check('opening it again → the same conversation (200)', reopened.status === 200 && reopened.data?.conversation?.id === conversationId);
  const fromOtherSide = await openChat(bilal, asha);
  check('the other student opening it → the same conversation', fromOtherSide.data?.conversation?.id === conversationId && fromOtherSide.data?.conversation?.participant?.id === asha.id);
  const race = await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? openChat(dev, esha) : openChat(esha, dev))));
  const raceIds = new Set(race.map((res) => res.data?.conversation?.id));
  check('8 simultaneous opens from both sides → one conversation', race.every((res) => [200, 201].includes(res.status)) && raceIds.size === 1 && (await db.collection('conversations').countDocuments({ participants: { $all: [oid(dev.id), oid(esha.id)] } })) === 1, race.map((res) => res.status));
  check('messaging yourself → 422', (await openChat(asha, asha)).status === 422);
  check('bad student id → 422', (await api('POST', '/conversations', { token: asha.token, body: { userId: { $ne: null } } })).status === 422);
  check('unknown student → 404', (await openChat(asha, '64b7f0f0f0f0f0f0f0f0f0f0')).status === 404);
  check('an empty conversation is in nobody\'s inbox yet', (await inbox(asha)).conversations.length === 0 && (await inbox(bilal)).conversations.length === 0);
  check('opening a conversation follows nobody', (await followRows({ follower: oid(dev.id), following: oid(esha.id) })) === 0);

  section('Messages');
  const bilalChat = await connectSocket(bilal.token);
  const ashaChat = await connectSocket(asha.token);
  const bilalMessages = [];
  const ashaMessages = [];
  const bilalUnread = [];
  const ashaReads = [];
  bilalChat.socket.on('message:new', (payload) => bilalMessages.push(payload));
  bilalChat.socket.on('message:unread-count', (payload) => bilalUnread.push(payload.unreadCount));
  ashaChat.socket.on('message:new', (payload) => ashaMessages.push(payload));
  ashaChat.socket.on('conversation:read', (payload) => ashaReads.push(payload));
  const sent = await send(asha, conversationId, '  Hi Bilal!\n\n\n\nAre you joining the robotics demo?  ', { sender: chitra.id, conversation: '64b7f0f0f0f0f0f0f0f0f0f0' });
  check('send → 201, text cleaned, sender is always the signed-in student', sent.status === 201 && sent.data?.message?.text === 'Hi Bilal!\n\nAre you joining the robotics demo?' && sent.data?.message?.senderId === asha.id && sent.data?.message?.isMine === true, sent.body);
  check('the message is saved once in the right conversation', (await db.collection('messages').countDocuments({ conversation: oid(conversationId) })) === 1);
  const live = await eventually(() => bilalMessages.length && ashaMessages.length && bilalUnread.length);
  check("delivered live to the recipient, from their side", Boolean(live) && bilalMessages[0]?.message?.isMine === false && bilalMessages[0]?.conversation?.participant?.id === asha.id && bilalMessages[0]?.conversation?.unreadCount === 1, bilalMessages[0]);
  check("…and to the sender's other tabs", ashaMessages[0]?.message?.isMine === true && ashaMessages[0]?.conversation?.participant?.id === bilal.id);
  check('the recipient gets their unread conversation count', bilalUnread.at(-1) === 1, bilalUnread);
  check('socket payloads carry no email', !leaksPrivate(bilalMessages) && !leaksPrivate(ashaMessages));
  const bilalInbox = await inbox(bilal);
  check("now it's in both inboxes, with a preview and unread for the recipient", bilalInbox.conversations.length === 1 && bilalInbox.conversations[0].lastMessage?.preview?.startsWith('Hi Bilal!') && bilalInbox.conversations[0].unreadCount === 1 && bilalInbox.unreadCount === 1 && (await inbox(asha)).conversations[0]?.unreadCount === 0, bilalInbox);
  check('unread-count endpoint agrees', (await unreadConversations(bilal)) === 1 && (await unreadConversations(asha)) === 0);

  const retryId = 'retry-0001-abcdef';
  const firstTry = await send(asha, conversationId, 'Sending this once', { clientId: retryId });
  const secondTry = await send(asha, conversationId, 'Sending this once', { clientId: retryId });
  check('a retried send (same clientId) returns the saved message, no duplicate', firstTry.status === 201 && secondTry.status === 200 && secondTry.data?.duplicate === true && secondTry.data?.message?.id === firstTry.data?.message?.id && (await db.collection('messages').countDocuments({ clientId: retryId })) === 1);
  const parallelRetries = await Promise.all(Array.from({ length: 5 }, () => send(asha, conversationId, 'Flaky network message', { clientId: 'retry-0002-parallel' })));
  check('5 simultaneous retries → one message', new Set(parallelRetries.map((res) => res.data?.message?.id)).size === 1 && (await db.collection('messages').countDocuments({ clientId: 'retry-0002-parallel' })) === 1, parallelRetries.map((res) => res.status));
  check('empty message → 422', (await send(asha, conversationId, '   \n  ')).status === 422);
  check('too long → 422', (await send(asha, conversationId, 'x'.repeat(2001))).status === 422);
  check('not text → 422', (await send(asha, conversationId, { $gt: '' })).status === 422);
  check('bad clientId → 422', (await send(asha, conversationId, 'hello', { clientId: 'bad id!' })).status === 422);
  const unsafe = await send(asha, conversationId, 'Click javascript:alert(document.cookie) for notes');
  check('unsafe link → 422, not saved', unsafe.status === 422 && (await db.collection('messages').countDocuments({ text: /javascript:/ })) === 0, unsafe.body);
  const markup = await send(asha, conversationId, 'Use <b>bold</b> & a < b');
  check('plain text is stored as typed (shown as text, never HTML)', markup.status === 201 && markup.data?.message?.text === 'Use <b>bold</b> & a < b');

  section('Participants only');
  for (const [label, method, path, body] of [
    ['read the conversation', 'GET', `/conversations/${conversationId}`],
    ['read its messages', 'GET', `/conversations/${conversationId}/messages`],
    ['send into it', 'POST', `/conversations/${conversationId}/messages`, { text: 'Let me in' }],
    ['mark it read', 'POST', `/conversations/${conversationId}/read`],
  ]) {
    const res = await api(method, path, { token: chitra.token, body });
    check(`another student can't ${label} → 404 (looks missing)`, res.status === 404, res.status);
  }
  check('nothing was sent by the outsider', (await db.collection('messages').countDocuments({ sender: oid(chitra.id) })) === 0);
  check("the outsider's inbox doesn't list it", !(await inbox(chitra)).conversations.some((conversation) => conversation.id === conversationId));
  check('malformed conversation id → 422', (await api('GET', '/conversations/xyz/messages', { token: asha.token })).status === 422);

  section('History and read state');
  const history = await api('GET', `/conversations/${conversationId}/messages`, { token: bilal.token });
  check('history oldest first, from the reader\'s side', history.status === 200 && history.data?.messages?.length === 4 && history.data.messages[0].text.startsWith('Hi Bilal!') && history.data.messages.every((message) => message.isMine === false), history.data?.messages?.map((message) => message.text));
  check("the recipient never sees the sender's clientId", history.data.messages.every((message) => !('clientId' in message)));
  const read = await api('POST', `/conversations/${conversationId}/read`, { token: bilal.token });
  check('mark read → unread 0', read.status === 200 && read.data?.changed === true && read.data?.unreadCount === 0 && (await unreadConversations(bilal)) === 0, read.data);
  check('the sender sees it was read ("Seen")', Boolean(await eventually(() => ashaReads.find((payload) => payload.conversationId === conversationId && payload.userId === bilal.id))) && (await inbox(asha)).conversations[0]?.otherLastReadId === read.data?.lastReadId);
  check('reading again changes nothing', (await api('POST', `/conversations/${conversationId}/read`, { token: bilal.token })).data?.changed === false);
  const reply = await send(bilal, conversationId, "Yes! I'll bring the line follower.");
  check('a reply moves the conversation forward for both', reply.status === 201 && (await inbox(asha)).conversations[0]?.lastMessage?.id === reply.data?.message?.id && (await unreadConversations(asha)) === 1);
  const bulk = Array.from({ length: 45 }, (_, index) => ({ _id: new mongoose.Types.ObjectId(), conversation: oid(race[0].data.conversation.id), sender: index % 2 ? oid(dev.id) : oid(esha.id), text: `Message number ${index + 1}`, createdAt: new Date() }));
  await db.collection('messages').insertMany(bulk);
  const h1 = await api('GET', `/conversations/${race[0].data.conversation.id}/messages?limit=20`, { token: dev.token });
  const h2 = await api('GET', `/conversations/${race[0].data.conversation.id}/messages?limit=20&before=${h1.data?.pagination?.nextCursor}`, { token: dev.token });
  const h3 = await api('GET', `/conversations/${race[0].data.conversation.id}/messages?limit=20&before=${h2.data?.pagination?.nextCursor}`, { token: dev.token });
  const pages = [...h3.data.messages, ...h2.data.messages, ...h1.data.messages].map((message) => message.text);
  check('history pages back to the first message, no gaps or repeats', pages.length === 45 && pages[0] === 'Message number 1' && pages[44] === 'Message number 45' && new Set(pages).size === 45 && h3.data.pagination.hasMore === false, { n: pages.length, first: pages[0], last: pages[44] });
  check('history limit is validated', (await api('GET', `/conversations/${conversationId}/messages?limit=500`, { token: asha.token })).status === 422);

  section('Blocks, suspensions and posting pauses stop new messages');
  await block(bilal, asha);
  const blockedSend = await send(asha, conversationId, 'Are you there?');
  check('blocked → sending refused (403)', blockedSend.status === 403, blockedSend.body);
  check('…in both directions', (await send(bilal, conversationId, 'Hello?')).status === 403);
  check('the history stays readable', (await api('GET', `/conversations/${conversationId}/messages`, { token: asha.token })).status === 200);
  check('the conversation shows it can no longer be messaged', (await api('GET', `/conversations/${conversationId}`, { token: asha.token })).data?.conversation?.canMessage === false);
  check('starting a conversation while blocked → 403', (await openChat(asha, bilal)).status === 403);
  await unblock(bilal, asha);
  check('unblocked → messages flow again', (await send(asha, conversationId, 'Back again')).status === 201);
  await api('PATCH', `/admin/users/${bilal.id}/status`, { token: admin.token, body: { action: 'suspend', reason: 'Testing messages', confirm: true } });
  const toSuspended = await send(asha, conversationId, 'Hello?');
  check('the other student suspended → sending refused (403)', toSuspended.status === 403, toSuspended.body);
  const suspendedView = (await api('GET', `/conversations/${conversationId}`, { token: asha.token })).data?.conversation;
  check('…and they show as an unavailable CampusX student, no id', suspendedView?.participant?.unavailable === true && suspendedView?.participant?.id === null && suspendedView?.canMessage === false, suspendedView?.participant);
  await api('PATCH', `/admin/users/${bilal.id}/status`, { token: admin.token, body: { action: 'unsuspend' } });
  await t.relogin(bilal);
  await db.collection('users').updateOne({ _id: oid(asha.id) }, { $set: { 'moderation.restrictedUntil': new Date(Date.now() + 3_600_000) } });
  const paused = await send(asha, conversationId, 'Can I still send?');
  check('a student under a posting pause cannot send (403)', paused.status === 403, paused.body);
  await db.collection('users').updateOne({ _id: oid(asha.id) }, { $set: { 'moderation.restrictedUntil': new Date(Date.now() - 60_000) } });
  check('messaging never created a follow', (await followRows({ follower: oid(esha.id), following: oid(dev.id) })) === 1 && (await followRows({ follower: oid(dev.id), following: oid(esha.id) })) === 0);

  section('Rate limits');
  const spamChat = await openChat(esha, chitra);
  const spam = [];
  for (let index = 0; index < 31; index += 1) spam.push((await send(esha, spamChat.data.conversation.id, `Quick message ${index}`)).status);
  check('31 messages in a minute → the 31st is refused (429)', spam.slice(0, 30).every((status) => status === 201) && spam[30] === 429, spam);

  section('Account deletion removes follows, blocks and conversations');
  await block(dev, asha);
  const devConversations = await db.collection('conversations').find({ participants: oid(dev.id) }).project({ _id: 1 }).toArray();
  check('Dev has follows, a block and a conversation with messages before deleting', (await followRows({ $or: [{ follower: oid(dev.id) }, { following: oid(dev.id) }] })) > 0 && devConversations.length === 1 && (await db.collection('messages').countDocuments({ conversation: devConversations[0]._id })) === 45);
  const eshaFollowingBefore = (await ownProfile(esha))?.social?.followingCount;
  const deleted = await api('DELETE', '/auth/account', { token: dev.token, body: { password: 'Campus@Test#2026', confirmation: 'DELETE' } });
  check('Dev deletes their account', deleted.status === 200, deleted.body);
  await sleep(500);
  check('every follow to or from Dev is gone', (await followRows({ $or: [{ follower: oid(dev.id) }, { following: oid(dev.id) }] })) === 0);
  check('every block by or against Dev is gone', (await db.collection('blocks').countDocuments({ $or: [{ blocker: oid(dev.id) }, { blocked: oid(dev.id) }] })) === 0);
  check('their conversation and its messages are gone', (await db.collection('conversations').countDocuments({ participants: oid(dev.id) })) === 0 && (await db.collection('messages').countDocuments({ conversation: devConversations[0]._id })) === 0);
  check("other students' counts follow", (await ownProfile(esha))?.social?.followingCount === eshaFollowingBefore - 1);
  check("Esha's inbox no longer lists it", !(await inbox(esha)).conversations.some((conversation) => conversation.id === devConversations[0]._id.toString()));

  for (const live of [bilalLive, ashaLive, bilalChat, ashaChat]) live.socket.close();
} catch (error) {
  check('suite crashed', false, error?.stack ?? String(error));
} finally {
  await t.finish();
}
