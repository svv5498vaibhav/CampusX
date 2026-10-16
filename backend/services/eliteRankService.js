import mongoose from 'mongoose';
import { ELITE_RANK_RULES, ELITE_TIERS } from '../data/gamificationOptions.js';
import EliteRankReign from '../models/EliteRankReign.js';
import EliteRankState from '../models/EliteRankState.js';
import EliteRankTransfer from '../models/EliteRankTransfer.js';
import RankingSnapshot from '../models/RankingSnapshot.js';
import StudentGamification from '../models/StudentGamification.js';
import User, { ACCOUNT_STATUSES } from '../models/User.js';
import { broadcast } from '../sockets/socket.js';
import { SOCKET_EVENTS } from '../sockets/socketEvents.js';
import ApiError from '../utils/ApiError.js';
import { createKeyedLock } from '../utils/keyedQueue.js';
import logger from '../utils/logger.js';
import { toObjectId } from '../utils/objectId.js';
import { supportsTransactions } from '../utils/transactions.js';
import { setCache } from './cacheService.js';
import { CAMPUS_EVENTS, campusEvents, emitCampusEvent } from './campusEvents.js';
import { eliteRankOf, eliteRankView, forgetEliteHolders } from './eliteRankHolders.js';
import { RANKING_CACHE_VERSION_KEY } from './gamificationService.js';
import { getStudentSummaries } from './profileService.js';
import { topOfLeaderboard } from './rankingService.js';

/*
 * Elite rank tokens (Gold, Silver, Bronze: data/gamificationOptions.js ELITE_TIERS). The holders are whoever
 * is #1, #2 and #3 on the CampusX-wide all-time leaderboard in the latest valid ranking snapshot; nothing a
 * request sends can choose, claim or move a token (there is no write route at all).
 *
 * A refresh (after points change, debounced, and every few minutes as a safety net):
 *   1. finishes an earlier snapshot whose history or notifications were interrupted (see `historySeq`)
 *   2. calculates a snapshot with the leaderboard's own rules (rankingService.topOfLeaderboard). If that
 *      fails, nothing changes: the tokens stay with the last valid holders.
 *   3. same holders → only `checkedAt` is updated. New holders → ONE compare-and-set on EliteRankState moves
 *      all three tokens at once, and only if no other snapshot was applied meanwhile and nothing newer was
 *      checked (a slower, older snapshot can never win over a newer one)
 *   4. writes the permanent history: the RankingSnapshot, the reigns (EliteRankReign) and the transfers
 *      (EliteRankTransfer), all keyed by the snapshot's number, so repeating it adds nothing
 *   5. tells the students whose elite rank changed (ELITE_RANK_CHANGED → a notification, deduplicated by the
 *      snapshot's number) and every open app (an id-free socket broadcast)
 * With MongoDB transactions (replica sets, Atlas) steps 3 and 4 commit together. Without them (a standalone
 * server) step 3 is the commit point and saves what steps 4-5 need (`pending`); whoever finds that snapshot
 * unfinished completes it before taking a new one. Refreshes in one process run one at a time.
 */

const SCOPE = ELITE_RANK_RULES.scope;
const PERIOD = ELITE_RANK_RULES.period;
const TIER_IDS = ELITE_TIERS.map((tier) => tier.id);
const SCOPE_LABEL = 'All of CampusX';

class StaleSnapshotError extends Error {}

const sameId = (a, b) => String(a) === String(b);
/** "gold=<id>|silver=<id>|bronze=": equal keys mean the same students hold the same tokens. */
const holdersKey = (holders) => TIER_IDS.map((tier) => `${tier}=${holders.find((holder) => holder.tier === tier)?.user ?? ''}`).join('|');
const ignoreDuplicate = (error) => {
  if (error?.code !== 11000) throw error;
};

// ----------------------------------------------------------------------------- the snapshot

