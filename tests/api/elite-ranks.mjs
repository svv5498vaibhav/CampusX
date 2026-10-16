// Elite rank tokens (Gold, Silver, Bronze) and the Hall of Fame: tokens follow the top three of the CampusX
// all-time leaderboard (same rules and tie-breakers), move automatically when ranks change, leave holders who
// drop out or leave the rankings, keep permanent history, notify once per snapshot, survive interrupted,
// repeated, stale, failed and concurrent snapshots, and can't be claimed or changed by any request. Ends with
// the transactional path on a replica set.
import { PASSWORD, clientFor, createSuite, mongoose, oid, signToken, sleep } from '../lib/harness.mjs';
import { API_PORT, DB_PORT } from '../lib/paths.mjs';
import { runEliteRefresh } from '../lib/scripts.mjs';
import { startBackend, startReplicaSet } from '../lib/stack.mjs';

const t = await createSuite('elite-ranks');
const { check, section, step, api, register, db, connectSocket, must } = t;

const SCOPE = 'overall';
const elite = async (who) => (await api('GET', '/rankings/elite', { token: who.token })).data;
const holderIds = (overview) => (overview?.holders ?? []).map((holder) => holder.student?.id ?? null);
const names = (overview) => (overview?.holders ?? []).map((holder) => `${holder.tier.id}:${holder.student?.firstName ?? '-'}`).join(', ');
const stateDoc = () => db.collection('eliterankstates').findOne({ scope: SCOPE });
const transfersOf = (filter = {}) => db.collection('eliteranktransfers').find({ scope: SCOPE, ...filter }).sort({ seq: 1, rank: 1 }).toArray();
const reignsOf = (filter = {}) => db.collection('eliterankreigns').find({ scope: SCOPE, ...filter }).sort({ startSeq: 1 }).toArray();
const eliteNotes = (who) => db.collection('notifications').find({ recipient: oid(who.id), type: 'ELITE_RANK_CHANGED' }).sort({ createdAt: 1, _id: 1 }).toArray();
const lastNote = async (who) => (await eliteNotes(who)).at(-1) ?? null;
const counts = async () => ({
  transfers: await db.collection('eliteranktransfers').countDocuments(),
  reigns: await db.collection('eliterankreigns').countDocuments(),
  snapshots: await db.collection('rankingsnapshots').countDocuments(),
  notes: await db.collection('notifications').countDocuments({ type: 'ELITE_RANK_CHANGED' }),
});
const setPoints = (who, points) => db.collection('studentgamifications').updateOne({ user: oid(who.id) }, { $set: { totalPoints: points, totalReachedAt: new Date() } });
const refreshIn = (options) => runEliteRefresh(t.stack.mongoUri, options);
const statuses = (run) => [].concat(run.result ?? []).map((item) => item.status);

/**
 * Polls GET /rankings/elite until the holders (gold, silver, bronze) are `expected`, then waits until that
 * snapshot's history is written too (the holders change at the commit, just before).
 */
async function holdersBecome(who, expected, timeout = 15000) {
  const started = Date.now();
  let overview;
  while (Date.now() - started < timeout) {
    overview = await elite(who);
    if (JSON.stringify(holderIds(overview)) === JSON.stringify(expected)) {
      while (Date.now() - started < timeout) {
        const state = await stateDoc();
        if (state.historySeq === state.seq) return { ok: true, overview };
        await sleep(100);
      }
      return { ok: false, overview };
    }
    await sleep(250);
  }
  return { ok: false, overview };
}

/** Waits until the student's newest elite notification has this message (notifications follow the snapshot). */
async function noteSays(who, message, timeout = 6000) {
  const started = Date.now();
  let note;
  while (Date.now() - started < timeout) {
    note = await lastNote(who);
    if (note?.message === message) return { ok: true, note };
    await sleep(200);
  }
  return { ok: false, note: note?.message ?? null };
}

/** The state is settled: history finished, one active reign per held token, matching the holders. */
async function invariants(label) {
  const state = await stateDoc();
  const active = await reignsOf({ endedAt: null });
  const matches = state.holders.every((holder) => active.some((reign) => reign.tier === holder.tier && String(reign.user) === String(holder.user)));
  const distinct = new Set(state.holders.map((holder) => String(holder.user))).size === state.holders.length;
  check(`${label}: history finished, one active reign per held token matching the holders, no student holds two`, state.historySeq === state.seq && !state.pending && active.length === state.holders.length && matches && distinct, { seq: state.seq, historySeq: state.historySeq, holders: state.holders.length, active: active.length });
}

const project = (title, description) => ({ title, shortDescription: `${title} for the campus.`, description, category: 'web', visibility: 'public' });

