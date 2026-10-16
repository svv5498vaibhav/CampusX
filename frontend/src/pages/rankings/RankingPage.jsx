import { useEffect, useRef, useState } from 'react';
import { Award, CircleHelp, Crown, History, Trophy, UserRoundPen } from 'lucide-react';
import { Link } from 'react-router';
import { HowPointsWork } from '@/components/gamification/HowPointsWork';
import { LeaderboardPodium } from '@/components/gamification/LeaderboardPodium';
import { LeaderboardRow } from '@/components/gamification/LeaderboardRow';
import { LeaderboardTabs } from '@/components/gamification/LeaderboardTabs';
import { MyRankCard } from '@/components/gamification/MyRankCard';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button, EmptyState, ErrorState } from '@/components/ui';
import { RANKING_PERIODS, RANKING_TABS } from '@/constants/gamification';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useAuthStore } from '@/store/authStore';
import { useEliteStore } from '@/store/eliteStore';
import { useRankingStore } from '@/store/rankingStore';

function LeaderboardSkeleton() {
  return (
    <div role="status" aria-label="Loading the leaderboard" className="flex flex-col gap-2">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex animate-pulse items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
          <span className="h-4 w-8 rounded bg-surface-muted" />
          <span className="size-10 rounded-xl bg-surface-muted" />
          <span className="h-4 flex-1 rounded bg-surface-muted" />
          <span className="h-4 w-16 rounded bg-surface-muted" />
        </div>
      ))}
    </div>
  );
}

/** /rankings: the campus leaderboard, by campus, college, branch or semester, all time, this month or this week. */
export default function RankingPage() {
  useDocumentTitle('Campus Rankings');
  const userId = useAuthStore((state) => state.user?.id);
  const [filters, update] = useUrlFilters({ scope: 'overall', period: 'all' });
  const scope = RANKING_TABS.some((tab) => tab.id === filters.scope) ? filters.scope : 'overall';
  const period = RANKING_PERIODS.some((item) => item.id === filters.period) ? filters.period : 'all';
  const leaderboard = useRankingStore((state) => state.leaderboard);
  const meta = useRankingStore((state) => state.meta);
  const status = useRankingStore((state) => state.status);
  const error = useRankingStore((state) => state.error);
  const pagination = useRankingStore((state) => state.pagination);
  const loadingMore = useRankingStore((state) => state.loadingMore);
  const myRanks = useRankingStore((state) => state.myRanks);
  const myRanksStatus = useRankingStore((state) => state.myRanksStatus);
  const { forViewer, fetchLeaderboard, fetchMyRanks, loadMore } = useRankingStore.getState();
  const [rulesOpen, setRulesOpen] = useState(false);
  // The elite tokens moved (a new ranking snapshot): show the new identities on the open leaderboard.
  const eliteSeq = useEliteStore((state) => state.overview?.seq);
  const shownSeq = useRef(eliteSeq);

  useEffect(() => {
    forViewer(userId);
    fetchMyRanks();
  }, [userId]);
  useEffect(() => {
    fetchLeaderboard({ scope, period });
  }, [scope, period, userId]);
  useEffect(() => {
    if (eliteSeq === undefined || shownSeq.current === eliteSeq) return;
    const first = shownSeq.current === undefined;
    shownSeq.current = eliteSeq;
    if (!first) {
      fetchLeaderboard({ scope, period });
      fetchMyRanks();
    }
  }, [eliteSeq]);

  const current = meta?.scope.id === scope && meta?.period.id === period;
  const rest = leaderboard.filter((entry) => entry.rank > 3);
  const loading = status === 'loading' && !leaderboard.length;

  return (
    <PageContainer width="wide">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Campus Rankings</h1>
          <p className="mt-1 text-ink-muted">See where your campus journey takes you.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button as={Link} to={ROUTES.HALL_OF_FAME} variant="outline" size="sm" leftIcon={Crown}>Hall of Fame</Button>
          <Button as={Link} to={ROUTES.BADGES} variant="outline" size="sm" leftIcon={Award}>Badges</Button>
          <Button as={Link} to={ROUTES.POINT_ACTIVITY} variant="outline" size="sm" leftIcon={History}>Points history</Button>
          <Button variant="ghost" size="sm" leftIcon={CircleHelp} onClick={() => setRulesOpen(true)}>How points work</Button>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <aside className="lg:sticky lg:top-8 lg:order-2" aria-label="Your position">
          <MyRankCard myRanks={myRanks} status={myRanksStatus} />
        </aside>

        <div className="flex min-w-0 flex-col gap-4 lg:order-1">
          <LeaderboardTabs scope={scope} period={period} onChange={update} />
          {current && meta.scope.name && <p className="text-sm text-ink-muted">{meta.scope.name} · {meta.period.label}</p>}

          <section id="ranking-panel" role="tabpanel" aria-labelledby={`ranking-tab-${scope}`} className="flex flex-col gap-4">
            {loading && <LeaderboardSkeleton />}
            {status === 'error' && !leaderboard.length && <ErrorState title="We couldn't load the leaderboard" description={error} onRetry={() => fetchLeaderboard({ scope, period })} />}
            {status === 'ready' && current && !meta.scope.available && (
              <EmptyState
                icon={UserRoundPen}
                title="Add your campus details first"
                description="College, branch and semester rankings use the details on your profile."
                action={<Button as={Link} to={ROUTES.PROFILE_EDIT}>Edit profile</Button>}
                className="rounded-3xl border border-dashed border-line-strong"
              />
            )}
            {status === 'ready' && current && meta.scope.available && leaderboard.length === 0 && (
              <EmptyState
                icon={Trophy}
                title="Your campus leaderboard is getting ready."
                description={period === 'all' ? 'Share a post, add a project or join a community to earn the first XP.' : 'Nobody has earned XP in this period yet. Be the first!'}
                className="rounded-3xl border border-dashed border-line-strong"
              />
            )}
            {leaderboard.length > 0 && (
              <>
                <LeaderboardPodium entries={leaderboard} youId={userId} />
                {rest.length > 0 && (
                  <ol className="flex flex-col gap-2" aria-label="Leaderboard">
                    {rest.map((entry, index) => <LeaderboardRow key={entry.student.id} entry={entry} isYou={entry.student.id === userId} index={index} />)}
                  </ol>
                )}
                {pagination?.hasMore && (
                  <div className="flex justify-center"><Button variant="outline" loading={loadingMore} onClick={loadMore}>Show more students</Button></div>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      <HowPointsWork open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </PageContainer>
  );
}
