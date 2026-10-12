import { useEffect } from 'react';
import { ArrowLeft, History } from 'lucide-react';
import { Link } from 'react-router';
import { PointActivity } from '@/components/gamification/PointActivity';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button, EmptyState, ErrorState, Loader } from '@/components/ui';
import { formatPoints } from '@/constants/gamification';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuthStore } from '@/store/authStore';
import { useGamificationStore } from '@/store/gamificationStore';

/** /gamification/activity: every point the student earned (or had taken back), newest first. */
export default function PointActivityPage() {
  useDocumentTitle('Points history');
  const userId = useAuthStore((state) => state.user?.id);
  const profile = useGamificationStore((state) => state.profile);
  const transactions = useGamificationStore((state) => state.transactions);
  const pagination = useGamificationStore((state) => state.transactionsPagination);
  const status = useGamificationStore((state) => state.transactionsStatus);
  const { forViewer, fetchProfile, fetchTransactions } = useGamificationStore.getState();

  useEffect(() => {
    forViewer(userId);
    fetchProfile();
    fetchTransactions();
  }, [userId]);

  return (
    <PageContainer width="narrow">
      <Button as={Link} to={ROUTES.RANKINGS} variant="ghost" size="sm" leftIcon={ArrowLeft} className="-ml-2 mb-3">Campus Rankings</Button>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Points history</h1>
          <p className="mt-1 text-ink-muted">Every XP you earned, and anything that stopped counting.</p>
        </div>
        {profile && <p className="font-display text-xl font-bold text-ink">{formatPoints(profile.totalPoints)} <span className="text-sm font-semibold text-ink-subtle">XP</span></p>}
      </header>

      <section className="mt-6" aria-label="Points history">
        {status === 'loading' && !transactions.length && <Loader centered label="Loading your points history" className="min-h-40" />}
        {status === 'error' && !transactions.length && <ErrorState title="We couldn't load your points history" onRetry={() => fetchTransactions()} />}
        {status === 'ready' && !transactions.length && (
          <EmptyState icon={History} title="No points yet" description="Complete your profile, share a post or join a community to earn your first XP." className="rounded-3xl border border-dashed border-line-strong" />
        )}
        {transactions.length > 0 && <PointActivity transactions={transactions} />}
        {pagination?.hasMore && (
          <div className="mt-4 flex justify-center"><Button variant="outline" loading={status === 'loading-more'} onClick={() => fetchTransactions({ more: true })}>Load more</Button></div>
        )}
      </section>
    </PageContainer>
  );
}
