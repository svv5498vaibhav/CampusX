import { Crown, Shield } from 'lucide-react';

/*
 * Elite rank tokens (Gold, Silver, Bronze). Who holds one always comes from the API: every student summary
 * carries `eliteRank` ({ tier, rank, title, token, since } or null), set by the server's ranking snapshots
 * (backend/services/eliteRankService.js). The frontend only decides how a tier looks, never who has one.
 */
export const ELITE_TIERS = Object.freeze({
  gold: { id: 'gold', rank: 1, title: 'Golden Champion', token: 'Golden Token', short: 'Gold', icon: Crown },
  silver: { id: 'silver', rank: 2, title: 'Silver Elite', token: 'Silver Token', short: 'Silver', icon: Shield },
  bronze: { id: 'bronze', rank: 3, title: 'Bronze Elite', token: 'Bronze Token', short: 'Bronze', icon: Shield },
});
export const ELITE_TIER_ORDER = Object.freeze(['gold', 'silver', 'bronze']);

/** The tier's presentation for an `eliteRank` (or a tier id), or null for everyone ranked #4 and below. */
export function eliteTierOf(eliteRank) {
  const id = typeof eliteRank === 'string' ? eliteRank : eliteRank?.tier;
  return (id && ELITE_TIERS[id]) || null;
}

/** "Golden Champion, CampusX rank 1": the words a screen reader hears for a tier. */
export const eliteLabel = (tier) => `${tier.title}, CampusX rank ${tier.rank}`;

/** Why a token moved (backend ELITE_TRANSFER_REASONS). */
export const ELITE_TRANSFER_REASONS = Object.freeze({
  'first-snapshot': 'First tokens awarded',
  ranking: 'Ranking change',
  'left-rankings': 'Holder left the rankings',
});

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "3 days", "5 hours", "12 min", "under a minute": how long a token was held. */
export function formatReign(ms) {
  if (!ms || ms < MINUTE) return 'under a minute';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min`;
  if (ms < DAY) {
    const hours = Math.floor(ms / HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.floor(ms / DAY);
  return `${days} day${days === 1 ? '' : 's'}`;
}

const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
/** "14 Oct 2026". */
export const formatReignDate = (value) => (value ? shortDate.format(new Date(value)) : '');
