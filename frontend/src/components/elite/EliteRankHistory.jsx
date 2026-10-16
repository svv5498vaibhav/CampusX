import { useEffect } from 'react';
import { Crown } from 'lucide-react';
import { Link } from 'react-router';
import { ProfileSection } from '@/components/profile/ProfileSection';
import { ELITE_TIER_ORDER, ELITE_TIERS, formatReign, formatReignDate } from '@/constants/elite';
import { ROUTES } from '@/constants/routes';
import { useEliteStore } from '@/store/eliteStore';
import { RankTokenBadge } from './RankTokenBadge';

/**
 * One holding of a token: which (and who, as `children`), for how long, and from when to when (or "now").
 * Two lines, so dates never get squeezed on a phone.
 */
export function ReignRow({ reign, children }) {
  return (
    <li className="rounded-2xl border border-line px-3 py-2.5" data-reign-tier={reign.tier}>
      <div className="flex min-w-0 items-center gap-2">
        <RankTokenBadge eliteRank={{ tier: reign.tier }} variant="compact" />
        {children}
        <p className="ml-auto shrink-0 text-sm font-semibold text-ink">{formatReign(reign.durationMs)}</p>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        {formatReignDate(reign.startedAt)} – {reign.current ? <span className="font-semibold text-ink">now</span> : formatReignDate(reign.endedAt)}
      </p>
    </li>
  );
}

/** "Entered the top three 2 times · Gold for 3 days": the student's elite record in one line. */
function summaryOf(stats) {
  const parts = [`Entered the top three ${stats.topThreeEntries} time${stats.topThreeEntries === 1 ? '' : 's'}`];
  for (const id of ELITE_TIER_ORDER) {
    if (stats.heldMs[id] > 0) parts.push(`${ELITE_TIERS[id].short} for ${formatReign(stats.heldMs[id])}`);
  }
  return parts.join(' · ');
}

/**
 * A profile's "Elite rank history": every time the student held the Gold, Silver or Bronze token (newest
 * first), how often they came into the top three and how long they held each token. Kept after a token is
 * lost. Shows nothing for students who never held one (or while it can't be loaded).
 */
export function EliteRankHistory({ userId, theme, headingAs = 'h2', limit = 6 }) {
  const history = useEliteStore((state) => state.histories[userId]);

  useEffect(() => {
    useEliteStore.getState().fetchHistory(userId);
  }, [userId]);

  const data = history?.data;
  if (!data?.reigns?.length) return null;

  return (
    <ProfileSection icon={Crown} title="Elite rank history" theme={theme} headingAs={headingAs}>
      <p className="text-sm text-ink-muted">{summaryOf(data.stats)}</p>
      <ol className="mt-3 flex flex-col gap-2" aria-label="Elite rank tokens held">
        {data.reigns.slice(0, limit).map((reign) => <ReignRow key={reign.id} reign={reign} />)}
      </ol>
      <Link to={ROUTES.HALL_OF_FAME} className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
        See the Hall of Fame
      </Link>
    </ProfileSection>
  );
}