/** The state document of the scope, created (empty) the first time. */
async function loadState() {
  const state = await EliteRankState.findOne({ scope: SCOPE }).lean();
  if (state) return state;
  await EliteRankState.create({ scope: SCOPE }).catch(ignoreDuplicate);
  return EliteRankState.findOne({ scope: SCOPE }).lean();
}

/**
 * The top of the leaderboard now, as token holders. Throws when the ranking can't be read or doesn't look
 * like a ranking (duplicates, gaps, rising points, no points), so a broken read never moves a token.
 */
async function calculateSnapshot() {
  // Taken before reading: the snapshot is at least this fresh, so comparing it with checkedAt never lets an
  // older read win.
  const computedAt = new Date();
  const entries = await topOfLeaderboard({ period: PERIOD, limit: ELITE_TIERS.length });
  const unique = new Set(entries.map((entry) => String(entry.user))).size === entries.length;
  const ordered = entries.every((entry, index) => entry.rank === index + 1 && entry.points > 0 && (index === 0 || entries[index - 1].points >= entry.points));
  if (!unique || !ordered || entries.length > ELITE_TIERS.length) throw new Error('the ranking snapshot is not valid');
  return { computedAt, entries, holders: entries.map((entry, index) => ({ tier: ELITE_TIERS[index].id, rank: entry.rank, user: entry.user })) };
}

/** Previous holders who left the rankings altogether (account no longer active, or no points), not overtaken. */
async function leftRankings(previous, holders) {
  const holding = new Set(holders.map((holder) => String(holder.user)));
  const dropped = previous.filter((holder) => !holding.has(String(holder.user))).map((holder) => holder.user);
  if (!dropped.length) return [];
  const [ranked, active] = await Promise.all([
    StudentGamification.find({ user: { $in: dropped }, eligible: true, totalPoints: { $gt: 0 } }).select('user').lean(),
    User.find({ _id: { $in: dropped }, status: ACCOUNT_STATUSES.ACTIVE }).select('_id').lean(),
  ]);
  const stillRanked = new Set(ranked.map((row) => String(row.user)));
  const stillActive = new Set(active.map((user) => String(user._id)));
  return dropped.filter((user) => !stillRanked.has(String(user)) || !stillActive.has(String(user)));
}

// ----------------------------------------------------------------------------- moving the tokens

/**
 * The commit point: one compare-and-set on the state document moves every token, only if the state is still
 * the one the snapshot was compared with (same seq, history finished, nothing newer checked). Saves what the
 * history and notifications need (`pending`), so they can be finished by anyone if this process stops.
 */
async function commit(state, snapshot, trigger, session = null) {
  const left = await leftRankings(state.holders, snapshot.holders);
  const since = (holder) => state.holders.find((item) => item.tier === holder.tier && sameId(item.user, holder.user))?.since ?? snapshot.computedAt;
  const committed = await EliteRankState.findOneAndUpdate(
    { scope: SCOPE, seq: state.seq, historySeq: state.seq, checkedAt: { $lt: snapshot.computedAt } },
    {
      $set: {
        seq: state.seq + 1,
        holders: snapshot.holders.map((holder) => ({ ...holder, since: since(holder) })),
        computedAt: snapshot.computedAt,
        checkedAt: snapshot.computedAt,
        pending: { previousHolders: state.holders.map(({ tier, user }) => ({ tier, user })), left, entries: snapshot.entries, trigger },
      },
    },
    { returnDocument: 'after', lean: true, session },
  );
  if (!committed) throw new StaleSnapshotError();
  return committed;
}

/**
 * The permanent record of a committed snapshot: the snapshot itself, the reigns that ended and began, and one
 * transfer per token that changed hands. Everything is keyed by the snapshot's number (upserts), so writing
 * it again, by this process or another, adds nothing.
 */
