import { useEffect } from 'react';
import { ArrowLeft, Award } from 'lucide-react';
import { Link } from 'react-router';
import { BadgeGrid } from '@/components/gamification/BadgeCard';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button, EmptyState, ErrorState, Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuthStore } from '@/store/authStore';
import { useGamificationStore } from '@/store/gamificationStore';

/** /badges: earned and locked badges, with what each takes. */
export default function BadgesPage() {
  useDocumentTitle('Badges');
  const userId = useAuthStore((state) => state.user?.id);
  const badges = useGamificationStore((state) => state.badges);
  const summary = useGamificationStore((state) => state.badgeSummary);
  const status = useGamificationStore((state) => state.badgesStatus);
  const { forViewer, fetchBadges } = useGamificationStore.getState();

  useEffect(() => {
    forViewer(userId);
    fetchBadges();
  }, [userId]);

  const earned = badges.filter((badge) => badge.earned).sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt));
  const locked = badges.filter((badge) => !badge.earned);

  return (
    <PageContainer width="wide">
      <Button as={Link} to={ROUTES.RANKINGS} variant="ghost" size="sm" leftIcon={ArrowLeft} className="-ml-2 mb-3">Campus Rankings</Button>
      <header>
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Badges</h1>
        <p className="mt-1 text-ink-muted">{summary ? `${summary.earnedCount} of ${summary.total} earned. Each one marks a step in your campus journey.` : 'Each one marks a step in your campus journey.'}</p>
      </header>

      {status === 'loading' && !badges.length && <Loader centered label="Loading badges" className="min-h-40" />}
      {status === 'error' && !badges.length && <ErrorState title="We couldn't load your badges" onRetry={fetchBadges} />}
      {badges.length > 0 && (
        <>
          <section className="mt-6" aria-labelledby="earned-title">
            <h2 id="earned-title" className="mb-3 font-display text-lg font-bold text-ink">Earned</h2>
            {earned.length ? (
              <BadgeGrid badges={earned} label="Earned badges" />
            ) : (
              <EmptyState icon={Award} title="No badges yet" description="Your first one is a step away: complete your profile or share a post." className="rounded-3xl border border-dashed border-line-strong py-8" />
            )}
          </section>
          {locked.length > 0 && (
            <section className="mt-8" aria-labelledby="locked-title">
              <h2 id="locked-title" className="mb-3 font-display text-lg font-bold text-ink">Locked</h2>
              <BadgeGrid badges={locked} label="Locked badges" />
            </section>
          )}
        </>
      )}
    </PageContainer>
  );
}