try {
  section('Fewer than three ranked students: the lower tokens stay unclaimed');
  const asha = await register('Asha', 'Rao');
  const bilal = await register('Bilal', 'Khan');
  let r = await holdersBecome(asha, [asha.id, bilal.id, null]);
  check('two ranked students: Gold and Silver held, Bronze unclaimed', r.ok, names(r.overview));
  check('overview: ready, CampusX-wide all-time scope, three tiers with titles', r.overview?.status === 'ready' && r.overview.scope.id === 'overall' && r.overview.scope.period === 'all' && r.overview.tiers.map((tier) => tier.title).join() === 'Golden Champion,Silver Elite,Bronze Elite', r.overview);
  check("the viewer's own elite rank (Asha: Gold, rank 1)", r.overview?.you?.tier === 'gold' && r.overview.you.rank === 1 && r.overview.you.token === 'Golden Token', r.overview?.you);

  section('Rank #1, #2 and #3 get Gold, Silver and Bronze; #4 and below get nothing');
  const chitra = await register('Chitra', 'Iyer');
  const dev = await register('Dev', 'Patel');
  const esha = await register('Esha', 'Nair');
  r = await holdersBecome(asha, [asha.id, bilal.id, chitra.id]);
  check('20 XP each: ties broken like the leaderboard (reached first) → Asha, Bilal, Chitra', r.ok, names(r.overview));
  const board = (await api('GET', '/rankings/overall', { token: dev.token })).data.leaderboard;
  const tierOn = (rows, who) => rows.find((entry) => entry.student.id === who.id)?.student.eliteRank?.tier ?? null;
  check('leaderboard order = token order', board.slice(0, 3).map((entry) => entry.student.id).join() === [asha.id, bilal.id, chitra.id].join(), board.map((entry) => [entry.rank, entry.student.firstName]));
  check('leaderboard identities: #1 gold, #2 silver, #3 bronze', tierOn(board, asha) === 'gold' && tierOn(board, bilal) === 'silver' && tierOn(board, chitra) === 'bronze', board.map((entry) => [entry.rank, entry.student.firstName, entry.student.eliteRank?.tier ?? null]));
  check('#4 and #5: no elite rank (null)', tierOn(board, dev) === null && tierOn(board, esha) === null && board.find((entry) => entry.student.id === dev.id)?.student.eliteRank === null);
  const ashaProfile = (await api('GET', `/profile/${asha.id}`, { token: dev.token })).data.profile;
  check('public profile carries the title, token and rank', ashaProfile.eliteRank?.tier === 'gold' && ashaProfile.eliteRank.rank === 1 && ashaProfile.eliteRank.title === 'Golden Champion' && ashaProfile.eliteRank.token === 'Golden Token' && Boolean(ashaProfile.eliteRank.since), ashaProfile.eliteRank);
  check("#4's public profile: eliteRank null", (await api('GET', `/profile/${dev.id}`, { token: asha.token })).data.profile.eliteRank === null);
  check('own profile (Chitra): Bronze Elite', (await api('GET', '/profile', { token: chitra.token })).data.profile.eliteRank?.title === 'Bronze Elite');
  const found = await api('GET', '/search/students?q=asha', { token: esha.token });
  check('student search results carry the elite rank', found.data?.results?.find((item) => item.id === asha.id)?.eliteRank?.tier === 'gold', found.data?.results?.[0]);
  await must(api('POST', `/users/${asha.id}/follow`, { token: bilal.token }), 'bilal follows asha');
  const followers = await api('GET', `/users/${asha.id}/followers`, { token: esha.token });
  check('follower lists carry the elite rank (Bilal: silver)', followers.data?.students?.find((item) => item.id === bilal.id)?.eliteRank?.tier === 'silver', followers.data?.students?.[0]);
  const firstTransfers = await transfersOf();
  check('history: three claims of unclaimed tokens (from: null), the first snapshot marked first-snapshot', firstTransfers.length === 3 && firstTransfers.every((row) => row.from === null) && firstTransfers[0].reason === 'first-snapshot' && firstTransfers.map((row) => String(row.to)).join() === [asha.id, bilal.id, chitra.id].join(), firstTransfers.map((row) => [row.seq, row.tier, row.reason]));
  const firstReigns = await reignsOf();
  check('three reigns, all current, each an entry into the top three', firstReigns.length === 3 && firstReigns.every((reign) => reign.endedAt === null && reign.enteredTopThree), firstReigns.map((reign) => [reign.tier, reign.enteredTopThree]));
  check('a RankingSnapshot is stored for each change (top three with points and tie-breakers)', (await db.collection('rankingsnapshots').countDocuments()) === new Set(firstTransfers.map((row) => row.seq)).size && (await db.collection('rankingsnapshots').findOne({}, { sort: { seq: -1 } })).entries.every((entry) => entry.points === 20 && entry.reachedAt));
  check('Asha: "You claimed the Golden Token! You are now CampusX Rank #1."', (await noteSays(asha, 'You claimed the Golden Token! You are now CampusX Rank #1.')).ok);
  check('Bilal: entered the top three and earned the Silver Token', (await noteSays(bilal, 'You entered the top three and earned the Silver Token! You are now Silver Elite — Rank #2.')).ok);
  check('Chitra: "You entered the top three and earned the Bronze Token!"', (await noteSays(chitra, 'You entered the top three and earned the Bronze Token! You are now Bronze Elite — Rank #3.')).ok);
  check('Dev and Esha (#4, #5): no elite notification', (await eliteNotes(dev)).length === 0 && (await eliteNotes(esha)).length === 0);
  const ashaFeed = await api('GET', '/notifications?limit=50', { token: asha.token });
  const ashaElite = ashaFeed.data.notifications.find((note) => note.type === 'ELITE_RANK_CHANGED');
  check('notification view: rankings category, Hall of Fame link, tier in metadata', ashaElite?.category === 'rankings' && ashaElite.entity?.type === 'hall-of-fame' && ashaElite.metadata?.tier === 'gold' && ashaElite.title === 'Golden Token claimed', ashaElite);
  await invariants('after the first snapshots');

  section('Ranks change: the tokens move by themselves');
  // Dev (#4) adds a public project: +20 XP (40) → #1.
  const devProject = (await must(api('POST', '/projects', { token: dev.token, body: project('Mess Menu Ratings', 'Students rate each meal and the mess committee sees weekly trends on a small dashboard.') }), 'dev project')).data.project.id;
  r = await holdersBecome(asha, [dev.id, asha.id, bilal.id]);
  check('Dev (#4 → #1) claims Gold; Asha (#1 → #2) Silver; Bilal (#2 → #3) Bronze; Chitra (#3 → #4) none', r.ok, names(r.overview));
  const board2 = (await api('GET', '/rankings/overall', { token: esha.token })).data.leaderboard;
  check('leaderboard identities follow at once (Chitra lost her styling, Dev gained Gold)', tierOn(board2, dev) === 'gold' && tierOn(board2, asha) === 'silver' && tierOn(board2, bilal) === 'bronze' && tierOn(board2, chitra) === null, board2.map((entry) => [entry.rank, entry.student.firstName, entry.student.eliteRank?.tier ?? null]));
  check('Dev: claimed the Golden Token', (await noteSays(dev, 'You claimed the Golden Token! You are now CampusX Rank #1.')).ok);
  check('Asha: "Your Golden Token has passed to the new champion." + now Silver', (await noteSays(asha, 'Your Golden Token has passed to the new champion. You are now Silver Elite — Rank #2.')).ok);
  check('Bilal: Silver passed on, now Bronze', (await noteSays(bilal, 'Your Silver Token has passed to a new holder. You are now Bronze Elite — Rank #3.')).ok);
  check('Chitra: Bronze passed on, out of the top three', (await noteSays(chitra, 'Your Bronze Token has passed to a new holder. Keep earning XP to win your place in the top three back.')).ok);
  const moveSeq = (await stateDoc()).seq;
  const moved = await transfersOf({ seq: moveSeq });
  check('transfers of that snapshot: Gold Asha→Dev, Silver Bilal→Asha, Bronze Chitra→Bilal (reason: ranking)', moved.length === 3 && moved.map((row) => `${row.tier}:${row.from}>${row.to}:${row.reason}`).join() === [`gold:${asha.id}>${dev.id}:ranking`, `silver:${bilal.id}>${asha.id}:ranking`, `bronze:${chitra.id}>${bilal.id}:ranking`].join(), moved.map((row) => [row.tier, String(row.from), String(row.to), row.reason]));
  const ashaReigns = await reignsOf({ user: oid(asha.id) });
  check("Asha's Gold reign ended (kept), a Silver reign began that isn't a new top-three entry", ashaReigns.length === 2 && ashaReigns[0].tier === 'gold' && ashaReigns[0].endedAt && ashaReigns[0].endReason === 'ranking' && ashaReigns[1].tier === 'silver' && !ashaReigns[1].endedAt && ashaReigns[1].enteredTopThree === false, ashaReigns.map((reign) => [reign.tier, reign.endedAt, reign.enteredTopThree]));
  const ashaNow = (await elite(asha)).holders.find((holder) => holder.tier.id === 'silver');
  check("holders' since = the start of their current reign", new Date(ashaNow.since).getTime() === new Date(ashaReigns[1].startedAt).getTime());

  // Chitra (#4) posts: +5 XP (25) → #2.
  await must(api('POST', '/posts', { token: chitra.token, body: { content: 'Robotics club demo on Friday evening in the main hall, everyone welcome.', visibility: 'public' } }), 'chitra post');
  r = await holdersBecome(asha, [dev.id, chitra.id, asha.id]);
  check('Chitra (#4 → #2) back with Silver; Asha → Bronze; Bilal (#3 → #4) out', r.ok, names(r.overview));
  check('Chitra: entered the top three again (Silver)', (await noteSays(chitra, 'You entered the top three and earned the Silver Token! You are now Silver Elite — Rank #2.')).ok);
  check('Bilal: Bronze passed on', (await noteSays(bilal, 'Your Bronze Token has passed to a new holder. Keep earning XP to win your place in the top three back.')).ok);

  // Dev deletes the project: -20 XP (20, reached last) → #5.
  await must(api('DELETE', `/projects/${devProject}`, { token: dev.token }), 'dev deletes project');
  r = await holdersBecome(asha, [chitra.id, asha.id, bilal.id]);
  check('Dev (#1 → #5) loses Gold; Chitra claims it; Asha Silver; Bilal back with Bronze', r.ok, names(r.overview));
  check('Dev: "Your Golden Token has passed to the new champion."', (await noteSays(dev, 'Your Golden Token has passed to the new champion. Keep earning XP to win your place in the top three back.')).ok);
  check("Dev's identity is back to normal everywhere (leaderboard, profile)", tierOn((await api('GET', '/rankings/overall', { token: esha.token })).data.leaderboard, dev) === null && (await api('GET', `/profile/${dev.id}`, { token: esha.token })).data.profile.eliteRank === null);
  check('Asha moved Bronze → Silver: "You have moved to Silver Elite — Rank #2."', (await noteSays(asha, 'You have moved to Silver Elite — Rank #2.')).ok);
  await invariants('after the moves');

  section('Hall of Fame');
  const hof = await api('GET', '/rankings/hall-of-fame', { token: esha.token });
  check('200, current holders Chitra, Asha, Bilal', hof.status === 200 && holderIds(hof.data).join() === [chitra.id, asha.id, bilal.id].join(), names(hof.data));
  const goldBefore = hof.data.previousHolders.gold;
  check('previous Gold holders kept, newest first: Dev, then Asha (gained, lost, how long)', goldBefore.map((reign) => reign.student?.id).join() === [dev.id, asha.id].join() && goldBefore.every((reign) => reign.startedAt && reign.endedAt && reign.durationMs > 0 && !reign.current && reign.endReason === 'ranking'), goldBefore.map((reign) => [reign.student?.firstName, reign.durationMs]));
  check('previous Bronze holders include Chitra and Bilal (Bilal lost it and won it back)', ['bronze'].every((tier) => hof.data.previousHolders[tier].some((reign) => reign.student?.id === chitra.id) && hof.data.previousHolders[tier].some((reign) => reign.student?.id === bilal.id)), hof.data.previousHolders.bronze.map((reign) => reign.student?.firstName));
  const most = hof.data.records.mostTopThreeEntries;
  check('most top-three entries: Bilal and Chitra twice each (first entry first), then once', most[0]?.student.id === bilal.id && most[0].entries === 2 && most[1]?.student.id === chitra.id && most[1].entries === 2 && most.slice(2).every((row) => row.entries === 1), most.map((row) => [row.student.firstName, row.entries]));
  const goldReigns = await reignsOf({ tier: 'gold' });
  const longest = Math.max(...goldReigns.map((reign) => (reign.endedAt ?? new Date()).getTime() - reign.startedAt.getTime()));
  check('longest uninterrupted Gold reign is the longest one in the history', hof.data.records.longestGoldReign?.tier === 'gold' && Math.abs(hof.data.records.longestGoldReign.durationMs - longest) < 3000, [hof.data.records.longestGoldReign?.durationMs, longest]);
  check('current holders show their top-three entries (Bilal 2)', hof.data.holders.find((holder) => holder.tier.id === 'bronze')?.topThreeEntries === 2);
  check('totals: 4 different holders so far, every transfer counted', hof.data.totals.holders === 4 && hof.data.totals.transfers === (await db.collection('eliteranktransfers').countDocuments()), hof.data.totals);
  const seqs = hof.data.transfers.map((row) => row.seq);
  check('transfer history newest first, with from/to students and reasons', seqs.every((seq, index) => index === 0 || seqs[index - 1] >= seq) && hof.data.transfers[0].to?.student && ['ranking', 'first-snapshot', 'left-rankings'].includes(hof.data.transfers[0].reason));
  const page1 = await api('GET', '/rankings/hall-of-fame?limit=2', { token: esha.token });
  const page2 = await api('GET', '/rankings/hall-of-fame?limit=2&page=2', { token: esha.token });
  check('transfer history pages (2 + 2, no repeats, more to come)', page1.data.transfers.length === 2 && page2.data.transfers.length === 2 && page1.data.pagination.hasMore && !page2.data.transfers.some((row) => page1.data.transfers.some((other) => other.id === row.id)));
  check('Hall of Fame never shows emails or roll numbers', !/@qa\.campusx\.dev|"rollNumber"|"email"/.test(hof.text));

  section("A student's elite history");
  const chitraHistory = await api('GET', `/rankings/elite/students/${chitra.id}`, { token: esha.token });
  check('Chitra: holds Gold now; 3 reigns (Bronze, Silver, Gold) newest first; 2 top-three entries; best tier gold', chitraHistory.status === 200 && chitraHistory.data.current?.tier === 'gold' && chitraHistory.data.reigns.map((reign) => reign.tier).join() === 'gold,silver,bronze' && chitraHistory.data.stats.topThreeEntries === 2 && chitraHistory.data.stats.bestTier === 'gold' && chitraHistory.data.reigns[0].current, chitraHistory.data);
  check('time held per token is reported', chitraHistory.data.stats.heldMs.bronze > 0 && chitraHistory.data.stats.heldMs.silver > 0);
  const eshaHistory = await api('GET', `/rankings/elite/students/${esha.id}`, { token: asha.token });
  check('Esha (never in the top three): no reigns, no current rank', eshaHistory.status === 200 && eshaHistory.data.reigns.length === 0 && eshaHistory.data.current === null && eshaHistory.data.stats.topThreeEntries === 0);
  check('invalid student id → 422; unknown → 404', (await api('GET', '/rankings/elite/students/nope', { token: asha.token })).status === 422 && (await api('GET', `/rankings/elite/students/${new mongoose.Types.ObjectId()}`, { token: asha.token })).status === 404);

  section('Live updates (Socket.IO)');
  const eshaLive = await connectSocket(esha.token);
  const ashaLive = await connectSocket(asha.token);
  check('sockets connect', !eshaLive.error && !ashaLive.error, [eshaLive.error, ashaLive.error]);
  const seen = { esha: [], asha: [], eshaNotes: [], ashaNotes: [] };
  eshaLive.socket.on('elite:updated', (payload) => seen.esha.push(payload));
  ashaLive.socket.on('elite:updated', (payload) => seen.asha.push(payload));
  eshaLive.socket.on('notification:new', ({ notification }) => seen.eshaNotes.push(notification));
  ashaLive.socket.on('notification:new', ({ notification }) => seen.ashaNotes.push(notification));
  // Esha (#4) adds a project: +20 XP (40) → #1.
  await must(api('POST', '/projects', { token: esha.token, body: project('Library Seat Finder', 'Shows free reading room seats from door counters so students stop walking floor to floor.') }), 'esha project');
  r = await holdersBecome(esha, [esha.id, chitra.id, asha.id]);
  check('Esha (#4 → #1) claims Gold; Chitra Silver; Asha Bronze; Bilal out', r.ok, names(r.overview));
  await sleep(800);
  check('every open app hears "elite:updated" with only { seq, at } (no ids)', seen.esha.length >= 1 && seen.asha.length >= 1 && Object.keys(seen.esha.at(-1)).sort().join() === 'at,seq' && !JSON.stringify(seen.esha).includes(esha.id), seen.esha);
  check('the new champion gets the notification live', seen.eshaNotes.some((note) => note.type === 'ELITE_RANK_CHANGED' && note.metadata?.tier === 'gold'), seen.eshaNotes.map((note) => note.type));
  check('Asha (Silver → Bronze) gets hers live', seen.ashaNotes.some((note) => note.type === 'ELITE_RANK_CHANGED' && note.metadata?.tier === 'bronze' && note.metadata?.previousTier === 'silver'), seen.ashaNotes.map((note) => note.message));
  eshaLive.socket.emit('elite:claim', { tier: 'gold' });
  eshaLive.socket.emit('elite:updated', { seq: 999 });
  eshaLive.socket.close();
  ashaLive.socket.close();

  section('Ranking milestones are not announced twice');
  await sleep(500);
  const milestones = await db.collection('notifications').find({ type: 'RANK_CHANGED' }).toArray();
  check('no CampusX-wide #1 / top-3 milestone notification (the token notification says it)', !milestones.some((note) => note.metadata?.scope === 'overall' && note.metadata?.tier <= 3), milestones.map((note) => note.message));
  check("…but the milestone is still recorded as Esha's best (overall: 1)", (await db.collection('studentgamifications').findOne({ user: oid(esha.id) })).rankMilestones?.overall === 1);
  check('college milestones are still announced', milestones.some((note) => note.metadata?.scope === 'college' && String(note.recipient) === esha.id), milestones.map((note) => [String(note.recipient) === esha.id, note.message]));

  section('Duplicate processing: no duplicate transfers or notifications');
  await invariants('before the duplicate checks');
  let before = await counts();
  const [one, two] = await Promise.all([refreshIn({ times: 3 }), refreshIn({ times: 3 })]);
  check('two more "instances", three snapshots each at once: nothing changes', statuses(one).length === 3 && statuses(two).length === 3 && [...statuses(one), ...statuses(two)].every((status) => ['unchanged', 'stale'].includes(status)), [statuses(one), statuses(two), one.output.slice(-300)]);
  check('…no new transfers, reigns, snapshots or notifications', JSON.stringify(await counts()) === JSON.stringify(before), [before, await counts()]);
  const currentSeq = (await stateDoc()).seq;
  const replay = await refreshIn({ mode: 'emit-twice', event: { userId: esha.id, scope: SCOPE, seq: currentSeq, tier: 'gold', previousTier: null } });
  check('the same ELITE_RANK_CHANGED event twice more: still one notification for that snapshot', replay.code === 0 && (await db.collection('notifications').countDocuments({ recipient: oid(esha.id), type: 'ELITE_RANK_CHANGED', dedupeKey: `${esha.id}:ELITE_RANK_CHANGED:elite:${SCOPE}:${currentSeq}` })) === 1, replay.output.slice(-300));

  section('An interrupted snapshot is finished exactly once');
  // As if an instance moved the tokens (the commit) and stopped before writing history and notifications.
  await setPoints(dev, 300);
  const state = await stateDoc();
  const now = new Date();
  const pendingSeq = state.seq + 1;
  await db.collection('eliterankstates').updateOne({ scope: SCOPE }, {
    $set: {
      seq: pendingSeq,
      holders: [
        { tier: 'gold', rank: 1, user: oid(dev.id), since: now },
        { tier: 'silver', rank: 2, user: oid(esha.id), since: now },
        { tier: 'bronze', rank: 3, user: oid(chitra.id), since: now },
      ],
      computedAt: now,
      checkedAt: now,
      pending: { previousHolders: state.holders.map(({ tier, user }) => ({ tier, user })), left: [], entries: [], trigger: 'test' },
    },
  });
  check('the holders read the committed state at once (Dev, Esha, Chitra)', holderIds(await elite(asha)).join() === [dev.id, esha.id, chitra.id].join(), names(await elite(asha)));
  const [first, second] = await Promise.all([refreshIn(), refreshIn()]);
  check('two instances finish it at the same time; neither moves a token again', [...statuses(first), ...statuses(second)].every((status) => ['unchanged', 'stale'].includes(status)), [statuses(first), statuses(second), first.output.slice(-300)]);
  const recovered = await transfersOf({ seq: pendingSeq });
  check('exactly one transfer per changed token for that snapshot (Gold Esha→Dev, Silver Chitra→Esha, Bronze Asha→Chitra)', recovered.length === 3 && recovered.map((row) => `${row.tier}:${row.from}>${row.to}`).join() === [`gold:${esha.id}>${dev.id}`, `silver:${chitra.id}>${esha.id}`, `bronze:${asha.id}>${chitra.id}`].join(), recovered.map((row) => [row.tier, String(row.from), String(row.to)]));
  check('exactly three reigns began with it, and one snapshot document', (await reignsOf({ startSeq: pendingSeq })).length === 3 && (await db.collection('rankingsnapshots').countDocuments({ seq: pendingSeq })) === 1);
  await sleep(600);
  const dedupe = (who) => db.collection('notifications').countDocuments({ recipient: oid(who.id), type: 'ELITE_RANK_CHANGED', dedupeKey: `${who.id}:ELITE_RANK_CHANGED:elite:${SCOPE}:${pendingSeq}` });
  check('one notification each for Dev, Esha, Chitra and Asha (never two)', (await dedupe(dev)) === 1 && (await dedupe(esha)) === 1 && (await dedupe(chitra)) === 1 && (await dedupe(asha)) === 1, [await dedupe(dev), await dedupe(esha), await dedupe(chitra), await dedupe(asha)]);
  check('Asha (out): "Your Bronze Token has passed to a new holder…"', (await noteSays(asha, 'Your Bronze Token has passed to a new holder. Keep earning XP to win your place in the top three back.')).ok);
  await invariants('after finishing the interrupted snapshot');

  section('Stale snapshots never win');
  before = await counts();
  // A newer snapshot was already checked (another instance): an older calculation must not move anything.
  await db.collection('eliterankstates').updateOne({ scope: SCOPE }, { $set: { checkedAt: new Date(Date.now() + 60 * 60 * 1000) } });
  await setPoints(bilal, 1000);
  const stale = await refreshIn();
  check('a snapshot older than the last check is refused (stale)', statuses(stale).join() === 'stale', stale.output.slice(-300));
  check('…the tokens stay with Dev, Esha, Chitra and nothing is recorded', holderIds(await elite(asha)).join() === [dev.id, esha.id, chitra.id].join() && JSON.stringify(await counts()) === JSON.stringify(before));
  await db.collection('eliterankstates').updateOne({ scope: SCOPE }, { $set: { checkedAt: new Date(Date.now() - 60 * 1000) } });
  const fresh = await refreshIn();
  check('the next fresh snapshot moves them (Bilal 1000 XP → Gold)', statuses(fresh).every((status) => ['transferred', 'stale', 'unchanged'].includes(status)) && (await holdersBecome(asha, [bilal.id, dev.id, esha.id], 8000)).ok, [statuses(fresh), names(await elite(asha))]);
  check('…in exactly one new snapshot', (await counts()).snapshots === before.snapshots + 1, [before, await counts()]);

  section('A failed ranking calculation changes nothing');
  await sleep(1500);
  before = await counts();
  const seqBefore = (await stateDoc()).seq;
  await setPoints(asha, 5000);
  const failed = await refreshIn({ mode: 'fail-read' });
  check('the ranking read fails → status failed', statuses(failed).join() === 'failed', failed.output.slice(-400));
  check('…the tokens stay with the last valid holders, nothing recorded', (await stateDoc()).seq === seqBefore && holderIds(await elite(asha)).join() === [bilal.id, dev.id, esha.id].join() && JSON.stringify(await counts()) === JSON.stringify(before));
  const afterFailure = await refreshIn();
  check('the next good snapshot hands Gold to Asha (5000 XP)', statuses(afterFailure).every((status) => ['transferred', 'stale', 'unchanged'].includes(status)) && (await holdersBecome(asha, [asha.id, bilal.id, dev.id], 8000)).ok, [statuses(afterFailure), names(await elite(asha))]);

  section('A holder who leaves the rankings loses the token');
  const admin = await register('Ada', 'Admin');
  await db.collection('users').updateOne({ _id: oid(admin.id) }, { $set: { role: 'admin' } });
  await t.relogin(admin);
  const ashaNotesBefore = (await eliteNotes(asha)).length;
  const suspended = await api('PATCH', `/admin/users/${asha.id}/status`, { token: admin.token, body: { action: 'suspend', reason: 'Elite rank QA check', confirm: true } });
  check('admin suspends the Gold holder', suspended.status === 200, suspended.body);
  r = await holdersBecome(bilal, [bilal.id, dev.id, esha.id]);
  check('Gold passes on (Bilal), everyone moves up, Esha back in', r.ok, names(r.overview));
  const leftSeq = (await stateDoc()).seq;
  const goldLeft = (await transfersOf({ seq: leftSeq })).find((row) => row.tier === 'gold');
  check('the Gold transfer says why: left-rankings', goldLeft?.reason === 'left-rankings' && String(goldLeft.from) === asha.id, goldLeft);
  check("Asha's reign ended with left-rankings", (await reignsOf({ user: oid(asha.id), tier: 'gold', endSeq: leftSeq }))[0]?.endReason === 'left-rankings');
  await sleep(600);
  check('a suspended account gets no notification', (await eliteNotes(asha)).length === ashaNotesBefore);
  const hofAfter = await api('GET', '/rankings/hall-of-fame?limit=50', { token: bilal.token });
  check('Hall of Fame keeps her reigns but shows a former student (no id, no name)', hofAfter.data.previousHolders.gold.some((reign) => reign.student === null) && !hofAfter.text.includes(asha.id) && !hofAfter.text.includes('Asha'), hofAfter.data.previousHolders.gold.map((reign) => reign.student?.firstName ?? null));
  check("her elite history isn't available while suspended (404)", (await api('GET', `/rankings/elite/students/${asha.id}`, { token: bilal.token })).status === 404);
  await must(api('PATCH', `/admin/users/${asha.id}/status`, { token: admin.token, body: { action: 'unsuspend' } }), 'unsuspend asha');
  r = await holdersBecome(bilal, [asha.id, bilal.id, dev.id]);
  check('active again: she wins Gold back (5000 XP), as a new reign and a new top-three entry', r.ok && (await reignsOf({ user: oid(asha.id), endedAt: null }))[0]?.enteredTopThree === true, names(r.overview));

  section('A holder who deletes their account');
  const deleted = await api('DELETE', '/auth/account', { token: dev.token, body: { password: PASSWORD, confirmation: 'DELETE' } });
  check('Dev deletes the account', deleted.status === 200, deleted.body);
  r = await holdersBecome(bilal, [asha.id, bilal.id, esha.id]);
  check('Bronze passes to Esha', r.ok, names(r.overview));
  const deletedSeq = (await stateDoc()).seq;
  check('…reason left-rankings; his past reigns stay in the history', (await transfersOf({ seq: deletedSeq })).find((row) => row.tier === 'bronze')?.reason === 'left-rankings' && (await reignsOf({ user: oid(dev.id) })).length >= 2);
  await invariants('after holders left');

  section('Authorization: no request can claim, set or move a token');
  const writes = [['POST', '/rankings/elite'], ['PUT', '/rankings/elite'], ['PATCH', '/rankings/elite'], ['DELETE', '/rankings/elite'], ['POST', '/rankings/elite/claim'], ['POST', '/rankings/hall-of-fame'], ['PATCH', `/rankings/elite/students/${esha.id}`], ['PUT', `/rankings/elite/students/${esha.id}`]];
  const writeStatuses = [];
  for (const [method, path] of writes) writeStatuses.push((await api(method, path, { token: esha.token, body: { tier: 'gold', userId: esha.id } })).status);
  check('every write to the elite routes → 404 (there are none)', writeStatuses.every((status) => status === 404), writeStatuses);
  const sneaky = await api('PUT', '/profile', { token: esha.token, body: { bio: 'Aiming for the Golden Token this semester.', eliteRank: { tier: 'gold', rank: 1, title: 'Golden Champion' } } });
  check('a profile update with eliteRank: saved without it (rank unchanged)', sneaky.status === 200 && sneaky.data.profile.eliteRank?.tier === 'bronze' && !(await db.collection('users').findOne({ _id: oid(esha.id) })).eliteRank, sneaky.data?.profile?.eliteRank);
  check('a profile update with only eliteRank → 422 (nothing to update)', (await api('PUT', '/profile', { token: esha.token, body: { eliteRank: { tier: 'gold' } } })).status === 422);
  check('elite routes need a signed-in student (401 without a token or with a forged one)', (await api('GET', '/rankings/elite')).status === 401 && (await api('GET', '/rankings/hall-of-fame', { token: signToken({ role: 'student' }, { subject: esha.id, secret: 'not-the-real-secret-0123456789-abcdefghijklmnop' }) })).status === 401);
  check('Hall of Fame paging limits (limit 500 → 422, page 0 → 422)', (await api('GET', '/rankings/hall-of-fame?limit=500', { token: esha.token })).status === 422 && (await api('GET', '/rankings/hall-of-fame?page=0', { token: esha.token })).status === 422);
  check('socket messages from a client changed nothing', holderIds(await elite(esha)).join() === [asha.id, bilal.id, esha.id].join());

  section('Existing leaderboards, gamification and notifications still work');
  const overall = await api('GET', '/rankings/overall', { token: esha.token });
  const points = overall.data.leaderboard.map((entry) => entry.points);
  check('leaderboard: 200, ordered by points', overall.status === 200 && points.every((value, index) => index === 0 || points[index - 1] >= value));
  check('my ranks: 200', (await api('GET', '/rankings/me', { token: esha.token })).status === 200);
  const rules = await api('GET', '/gamification/rules', { token: esha.token });
  check('rules include the elite tiers and their scope', rules.status === 200 && rules.data.elite?.tiers?.length === 3 && rules.data.elite.scope === 'overall', rules.data.elite);
  check('gamification profile: 200', (await api('GET', '/gamification/me', { token: esha.token })).status === 200);
  check('rankings category is described with elite tokens in preferences', JSON.stringify((await api('GET', '/notifications/preferences', { token: esha.token })).body).includes('elite rank tokens'));
  await must(api('PUT', '/notifications/preferences', { token: bilal.token, body: { rankings: false } }), 'bilal mutes rankings');
  const bilalNotesBefore = (await eliteNotes(bilal)).length;
  await setPoints(esha, 9000);
  await must(api('POST', '/posts', { token: esha.token, body: { content: 'Hackathon team forming for the weekend, designers and ML folks welcome.', visibility: 'public' } }), 'esha post');
  r = await holdersBecome(esha, [esha.id, asha.id, bilal.id]);
  await sleep(800);
  check('with rankings notifications off, the token still moves but no notification is created', r.ok && (await eliteNotes(bilal)).length === bilalNotesBefore, names(r.overview));
  await invariants('at the end');

  await step('Transactions (replica set)', async () => {
    section('Transactions (replica set): ownership and history commit together');
    const rs = await startReplicaSet(DB_PORT + 12);
    t.cleanups.push(() => rs.stop());
    const dbName = `campusx_test_elite_ranks_rs_${Date.now()}`;
    const previousPort = process.env.CAMPUSX_TEST_DB_PORT;
    process.env.CAMPUSX_TEST_DB_PORT = String(rs.port);
    let backend;
    try {
      backend = await startBackend({ name: 'elite-ranks-rs', dbName, port: API_PORT + 8, env: { MONGODB_URI: rs.uri(dbName) } });
    } finally {
      if (previousPort === undefined) delete process.env.CAMPUSX_TEST_DB_PORT;
      else process.env.CAMPUSX_TEST_DB_PORT = previousPort;
    }
    t.cleanups.unshift(() => backend.stop());
    const rsConn = await mongoose.createConnection(rs.uri(dbName)).asPromise();
    t.cleanups.unshift(() => rsConn.close());
    const rsDb = rsConn.db;
    const client = clientFor(backend.base);
    const holdersOn = async (who) => holderIds((await client.api('GET', '/rankings/elite', { token: who.token })).data);
    const until = async (who, expected) => {
      for (let i = 0; i < 60; i += 1) {
        if ((await holdersOn(who)).join() === expected.join()) return true;
        await sleep(250);
      }
      return false;
    };
    const uma = await client.register('Uma', 'Rao');
    const vik = await client.register('Vik', 'Shah');
    const wen = await client.register('Wen', 'Li');
    const xia = await client.register('Xia', 'Das');
    check('tokens assigned on a replica set', await until(uma, [uma.id, vik.id, wen.id]));
    await client.must(client.api('POST', '/projects', { token: xia.token, body: project('Shuttle Tracker', 'Live shuttle locations from the driver phone, refreshed every few seconds for students.') }), 'xia project');
    check('Xia (#4 → #1) takes Gold on the replica set', await until(uma, [xia.id, uma.id, vik.id]));
    check('token moves were committed in a transaction', /moved the tokens \([a-z]+, in a transaction\)/.test(backend.log()), backend.log().split('\n').filter((line) => line.includes('Elite ranks')).slice(-3));
    // The commit (holders + history) lands first; the snapshot is marked finished right after its notifications.
    let rsState;
    for (let i = 0; i < 40; i += 1) {
      rsState = await rsDb.collection('eliterankstates').findOne({ scope: SCOPE });
      if (rsState.historySeq === rsState.seq) break;
      await sleep(100);
    }
    const rsActive = await rsDb.collection('eliterankreigns').countDocuments({ endedAt: null });
    const rsLast = await rsDb.collection('eliteranktransfers').find({ seq: rsState.seq }).toArray();
    check('state, reigns and transfers agree (history finished, 3 active reigns, 3 transfers in the last snapshot)', rsState.historySeq === rsState.seq && !rsState.pending && rsActive === 3 && rsLast.length === 3, { seq: rsState.seq, historySeq: rsState.historySeq, rsActive, last: rsLast.length });
  });
} catch (error) {
  check('suite ran to the end without crashing', false, error.stack);
}
await t.finish();
