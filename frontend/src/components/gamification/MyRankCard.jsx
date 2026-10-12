import { TrendingUp } from 'lucide-react';
import { LevelProgress } from '@/components/gamification/LevelProgress';
import { RankStatCard } from '@/components/gamification/RankStatCard';
import { Card, Loader } from '@/components/ui';
import { formatPoints } from '@/constants/gamification';
import { cn } from '@/utils/cn';

/**
 * "Your Campus Position": overall rank, XP, level progress and the college / branch / semester ranks,
 * all from GET /rankings/me.
 */
export function MyRankCard({ myRanks, status, className }) {
  if (!myRanks) {
    return (
      <Card className={className} padding="md">
        {status === 'error' ? <p className="text-sm text-ink-muted">We couldn’t load your position right now.</p> : <Loader centered label="Loading your position" className="min-h-24" />}
      </Card>
    );
  }
  const overall = myRanks.ranks.overall.rank;
  return (
    <Card className={cn('border-primary/40', className)} padding="md" aria-labelledby="my-rank-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="my-rank-title" className="text-sm font-semibold text-ink-muted">Your Campus Position</h2>
          <p className="mt-1 font-display text-4xl font-bold text-ink">{overall ? `#${overall}` : '—'}</p>
          {!overall && <p className="text-xs text-ink-muted">Earn your first XP to join the leaderboard.</p>}
        </div>
        <span className="grid size-11 place-items-center rounded-2xl bg-primary-soft text-primary-soft-fg" aria-hidden="true">
          <TrendingUp className="size-5" />
        </span>
      </div>
      <p className="mt-3 font-display text-xl font-bold text-ink">{formatPoints(myRanks.totalPoints)} <span className="text-sm font-semibold text-ink-subtle">XP</span></p>
      <LevelProgress level={myRanks.level} className="mt-2" />
      <div className="mt-4 grid grid-cols-3 gap-2">
        <RankStatCard label="College" rank={myRanks.ranks.college.rank} />
        <RankStatCard label="Branch" rank={myRanks.ranks.branch.rank} />
        <RankStatCard label="Semester" rank={myRanks.ranks.semester.rank} />
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        This week: <span className="font-semibold text-ink">{formatPoints(myRanks.weekly.points)} XP</span>
        {myRanks.weekly.rank && <> · #{myRanks.weekly.rank}</>}
        {' · '}This month: <span className="font-semibold text-ink">{formatPoints(myRanks.monthly.points)} XP</span>
        {myRanks.monthly.rank && <> · #{myRanks.monthly.rank}</>}
      </p>
    </Card>
  );
}
