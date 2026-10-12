import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Bookmark, ListChecks, X } from 'lucide-react';
import { Link } from 'react-router';
import { PageContainer } from '@/components/layout/PageContainer';
import { OpportunityDeadline } from '@/components/opportunities/OpportunityDeadline';
import { TrackingBadge, TrackingStatusSelect } from '@/components/opportunities/OpportunityStatus';
import { OpportunityTypeIcon } from '@/components/opportunities/OpportunityTypeIcon';
import { Button, EmptyState, ErrorState, Loader, Modal } from '@/components/ui';
import { formatShortDay, opportunityPath, typeLabel } from '@/constants/opportunities';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useAuthStore } from '@/store/authStore';
import { useOpportunityStore } from '@/store/opportunityStore';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';

/** Status tabs: arrow keys move between them; the choice lives in the URL. */
function StatusTabs({ tabs, active, counts, onChange }) {
  const refs = useRef({});
  const onKeyDown = (event) => {
    const index = tabs.findIndex((tab) => tab.id === active);
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length].id;
    onChange(next);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label="Filter by status" className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0" onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        const count = counts?.[tab.id];
        return (
          <button
            key={tab.id}
            ref={(node) => { refs.current[tab.id] = node; }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls="my-opportunities-panel"
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn('relative isolate h-10 shrink-0 rounded-xl px-3.5 text-sm font-semibold transition-colors', selected ? 'text-primary-soft-fg' : 'text-ink-muted hover:text-ink')}
          >
            {selected && <motion.span layoutId="my-opportunities-tab" className="absolute inset-0 -z-10 rounded-xl bg-primary-soft" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
            {tab.label}
            {count !== undefined && <span className="ml-1.5 text-xs font-bold opacity-70">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function TrackedRow({ opportunity, onRemove }) {
  const options = useOpportunityStore((state) => state.options);
  const available = opportunity.available !== false;
  return (
    <li className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-4 shadow-soft sm:flex-row sm:items-center" data-opportunity-id={opportunity.id}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <OpportunityTypeIcon opportunity={opportunity} />
        <div className="min-w-0">
          <h2 className="font-display text-base leading-snug font-bold text-ink">
            {available ? <Link to={opportunityPath(opportunity.id)} className="hover:underline">{opportunity.title}</Link> : opportunity.title}
          </h2>
          <p className="truncate text-sm text-ink-muted">{opportunity.organizer} · {typeLabel(options, opportunity.type)}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <TrackingBadge status={opportunity.tracking?.status} />
            {available ? (
              <>
                {opportunity.applicationDeadline && <span>Deadline: {formatShortDay(opportunity.applicationDeadline)}</span>}
                <OpportunityDeadline opportunity={opportunity} />
              </>
            ) : (
              <span className="font-semibold">No longer listed on CampusX</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 sm:shrink-0">
        <TrackingStatusSelect opportunity={opportunity} compact label="Change status" />
        <Button variant="ghost" size="icon" className="size-9" onClick={() => onRemove(opportunity)} aria-label={`Remove ${opportunity.title} from My Opportunities`}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

/** /opportunities/my: everything the student is tracking, by their own status. */
export default function MyOpportunities() {
  useDocumentTitle('My Opportunities');
  const userId = useAuthStore((state) => state.user?.id);
  const [{ tab }, update] = useUrlFilters({ tab: 'all' });
  const options = useOpportunityStore((state) => state.options);
  const items = useOpportunityStore((state) => state.myOpportunities);
  const counts = useOpportunityStore((state) => state.myCounts);
  const status = useOpportunityStore((state) => state.myStatus);
  const pagination = useOpportunityStore((state) => state.myPagination);
  const busy = useOpportunityStore((state) => state.busy);
  const { forViewer, loadOptions, fetchMyOpportunities, loadMoreMine, removeTracking } = useOpportunityStore.getState();
  const [removing, setRemoving] = useState(null);
  const tabs = [{ id: 'all', label: 'All' }, ...(options?.trackingStatuses ?? [])];
  const activeTab = tabs.some((item) => item.id === tab) ? tab : 'all';

  useEffect(() => {
    forViewer(userId);
    loadOptions();
  }, [userId]);
  useEffect(() => {
    fetchMyOpportunities(activeTab);
  }, [activeTab, userId]);

  const remove = async () => {
    try {
      await removeTracking(removing.id);
      toast.info('Removed from My Opportunities.');
      setRemoving(null);
    } catch (error) {
      toast.error(error.message);
    }
  };
  const tabLabel = tabs.find((item) => item.id === activeTab)?.label ?? 'All';

  return (
    <PageContainer width="default">
      <Button as={Link} to={ROUTES.OPPORTUNITIES} variant="ghost" size="sm" leftIcon={ArrowLeft} className="-ml-2 mb-3">Opportunities</Button>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">My Opportunities</h1>
          <p className="mt-1 text-sm text-ink-muted">Track what you’ve saved and applied to. Only you can see this, and you set every status yourself.</p>
        </div>
        <Button as={Link} to={ROUTES.OPPORTUNITIES_SAVED} variant="outline" size="sm" leftIcon={Bookmark}>Saved</Button>
      </header>

      <div className="mt-6">
        <StatusTabs tabs={tabs} active={activeTab} counts={counts} onChange={(next) => update({ tab: next })} />
      </div>

      <section id="my-opportunities-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="mt-5">
        {items.length === 0 && status === 'loading' && <Loader centered label="Loading your opportunities" className="min-h-40" />}
        {items.length === 0 && status === 'error' && <ErrorState title="We couldn't load your opportunities" onRetry={() => fetchMyOpportunities(activeTab)} />}
        {items.length === 0 && status === 'ready' && (
          <EmptyState
            icon={ListChecks}
            title={activeTab === 'all' ? 'Nothing tracked yet' : `Nothing marked “${tabLabel}”`}
            description="Save opportunities you like, then mark them interested or applied to keep track here."
            action={<Button as={Link} to={ROUTES.OPPORTUNITIES}>Explore opportunities</Button>}
            className="rounded-3xl border border-dashed border-line-strong"
          />
        )}
        {items.length > 0 && (
          <ul className="flex flex-col gap-3" aria-label={`${tabLabel} opportunities`}>
            {items.map((item) => <TrackedRow key={item.id} opportunity={item} onRemove={setRemoving} />)}
          </ul>
        )}
        {pagination?.hasMore && (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" loading={status === 'loading-more'} onClick={loadMoreMine}>Load more</Button>
          </div>
        )}
      </section>

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove from My Opportunities?"
        description={removing ? `Your status and notes for “${removing.title}” will be deleted.` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRemoving(null)}>Keep it</Button>
            <Button variant="danger" onClick={remove} loading={Boolean(removing && busy[removing.id])}>Remove</Button>
          </>
        }
      />
    </PageContainer>
  );
}
