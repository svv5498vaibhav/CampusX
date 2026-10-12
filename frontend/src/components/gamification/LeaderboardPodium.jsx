import { motion, useReducedMotion } from 'framer-motion';
import { Crown, Medal } from 'lucide-react';
import { Link } from 'react-router';
import { BadgeIcon } from '@/components/gamification/BadgeCard';
import { campusLine } from '@/components/gamification/LeaderboardRow';
import { Avatar } from '@/components/ui';
import { formatPoints } from '@/constants/gamification';
import { profilePath } from '@/constants/routes';
import { cn } from '@/utils/cn';
import { getFullName } from '@/utils/string';

// Calm podium: the winner in green, second and third in soft neutrals.
const PLACES = {
  1: { icon: Crown, label: '1st', block: 'bg-primary text-primary-fg', ring: 'ring-primary', height: 'sm:h-28' },
  2: { icon: Medal, label: '2nd', block: 'bg-primary-soft text-primary-soft-fg', ring: 'ring-line-strong', height: 'sm:h-20' },
  3: { icon: Medal, label: '3rd', block: 'bg-accent-soft text-accent-fg', ring: 'ring-line-strong', height: 'sm:h-14' },
};

function PodiumPlace({ entry, delay, youId }) {
  const reduceMotion = useReducedMotion();
  const place = PLACES[entry.rank] ?? PLACES[3];
  const PlaceIcon = place.icon;
  const isYou = entry.student.id === youId;
  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="flex min-w-0 flex-col items-center sm:justify-end"
      data-podium-rank={entry.rank}
    >
      <div className="flex w-full items-center gap-3 rounded-3xl border border-line bg-surface p-3 shadow-soft sm:flex-col sm:gap-2 sm:rounded-b-none sm:border-b-0 sm:p-4 sm:text-center">
        <span className="w-7 shrink-0 text-center font-display text-sm font-bold text-ink-muted sm:hidden">#{entry.rank}</span>
        <div className="relative shrink-0">
          <Avatar src={entry.student.avatarUrl} name={getFullName(entry.student)} size="lg" className={cn('ring-4', place.ring)} />
          <span className={cn('absolute -right-1 -bottom-1 grid size-6 place-items-center rounded-full', place.block)} aria-hidden="true">
            <PlaceIcon className="size-3.5" />
          </span>
        </div>
        <div className="min-w-0 flex-1 sm:w-full">
          <Link to={profilePath(entry.student.id)} className="block truncate font-display font-bold text-ink hover:underline">
            {getFullName(entry.student)}{isYou && <span className="ml-1 text-xs text-primary">(you)</span>}
          </Link>
          <p className="truncate text-xs text-ink-muted">{campusLine(entry.student)}</p>
          <p className="mt-1 font-display text-lg font-bold text-ink">{formatPoints(entry.points)} <span className="text-xs font-semibold text-ink-subtle">XP</span></p>
          <div className="mt-1 flex items-center gap-1.5 sm:justify-center">
            <span className="rounded-lg bg-surface-muted px-2 py-0.5 text-[11px] font-bold text-ink-muted">Level {entry.level.level}</span>
            {entry.latestBadge && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-muted" title={entry.latestBadge.name}>
                <BadgeIcon badge={entry.latestBadge} size="sm" /> <span className="hidden truncate sm:inline">{entry.latestBadge.name}</span>
              </span>
            )}
          </div>
        </div>
      </div>
      <div className={cn('hidden w-full place-items-center rounded-b-2xl font-display text-lg font-bold sm:grid', place.block, place.height)} aria-hidden="true">
        {place.label}
      </div>
    </motion.li>
  );
}

/** The top three: stacked cards on phones, a podium (2nd · 1st · 3rd) from `sm` up. */
export function LeaderboardPodium({ entries, youId }) {
  const top = entries.filter((entry) => entry.rank <= 3).slice(0, 3);
  if (!top.length) return null;
  const byRank = (rank) => top.find((entry) => entry.rank === rank);
  const desktopOrder = [byRank(2), byRank(1), byRank(3)].filter(Boolean);
  return (
    <section aria-label="Top three">
      <ol className="flex flex-col gap-2 sm:hidden">
        {top.map((entry, index) => <PodiumPlace key={entry.student.id} entry={entry} delay={index * 0.08} youId={youId} />)}
      </ol>
      <ol className="hidden grid-cols-3 items-end gap-3 sm:grid">
        {desktopOrder.map((entry, index) => <PodiumPlace key={entry.student.id} entry={entry} delay={index * 0.08} youId={youId} />)}
      </ol>
    </section>
  );
}
