import { ELITE_RANK_RULES, ELITE_TIERS } from '../data/gamificationOptions.js';
import EliteRankState from '../models/EliteRankState.js';
import logger from '../utils/logger.js';

/*
 * Who holds the elite rank tokens, for every student identity the API shows (profileService.toStudentSummary
 * and public profiles): Map(student id → { tier, rank, title, token, since }). Read from EliteRankState, the
 * only source (services/eliteRankService.js writes it), and kept for ELITE_RANK_RULES.holdersCacheSeconds so
 * a page of 50 summaries costs one small read. If the database can't be asked, the last holders read are
 * used (or nobody): ranks are never guessed. Kept apart from eliteRankService.js so profileService can use
 * it without importing the ranking services.
 */

const SCOPE = ELITE_RANK_RULES.scope;
const TTL_MS = ELITE_RANK_RULES.holdersCacheSeconds * 1000;

let memo = null; // { at, holders }
let loading = null;

/** The public view of a token holder's elite rank. */
export function eliteRankView(tierId, since = null) {
  const tier = ELITE_TIERS.find((item) => item.id === tierId);
  if (!tier) return null;
  return { tier: tier.id, rank: tier.rank, title: tier.title, token: tier.token, since };
}

async function load() {
  try {
    const state = await EliteRankState.findOne({ scope: SCOPE }).select('holders').lean();
    const holders = new Map((state?.holders ?? []).map((holder) => [holder.user.toString(), eliteRankView(holder.tier, holder.since)]));
    memo = { at: Date.now(), holders };
    return holders;
  } catch (error) {
    logger.warn(`Elite ranks: holders unavailable (${error?.message ?? error}); showing the last known holders`);
    return memo?.holders ?? new Map();
  } finally {
    loading = null;
  }
}

/** Map(student id → elite rank view) of the current token holders. */
export async function getEliteHolders() {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.holders;
  loading ??= load();
  return loading;
}

/** A student's current elite rank, or null (ranked #4 or lower, or no points yet). */
export async function eliteRankOf(userId) {
  if (!userId) return null;
  return (await getEliteHolders()).get(String(userId)) ?? null;
}

/** Called after the tokens moved in this process, so its next read is fresh. */
export function forgetEliteHolders() {
  memo = null;
}
