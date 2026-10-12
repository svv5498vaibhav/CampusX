import { useEffect } from 'react';
import { ArrowLeft, Bookmark, ListChecks } from 'lucide-react';
import { Link } from 'react-router';
import { PageContainer } from '@/components/layout/PageContainer';
import { OpportunityCard } from '@/components/opportunities/OpportunityCard';
import { Button, EmptyState, ErrorState, Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuthStore } from '@/store/authStore';
import { useOpportunityStore } from '@/store/opportunityStore';

/**
 * /opportunities/saved: opportunities the student saved and hasn't acted on yet. Once they mark one
 * interested or applied it moves on to My Opportunities.
 */
export default function SavedOpportunities() {
  useDocumentTitle('Saved opportunities');
  const userId = useAuthStore((state) => state.user?.id);
  const saved = useOpportunityStore((state) => state.saved);
  const status = useOpportunityStore((state) => state.savedStatus);
  const { forViewer, loadOptions, fetchSaved } = useOpportunityStore.getState();

  useEffect(() => {
    forViewer(userId);
    loadOptions();
    fetchSaved();
  }, [userId]);

  const listed = saved.filter((item) => item.available !== false);
  const unlisted = saved.filter((item) => item.available === false);

  return (
    <PageContainer width="wide">
      <Button as={Link} to={ROUTES.OPPORTUNITIES} variant="ghost" size="sm" leftIcon={ArrowLeft} className="-ml-2 mb-3">Opportunities</Button>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Saved opportunities</h1>
          <p className="mt-1 text-sm text-ink-muted">Things you’ve saved for later. Mark one interested or applied to track it in My Opportunities.</p>
        </div>
        <Button as={Link} to={ROUTES.OPPORTUNITIES_MY} variant="secondary" size="sm" leftIcon={ListChecks}>My Opportunities</Button>
      </header>

      <section className="mt-6" aria-label="Saved opportunities">
        {saved.length === 0 && status === 'loading' && <Loader centered label="Loading saved opportunities" className="min-h-40" />}
        {saved.length === 0 && status === 'error' && <ErrorState title="We couldn't load your saved opportunities" onRetry={fetchSaved} />}
        {saved.length === 0 && status === 'ready' && (
          <EmptyState
            icon={Bookmark}
            title="Nothing saved yet"
            description="Tap Save on any opportunity to keep it here."
            action={<Button as={Link} to={ROUTES.OPPORTUNITIES}>Explore opportunities</Button>}
            className="rounded-3xl border border-dashed border-line-strong"
          />
        )}
        {listed.length > 0 && (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {listed.map((opportunity) => <li key={opportunity.id}><OpportunityCard opportunity={opportunity} headingLevel="h2" /></li>)}
          </ul>
        )}
        {unlisted.length > 0 && (
          <p className="mt-6 rounded-2xl bg-surface-muted px-4 py-3 text-sm text-ink-muted">
            {unlisted.length === 1 ? '1 saved opportunity is' : `${unlisted.length} saved opportunities are`} no longer listed. You can remove {unlisted.length === 1 ? 'it' : 'them'} in <Link to={`${ROUTES.OPPORTUNITIES_MY}?tab=saved`} className="font-semibold text-primary hover:underline">My Opportunities</Link>.
          </p>
        )}
      </section>
    </PageContainer>
  );
}
