import { useFollowStore } from '@/store/followStore';
import { AnimatedCount } from './AnimatedCount';

function Stat({ count, singular, plural, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className="group -mx-1.5 inline-flex items-baseline gap-1.5 rounded-lg px-1.5 py-0.5 text-sm transition-colors hover:bg-surface-muted"
    >
      <AnimatedCount value={count} className="font-display text-base font-bold text-ink" />
      <span className="text-ink-muted transition-colors group-hover:text-ink">{count === 1 ? singular : plural}</span>
    </button>
  );
}

/**
 * "128 followers · 96 following" under a profile's name. Each opens its list. The numbers come from the
 * follow store (seeded by the profile, kept current by follows anywhere in the app and by live updates).
 */
export function FollowStats({ userId, onOpen }) {
  const counts = useFollowStore((state) => state.counts[userId]);
  if (!counts) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1" data-follow-stats={userId}>
      <Stat count={counts.followersCount} singular="follower" plural="followers" onClick={() => onOpen('followers')} />
      <span aria-hidden="true" className="text-ink-subtle">·</span>
      <Stat count={counts.followingCount} singular="following" plural="following" onClick={() => onOpen('following')} />
    </div>
  );
}
