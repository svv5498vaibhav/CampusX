// Campus Rankings and gamification (Phase 10): points from real actions only, caps, quality rules, no
// duplicate points on replays / double clicks / like-unlike-like, reversals when content goes away,
// badges, levels, the ledger matching the totals, and the leaderboards by scope and period.
import { createSuite, oid, sleep } from '../lib/harness.mjs';
import { jpg } from '../lib/files.mjs';

const t = await createSuite('gamification', { cloudinary: true });
const { check, section, api, register, upload, db } = t;
const settle = () => sleep(700); // listeners award points right after each event
const me = async (who) => (await api('GET', '/gamification/me', { token: who.token })).data;
const ledgerSum = async (who) => (await db.collection('pointtransactions').find({ user: oid(who.id) }).toArray()).reduce((sum, row) => sum + row.points, 0);
const awards = (who, action) => db.collection('pointtransactions').find({ user: oid(who.id), action }).toArray();

try {
  section('Setup and onboarding points');
  const asha = await register('Asha', 'Rao', { semester: 5 });
  const bilal = await register('Bilal', 'Khan', { semester: 5 });
  const chitra = await register('Chitra', 'Iyer', { semester: 3 });
  const dev = await register('Dev', 'Patel', { college: 'iiit-nagpur' });
  const mod = await register('Milo', 'Moderator');
  await db.collection('users').updateOne({ _id: oid(mod.id) }, { $set: { role: 'moderator' } });
  await t.relogin(mod);
  await settle();
  const start = await me(asha);
  check('onboarding earns 20 points once, plus the First Step badge', start.totalPoints === 20 && start.badges.earned.some((badge) => badge.key === 'FIRST_STEP'), start);
  const rules = await api('GET', '/gamification/rules', { token: asha.token });
  check('rules are public to students (points, caps, not rewarded)', rules.status === 200 && rules.data.points.length >= 10 && rules.data.notRewarded.length >= 3);

  section('Posts: quality and daily cap');
  await api('POST', '/posts', { token: asha.token, body: { content: 'hi all' } });
  await settle();
  check('a too-short post earns nothing', (await me(asha)).totalPoints === 20);
  const posts = [];
  for (const text of ['Robotics club demo on Friday in the main hall for everyone.', 'Library will stay open till midnight during the exam weeks.', 'Lost a blue water bottle near the CSE block, please ping me.', 'Placement talk by alumni on Saturday, register at the desk.']) {
    posts.push((await api('POST', '/posts', { token: asha.token, body: { content: text, visibility: 'public' } })).data.post.id);
  }
  await settle();
  const afterPosts = await me(asha);
  check('posts earn 5 each, capped at 3 a day (15)', afterPosts.totalPoints === 35, afterPosts.totalPoints);
  check('Campus Creator badge earned', afterPosts.badges.earned.some((badge) => badge.key === 'CAMPUS_CREATOR'));

  section('Likes: no farming');
  const [p1, p2, p3] = posts;
  let expected = 35;
  await api('POST', `/posts/${p1}/like`, { token: bilal.token });
  await settle();
  check('a like from another student: +2', (await me(asha)).totalPoints === (expected += 2));
  await api('DELETE', `/posts/${p1}/like`, { token: bilal.token });
  await settle();
  check('unlike takes the 2 points back', (await me(asha)).totalPoints === (expected -= 2));
  await api('POST', `/posts/${p1}/like`, { token: bilal.token });
  await settle();
  const likeRows = await awards(asha, 'POST_LIKE_RECEIVED');
  check('like again: the same award is reinstated (one award row, never a second award)', (await me(asha)).totalPoints === (expected += 2) && likeRows.filter((row) => row.kind === 'award').length === 1, likeRows.map((row) => `${row.kind}:${row.points}`));
  // Like/unlike over and over (Trust & Safety: more than 6 toggles in 10 minutes pauses the liker's rewards).
  const tara = await register('Tara', 'Menon');
  for (let i = 0; i < 4; i += 1) {
    await api('POST', `/posts/${p3}/like`, { token: tara.token });
    await api('DELETE', `/posts/${p3}/like`, { token: tara.token });
  }
  await api('POST', `/posts/${p3}/like`, { token: tara.token });
  await settle();
  const afterStorm = (await me(asha)).totalPoints;
  check('like/unlike storm (9 toggles): never more than the 2 points of one like', afterStorm - expected >= 0 && afterStorm - expected <= 2, afterStorm - expected);
  expected = afterStorm;
  check('the storm is noticed (audit LIMIT row, liker flagged)', Boolean(await db.collection('moderationauditlogs').findOne({ action: 'LIMIT', targetId: oid(tara.id) })));
  await api('POST', `/posts/${p2}/comments`, { token: tara.token, body: { content: 'Great idea, I would love to join this.' } });
  await settle();
  check("while paused, the toggler's comments don't earn the author points either", (await me(asha)).totalPoints === expected);
  await Promise.all(Array.from({ length: 8 }, () => api('POST', `/posts/${p2}/like`, { token: chitra.token })));
  await settle();
  check('8 simultaneous likes (double clicks): +2 once', (await me(asha)).totalPoints === (expected += 2));
  const replay = await api('POST', `/posts/${p2}/like`, { token: chitra.token });
  await settle();
  check('replaying the same like request: no new points', replay.status === 200 && (await me(asha)).totalPoints === expected);
  await api('POST', `/posts/${p2}/like`, { token: asha.token });
  await settle();
  check('liking your own post earns nothing', (await me(asha)).totalPoints === expected);
  check('giving likes earns the liker nothing', (await me(chitra)).totalPoints === 20);

  section('Comments');
  await api('POST', `/posts/${p1}/comments`, { token: bilal.token, body: { content: 'I will bring my line follower bot along.' } });
  await api('POST', `/posts/${p1}/comments`, { token: bilal.token, body: { content: 'Also bringing spare batteries for everyone.' } });
  await api('POST', `/posts/${p1}/comments`, { token: chitra.token, body: { content: 'Nice' } });
  await api('POST', `/posts/${p1}/comments`, { token: asha.token, body: { content: 'Thanks everyone, see you on Friday!' } });
  await settle();
  check('comments: +3 once per commenting student; short and own comments earn nothing', (await me(asha)).totalPoints === (expected += 3), (await me(asha)).totalPoints - expected);
  section('Deleting content reverses its points');
  await api('DELETE', `/posts/${p1}`, { token: asha.token });
  await settle();
  const afterDelete = await me(asha);
  // p1 earned: its post (+5, within the daily cap), Bilal's like (+2) and Bilal's comment (+3).
  check('deleted post: its post, like and comment points are reversed', afterDelete.totalPoints === (expected -= 10), afterDelete.totalPoints);
  check('the ledger always adds up to the total', (await ledgerSum(asha)) === afterDelete.totalPoints, [await ledgerSum(asha), afterDelete.totalPoints]);
  const transactions = await api('GET', '/gamification/transactions?limit=50', { token: asha.token });
  check('point history: newest first, reversals listed, never who reacted', transactions.status === 200 && transactions.data.transactions.some((row) => row.kind === 'reversal') && !JSON.stringify(transactions.body).includes(bilal.id) && !JSON.stringify(transactions.body).includes(chitra.id));
  check('history page size above the maximum → 422', (await api('GET', '/gamification/transactions?limit=500', { token: asha.token })).status === 422);

  section('Projects, achievements, communities');
  const projectBody = { title: 'Hostel Mess Menu', shortDescription: 'Weekly mess menu with ratings.', description: 'Students rate each meal and the mess committee sees weekly trends on a dashboard.', category: 'web' };
  const privateProject = await api('POST', '/projects', { token: asha.token, body: { ...projectBody, visibility: 'private' } });
  await settle();
  check('a private project earns nothing', (await me(asha)).totalPoints === expected);
  await api('PUT', `/projects/${privateProject.data.project.id}`, { token: asha.token, body: { visibility: 'public' } });
  await settle();
  check('making it public earns the 20 project points', (await me(asha)).totalPoints === (expected += 20));
  await upload(`/projects/${privateProject.data.project.id}/images`, asha.token, 'images', [jpg()]);
  const achievement = await api('POST', '/achievements', { token: asha.token, body: { title: 'Winner, Campus Code Sprint', type: 'competition', date: '2026-08-15', organization: 'VNIT Coding Club' } });
  await settle();
  check('achievement added: +10', (await me(asha)).totalPoints === (expected += 10));
  await upload(`/achievements/${achievement.data.achievement.id}/proof`, asha.token, 'proof', [jpg()]);
  await api('PATCH', `/achievements/${achievement.data.achievement.id}/verification`, { token: mod.token, body: { status: 'verified' } });
  await settle();
  const verified = await me(asha);
  check('verified by a moderator: +50, Verified Achiever badge, counted', verified.totalPoints === (expected += 50) && verified.verifiedAchievements === 1 && verified.badges.earned.some((badge) => badge.key === 'VERIFIED_ACHIEVER'), verified);
  check('between 100 and 249 points → level 2 (Explorer)', verified.level.level === 2 && verified.level.name === 'Explorer', verified.level);
  const communities = (await api('GET', '/communities?limit=30', { token: asha.token })).data.communities.filter((item) => item.official);
  await api('POST', `/communities/${communities[0].id}/join`, { token: asha.token });
  await settle();
  check('joining a community: +5', (await me(asha)).totalPoints === (expected += 5));
  await api('DELETE', `/communities/${communities[0].id}/leave`, { token: asha.token });
  await api('POST', `/communities/${communities[0].id}/join`, { token: asha.token });
  await settle();
  check('leave and rejoin: still +5 once', (await me(asha)).totalPoints === expected);
  check('the ledger still adds up', (await ledgerSum(asha)) === expected);
  await sleep(500);
  const notes = await api('GET', '/notifications?limit=50', { token: asha.token });
  check('level-up and badge notifications were sent', notes.data.notifications.some((note) => note.type === 'LEVEL_UP' || /level/i.test(note.type)) && notes.data.notifications.some((note) => /badge/i.test(note.type)), notes.data.notifications.map((note) => note.type));

  section('Leaderboards');
  await api('POST', '/posts', { token: dev.token, body: { content: 'IIIT hackathon team forming for the weekend, ML folks welcome.', visibility: 'public' } });
  await api('POST', '/posts', { token: bilal.token, body: { content: 'Selling my semester five textbooks at half price, all good condition.', visibility: 'public' } });
  await settle();
  const overall = await api('GET', '/rankings/overall', { token: bilal.token });
  const order = overall.data.leaderboard.map((entry) => entry.points);
  check('overall leaderboard ordered by points, Asha first', overall.status === 200 && overall.data.leaderboard[0]?.student?.id === asha.id && order.every((points, index) => index === 0 || order[index - 1] >= points), overall.data.leaderboard.map((entry) => [entry.student?.firstName, entry.points]));
  const college = await api('GET', '/rankings/college', { token: bilal.token });
  check("college leaderboard never includes another college's students", college.status === 200 && !college.data.leaderboard.some((entry) => entry.student?.id === dev.id));
  const semester = await api('GET', '/rankings/semester', { token: bilal.token });
  check("semester leaderboard is the viewer's own class only", semester.status === 200 && !semester.data.leaderboard.some((entry) => entry.student?.id === chitra.id) && semester.data.leaderboard.some((entry) => entry.student?.id === asha.id));
  const branch = await api('GET', '/rankings/branch?college=iiit-nagpur', { token: bilal.token });
  check('scope comes from the profile (query parameters can\'t switch college)', branch.status === 200 && !branch.data.leaderboard.some((entry) => entry.student?.id === dev.id));
  const weekly = await api('GET', '/rankings/weekly', { token: bilal.token });
  const monthly = await api('GET', '/rankings/monthly', { token: bilal.token });
  check('weekly and monthly leaderboards answer with this week\'s/month\'s points', weekly.status === 200 && monthly.status === 200 && weekly.data.leaderboard.some((entry) => entry.student?.id === asha.id && entry.points > 0));
  const ranks = await api('GET', '/rankings/me', { token: asha.token });
  check('my ranks: #1 overall', ranks.status === 200 && ranks.data.ranks.overall.rank === 1, ranks.data);
  check('leaderboard entries never include emails or roll numbers', !/@qa\.campusx\.dev|"rollNumber"/.test(overall.text));
  check('invalid leaderboard page size → 422', (await api('GET', '/rankings/overall?limit=1000', { token: bilal.token })).status === 422);
  await db.collection('users').updateOne({ _id: oid(dev.id) }, { $set: { status: 'suspended' } });
  await sleep(1200);
  const afterSuspend = await api('GET', '/rankings/overall?page=1&limit=20&refresh=1', { token: bilal.token });
  const devGone = !afterSuspend.data.leaderboard.some((entry) => entry.student?.id === dev.id);
  check('a suspended student never shows on leaderboards', devGone, afterSuspend.data.leaderboard.map((entry) => entry.student?.firstName));
} catch (error) {
  check('suite ran to the end without crashing', false, error.stack);
}
await t.finish();
