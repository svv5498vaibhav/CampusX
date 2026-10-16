import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router';
import { EliteProfileFrame } from '@/components/elite/EliteProfileFrame';
import { EliteRankName } from '@/components/elite/EliteRankName';
import { RankTokenBadge } from '@/components/elite/RankTokenBadge';
import { Avatar } from '@/components/ui';
import { eliteTierOf } from '@/constants/elite';
import { formatPoints } from '@/constants/gamification';
import { profilePath } from '@/constants/routes';
import { cn } from '@/utils/cn';
import { getFullName } from '@/utils/string';

/** "CSE • VNIT": branch and college, from the student's public summary. */
export const campusLine = (student) => [student.branch?.shortName, student.college?.shortName ?? student.college?.name].filter(Boolean).join(' • ');

/**
 * One place on the leaderboard: rank, student, branch/college, level and points. Gold, Silver and Bronze
 * token holders (student.eliteRank, from the server) get their frame, metal name and token.
 */
export function LeaderboardRow({ entry, isYou = false, index = 0 }) {
  const reduceMotion = useReducedMotion();
  const { student } = entry;
  const tier = eliteTierOf(student.eliteRank);
  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 10) * 0.03 }}
      className={cn('flex items-center gap-3 rounded-2xl border px-3 py-2.5 sm:px-4', isYou ? 'border-primary/50 bg-primary-soft' : 'border-line bg-surface')}
      data-rank={entry.rank}
      aria-label={`Rank ${entry.rank}: ${getFullName(student)}${tier ? `, ${tier.title}` : ''}, ${formatPoints(entry.points)} XP${isYou ? ' (you)' : ''}`}
    >
      <span className="w-9 shrink-0 text-center font-display text-sm font-bold text-ink-muted">#{entry.rank}</span>
      <EliteProfileFrame eliteRank={student.eliteRank} size="md">
        <Avatar src={student.avatarUrl} name={getFullName(student)} size="md" />
      </EliteProfileFrame>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link to={profilePath(student.id)} className="truncate font-semibold text-ink hover:underline">
            <EliteRankName eliteRank={student.eliteRank}>{getFullName(student)}</EliteRankName>
            {isYou && <span className="ml-1.5 text-xs font-bold text-primary">You</span>}
          </Link>
          <RankTokenBadge eliteRank={student.eliteRank} variant="compact" />
        </div>
        <p className="truncate text-xs text-ink-muted">{campusLine(student)}</p>
      </div>
      <span className="hidden shrink-0 rounded-lg bg-surface-muted px-2 py-0.5 text-[11px] font-bold text-ink-muted sm:inline">Level {entry.level.level}</span>
      <span className="w-20 shrink-0 text-right font-display text-sm font-bold text-ink sm:w-24">
        {formatPoints(entry.points)} <span className="text-xs font-semibold text-ink-subtle">XP</span>
      </span>
    </motion.li>
  );
}