async function writeHistory(state, session = null) {
  const { seq, computedAt: at, holders, pending } = state;
  const options = { session };
  const quietly = (promise) => (session ? promise : promise.catch(ignoreDuplicate));
  const previous = pending?.previousHolders ?? [];
  const left = new Set((pending?.left ?? []).map(String));
  const snapshot = await RankingSnapshot.findOneAndUpdate(
    { scope: SCOPE, seq },
    {
      $setOnInsert: {
        period: PERIOD,
        computedAt: at,
        entries: pending?.entries ?? [],
        holders: holders.map(({ tier, user }) => ({ tier, user })),
        previousHolders: previous,
        left: pending?.left ?? [],
        trigger: pending?.trigger ?? null,
      },
    },
    { upsert: true, returnDocument: 'after', lean: true, ...options },
  ).catch(async (error) => {
    ignoreDuplicate(error);
    return RankingSnapshot.findOne({ scope: SCOPE, seq }).lean();
  });

  const before = new Map(previous.map((holder) => [holder.tier, String(holder.user)]));
  const after = new Map(holders.map((holder) => [holder.tier, String(holder.user)]));
  const heldBefore = new Set(before.values());
  for (const tier of ELITE_TIERS) {
    const from = before.get(tier.id) ?? null;
    const to = after.get(tier.id) ?? null;
    if (from === to) continue;
    const reason = seq === 1 ? 'first-snapshot' : from && left.has(from) ? 'left-rankings' : 'ranking';
    if (from) {
      // Only a reign that began before this snapshot (a later reign of the same student is never ended here).
      await EliteRankReign.updateOne(
        { scope: SCOPE, tier: tier.id, user: toObjectId(from), endedAt: null, startSeq: { $lt: seq } },
        { $set: { endedAt: at, endSeq: seq, endReason: left.has(from) ? 'left-rankings' : 'ranking' } },
        options,
      );
    }
    if (to) {
      await quietly(
        EliteRankReign.updateOne(
          { scope: SCOPE, tier: tier.id, startSeq: seq },
          { $setOnInsert: { user: toObjectId(to), startedAt: at, startReason: reason, enteredTopThree: !heldBefore.has(to) } },
          { upsert: true, ...options },
        ),
      );
    }
    await quietly(
      EliteRankTransfer.updateOne(
        { scope: SCOPE, seq, tier: tier.id },
        { $setOnInsert: { snapshot: snapshot?._id, rank: tier.rank, from: from ? toObjectId(from) : null, to: to ? toObjectId(to) : null, reason, at } },
        { upsert: true, ...options },
      ),
    );
  }
}

/** Tells each student whose elite rank changed (one notification each) and every open app (reload the holders). */
function announce(state) {
  const before = new Map((state.pending?.previousHolders ?? []).map((holder) => [String(holder.user), holder.tier]));
  const after = new Map(state.holders.map((holder) => [String(holder.user), holder.tier]));
  for (const userId of new Set([...before.keys(), ...after.keys()])) {
    const previousTier = before.get(userId) ?? null;
    const tier = after.get(userId) ?? null;
    if (previousTier !== tier) emitCampusEvent(CAMPUS_EVENTS.ELITE_RANK_CHANGED, { userId, scope: SCOPE, seq: state.seq, tier, previousTier });
  }
  broadcast(SOCKET_EVENTS.ELITE_RANKS_UPDATED, { seq: state.seq, at: state.computedAt });
}

/** After the history: fresh identities everywhere, the students told, and the snapshot marked finished. */
async function finish(state) {
  forgetEliteHolders();
  // Leaderboard pages carry student identities (with their elite rank): they are built again.
  await setCache(RANKING_CACHE_VERSION_KEY, Date.now());
  announce(state);
  await EliteRankState.updateOne({ scope: SCOPE, seq: state.seq, historySeq: { $lt: state.seq } }, { $set: { historySeq: state.seq, pending: null } });
}

/** Completes a committed snapshot whose history or notifications were interrupted. Safe to repeat. */
async function finishPending(state) {
  if (state.historySeq >= state.seq) return state;
  logger.info(`Elite ranks: finishing ranking snapshot #${state.seq}`);
  await writeHistory(state);
  await finish(state);
  return loadState();
}

