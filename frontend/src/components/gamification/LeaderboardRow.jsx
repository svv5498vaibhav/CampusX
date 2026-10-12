import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router';
import { Avatar } from '@/components/ui';
import { formatPoints } from '@/constants/gamification';
import { profilePath } from '@/constants/routes';
import { cn } from '@/utils/cn';
import { getFullName } from '@/utils/string';

/** "CSE • VNIT": branch and college, from the student's public summary. */
export const campusLine = (student) => [student.branch?.shortName, student.college?.shortName ?? student.college?.name].filter(Boolean).join(' • ');

/** One place on the leaderboard: rank, student, branch/college, level and points. */
export function LeaderboardRow({ entry, isYou = false, index = 0 }) {
  const reduceMotion = useReducedMotion();
  const { student } = entry;
  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 10) * 0.03 }}
      className={cn('flex items-center gap-3 rounded-2xl border px-3 py-2.5 sm:px-4', isYou ? 'border-primary/50 bg-primary-soft' : 'border-line bg-surface')}
      data-rank={entry.rank}
      aria-label={`Rank ${entry.rank}: ${getFullName(student)}, ${formatPoints(entry.points)} XP${isYou ? ' (you)' : ''}`}
    >
      <span className="w-9 shrink-0 text-center font-display text-sm font-bold text-ink-muted">#{entry.rank}</span>
      <Avatar src={student.avatarUrl} name={getFullName(student)} size="md" />
      <div className="min-w-0 flex-1">
        <Link to={profilePath(student.id)} className="block truncate font-semibold text-ink hover:underline">
          {getFullName(student)}{isYou && <span className="ml-1.5 text-xs font-bold text-primary">You</span>}
        </Link>
        <p className="truncate text-xs text-ink-muted">{campusLine(student)}</p>
      </div>
      <span className="hidden shrink-0 rounded-lg bg-surface-muted px-2 py-0.5 text-[11px] font-bold text-ink-muted sm:inline">Level {entry.level.level}</span>
      <span className="w-20 shrink-0 text-right font-display text-sm font-bold text-ink sm:w-24">
        {formatPoints(entry.points)} <span className="text-xs font-semibold text-ink-subtle">XP</span>
      </span>
    </motion.li>
  );
}
