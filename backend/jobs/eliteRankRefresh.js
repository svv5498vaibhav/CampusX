import { ELITE_RANK_RULES } from '../data/gamificationOptions.js';
import { refreshEliteRanks, stopEliteRefreshes } from '../services/eliteRankService.js';

/*
 * The elite rank tokens' safety net: a light in-process timer (no scheduler needed). Point changes already ask
 * for a snapshot (services/eliteRankService.js), but some changes reach the rankings without one: an account
 * suspended or closed, another API instance, an edit made directly in the database. Every
 * ELITE_RANK_RULES.refreshEveryMinutes a snapshot is taken anyway; one that finds the same top three changes
 * nothing. A first snapshot runs shortly after start-up (it also finishes a snapshot a restart interrupted).
 * Snapshots are safe to run from several instances at once (see the service).
 */

const MINUTE = 60 * 1000;
let interval = null;
let first = null;

export function startEliteRankRefresh() {
  if (interval) return;
  interval = setInterval(() => refreshEliteRanks('schedule'), ELITE_RANK_RULES.refreshEveryMinutes * MINUTE);
  interval.unref();
  first = setTimeout(() => refreshEliteRanks('startup'), 3_000);
  first.unref();
}

/** Stops the timer and waits for a snapshot that is still running. */
export async function stopEliteRankRefresh() {
  clearInterval(interval);
  clearTimeout(first);
  interval = null;
  first = null;
  await stopEliteRefreshes();
}