async function refreshOnce(trigger) {
  if (mongoose.connection.readyState !== 1) return { status: 'unavailable' };
  let state = await finishPending(await loadState());
  let snapshot;
  try {
    snapshot = await calculateSnapshot();
  } catch (error) {
    logger.warn(`Elite ranks: the ranking snapshot failed, so the tokens stay where they are (${error?.message ?? error})`);
    return { status: 'failed', seq: state.seq };
  }
  if (state.checkedAt >= snapshot.computedAt) return { status: 'stale', seq: state.seq };

  if (holdersKey(state.holders) === holdersKey(snapshot.holders)) {
    const { modifiedCount } = await EliteRankState.updateOne({ scope: SCOPE, seq: state.seq, checkedAt: { $lt: snapshot.computedAt } }, { $set: { checkedAt: snapshot.computedAt } });
    return { status: modifiedCount ? 'unchanged' : 'stale', seq: state.seq };
  }

  const transactional = await supportsTransactions();
  try {
    if (transactional) {
      let committed = null;
      await mongoose.connection.transaction(async (session) => {
        committed = await commit(state, snapshot, trigger, session);
        await writeHistory(committed, session);
      });
      state = committed;
    } else {
      state = await commit(state, snapshot, trigger);
      await writeHistory(state);
    }
  } catch (error) {
    if (error instanceof StaleSnapshotError) return { status: 'stale', seq: state.seq };
    throw error;
  }
  await finish(state);
  logger.info(`Elite ranks: ranking snapshot #${state.seq} moved the tokens (${trigger}${transactional ? ', in a transaction' : ''})`);
  return { status: 'transferred', seq: state.seq };
}

// ----------------------------------------------------------------------------- running refreshes

const withLock = createKeyedLock();
const running = new Set();
let timer = null;

/**
 * Takes a ranking snapshot now and moves the tokens if the top three changed. Refreshes in this process run
 * one after another. Never throws: resolves to { status: transferred | unchanged | stale | failed |
 * unavailable, seq }.
 */
export function refreshEliteRanks(trigger = 'schedule') {
  const task = withLock(SCOPE, () => refreshOnce(trigger)).catch((error) => {
    logger.warn(`Elite ranks: the snapshot couldn't be saved, it will be retried (${error?.message ?? error})`);
    return { status: 'failed' };
  });
  running.add(task);
  task.finally(() => running.delete(task));
  return task;
}

/** Asks for a refresh shortly: point changes that land close together are settled by one snapshot. */
export function scheduleEliteRefresh(trigger = 'points') {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    refreshEliteRanks(trigger);
  }, ELITE_RANK_RULES.refreshDelayMs);
  timer.unref?.();
}

/** Cancels a scheduled refresh and waits for running ones (shutdown). */
export async function stopEliteRefreshes() {
  clearTimeout(timer);
  timer = null;
  await Promise.allSettled([...running]);
}

let registered = false;

/** Points or eligibility changed (gamificationService), or an account was deleted: the top three may have moved. */
export function registerEliteRankListeners() {
  if (registered) return;
  registered = true;
  campusEvents.on(CAMPUS_EVENTS.GAMIFICATION_RANKINGS_CHANGED, () => scheduleEliteRefresh('points'));
  campusEvents.on(CAMPUS_EVENTS.AUTH_ACCOUNT_DELETED, () => scheduleEliteRefresh('account'));
}

// ----------------------------------------------------------------------------- reading (Hall of Fame)

const tierView = ({ id, rank, title, token, short, emblem }) => ({ id, rank, title, token, short, emblem });
const lengthOf = (reign, now) => Math.max(0, (reign.endedAt ?? now).getTime() - new Date(reign.startedAt).getTime());
const isReady = (state) => Boolean(state) && new Date(state.checkedAt).getTime() > 0;

/** A reign as shown. `student` is null once the account is no longer active ("a former CampusX student"). */
const reignView = (reign, students, now) => ({
  id: reign._id.toString(),
  tier: reign.tier,
  student: students ? students.get(String(reign.user)) ?? null : undefined,
  startedAt: reign.startedAt,
  endedAt: reign.endedAt ?? null,
  current: !reign.endedAt,
  durationMs: lengthOf(reign, now),
  startReason: reign.startReason,
  endReason: reign.endReason ?? null,
  enteredTopThree: Boolean(reign.enteredTopThree),
});

/** How often each student came into the top three: Map(student id → count). */
async function topThreeEntries(userIds) {
  if (!userIds.length) return new Map();
  const rows = await EliteRankReign.aggregate([
    { $match: { scope: SCOPE, enteredTopThree: true, user: { $in: userIds.map((id) => toObjectId(String(id))) } } },
    { $group: { _id: '$user', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

/**
 * GET /rankings/elite: the three token holders now (from the last valid snapshot) and the viewer's own elite
 * rank. `status: 'pending'` until the first snapshot was taken. A holder whose account is no longer active
 * shows as unclaimed until the next snapshot hands the token on.
 */
export async function getEliteOverview(viewer) {
  const state = await EliteRankState.findOne({ scope: SCOPE }).lean();
  const holders = state?.holders ?? [];
  const ids = holders.map((holder) => holder.user);
  const [students, records, entries] = await Promise.all([
    getStudentSummaries(ids),
    StudentGamification.find({ user: { $in: ids } }).select('user totalPoints').lean(),
    topThreeEntries(ids),
  ]);
  const points = new Map(records.map((row) => [String(row.user), row.totalPoints ?? 0]));
  const mine = holders.find((holder) => sameId(holder.user, viewer._id));
  return {
    scope: { id: SCOPE, period: PERIOD, label: SCOPE_LABEL },
    status: isReady(state) ? 'ready' : 'pending',
    seq: state?.seq ?? 0,
    updatedAt: isReady(state) ? state.checkedAt : null,
    tiers: ELITE_TIERS.map(tierView),
    holders: ELITE_TIERS.map((tier) => {
      const holder = holders.find((item) => item.tier === tier.id);
      const student = holder ? students.get(String(holder.user)) ?? null : null;
      return {
        tier: tierView(tier),
        student,
        since: student ? holder.since : null,
        points: student ? points.get(String(holder.user)) ?? 0 : null,
        topThreeEntries: student ? entries.get(String(holder.user)) ?? 1 : null,
      };
    }),
    you: mine ? eliteRankView(mine.tier, mine.since) : null,
  };
}

/** A transfer's side: null when the token was unclaimed (or nobody holds it now), else the student or null. */
const sideOf = (id, students) => (id ? { student: students.get(String(id)) ?? null } : null);

/**
 * GET /rankings/hall-of-fame: current holders, previous holders of each token (when they gained and lost
 * it, for how long), records (longest Gold reign, most entries into the top three) and the transfer
 * history, newest first (paged). History stays after students lose their token.
 */
export async function getHallOfFame(viewer, { page = 1, limit = ELITE_RANK_RULES.hallOfFame.transfers.default } = {}) {
  const now = new Date();
  const rules = ELITE_RANK_RULES.hallOfFame;
  const [overview, previous, longestGold, mostEntries, transfers, transferCount, holderIds] = await Promise.all([
    getEliteOverview(viewer),
    Promise.all(ELITE_TIERS.map((tier) => EliteRankReign.find({ scope: SCOPE, tier: tier.id, endedAt: { $ne: null } }).sort({ startedAt: -1, _id: -1 }).limit(rules.previousHolders).lean())),
    EliteRankReign.aggregate([
      { $match: { scope: SCOPE, tier: 'gold' } },
      { $addFields: { length: { $subtract: [{ $ifNull: ['$endedAt', now] }, '$startedAt'] } } },
      { $sort: { length: -1, startedAt: 1, _id: 1 } },
      { $limit: 1 },
    ]),
    EliteRankReign.aggregate([
      { $match: { scope: SCOPE, enteredTopThree: true } },
      { $group: { _id: '$user', entries: { $sum: 1 }, firstAt: { $min: '$startedAt' } } },
      { $sort: { entries: -1, firstAt: 1, _id: 1 } },
      // Some may no longer be active: read a few extra.
      { $limit: rules.records * 4 },
    ]),
    EliteRankTransfer.find({ scope: SCOPE }).sort({ seq: -1, rank: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    EliteRankTransfer.countDocuments({ scope: SCOPE }),
    EliteRankReign.distinct('user', { scope: SCOPE }),
  ]);
  const ids = [
    ...previous.flat().map((reign) => reign.user),
    ...longestGold.map((reign) => reign.user),
    ...mostEntries.map((row) => row._id),
    ...transfers.flatMap((row) => [row.from, row.to]).filter(Boolean),
  ];
  const students = await getStudentSummaries(ids);
  return {
    ...overview,
    previousHolders: Object.fromEntries(ELITE_TIERS.map((tier, index) => [tier.id, previous[index].map((reign) => reignView(reign, students, now))])),
    records: {
      longestGoldReign: longestGold[0] ? reignView(longestGold[0], students, now) : null,
      mostTopThreeEntries: mostEntries
        .filter((row) => students.has(String(row._id)))
        .slice(0, rules.records)
        .map((row) => ({ student: students.get(String(row._id)), entries: row.entries, firstAt: row.firstAt })),
    },
    totals: { transfers: transferCount, holders: holderIds.length },
    transfers: transfers.map((row) => ({
      id: row._id.toString(),
      seq: row.seq,
      tier: row.tier,
      from: sideOf(row.from, students),
      to: sideOf(row.to, students),
      reason: row.reason,
      at: row.at,
    })),
    pagination: { page, limit, total: transferCount, hasMore: page * limit < transferCount },
  };
}

/**
 * GET /rankings/elite/students/:userId: one student's elite rank history (every reign, newest first), how
 * often they came into the top three and how long they held each token. Active students only; anyone else
 * looks the same as an unknown id (404).
 */
export async function getStudentEliteHistory(studentId) {
  const id = toObjectId(String(studentId));
  const student = id ? await User.exists({ _id: id, status: ACCOUNT_STATUSES.ACTIVE }) : null;
  if (!student) throw ApiError.notFound("We couldn't find that student.");
  const now = new Date();
  const [reigns, totals, current] = await Promise.all([
    EliteRankReign.find({ scope: SCOPE, user: id }).sort({ startedAt: -1, _id: -1 }).limit(50).lean(),
    EliteRankReign.aggregate([
      { $match: { scope: SCOPE, user: id } },
      {
        $group: {
          _id: '$tier',
          reigns: { $sum: 1 },
          entries: { $sum: { $cond: ['$enteredTopThree', 1, 0] } },
          heldMs: { $sum: { $subtract: [{ $ifNull: ['$endedAt', now] }, '$startedAt'] } },
          longestMs: { $max: { $subtract: [{ $ifNull: ['$endedAt', now] }, '$startedAt'] } },
        },
      },
    ]),
    eliteRankOf(id),
  ]);
  const byTier = new Map(totals.map((row) => [row._id, row]));
  const best = ELITE_TIERS.find((tier) => byTier.has(tier.id)) ?? null;
  return {
    current,
    reigns: reigns.map((reign) => reignView(reign, null, now)),
    stats: {
      topThreeEntries: totals.reduce((sum, row) => sum + row.entries, 0),
      reigns: totals.reduce((sum, row) => sum + row.reigns, 0),
      bestTier: best?.id ?? null,
      heldMs: Object.fromEntries(ELITE_TIERS.map((tier) => [tier.id, byTier.get(tier.id)?.heldMs ?? 0])),
      longestReignMs: Object.fromEntries(ELITE_TIERS.map((tier) => [tier.id, byTier.get(tier.id)?.longestMs ?? 0])),
    },
  };
}
