import { useEffect } from 'react';
import { Bookmark, CalendarClock, Compass, ListChecks, Settings2, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { PageContainer } from '@/components/layout/PageContainer';
import { OpportunityCard } from '@/components/opportunities/OpportunityCard';
import { OpportunityFilters } from '@/components/opportunities/OpportunityFilters';
import { OpportunitySearch } from '@/components/opportunities/OpportunitySearch';
import { Button, EmptyState, ErrorState, Loader } from '@/components/ui';
import { ROLES } from '@/constants/auth';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useAuthStore } from '@/store/authStore';
import { DEFAULT_FILTERS, useOpportunityStore } from '@/store/opportunityStore';

const LIST_TITLES = {
  deadline: ['All opportunities', 'Open ones first, nearest deadline first.'],
  latest: ['Latest opportunities', 'Newest first.'],
  popular: ['Most viewed', 'What students are looking at.'],
};

function Section({ id, icon: Icon, title, description, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-10 scroll-mt-24">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-fg" aria-hidden="true">
          <Icon className="size-5" />
        </span>
        <div>
          <h2 id={`${id}-title`} className="font-display text-xl font-bold text-ink">{title}</h2>
          {description && <p className="text-sm text-ink-muted">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

const Grid = ({ items, showReason = false, label }) => (
  <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={label}>
    {items.map((opportunity) => (
      <li key={opportunity.id}>
        <OpportunityCard opportunity={opportunity} showReason={showReason} />
      </li>
    ))}
  </ul>
);

/** /opportunities: what's happening and what students can take part in. */
export default function Opportunities() {
  useDocumentTitle('Opportunities');
  const user = useAuthStore((state) => state.user);
  const [filters, update] = useUrlFilters(DEFAULT_FILTERS);
  const options = useOpportunityStore((state) => state.options);
  const opportunities = useOpportunityStore((state) => state.opportunities);
  const pagination = useOpportunityStore((state) => state.pagination);
  const loading = useOpportunityStore((state) => state.loading);
  const loadingMore = useOpportunityStore((state) => state.loadingMore);
  const error = useOpportunityStore((state) => state.error);
  const recommended = useOpportunityStore((state) => state.recommended);
  const recommendedStatus = useOpportunityStore((state) => state.recommendedStatus);
  const upcoming = useOpportunityStore((state) => state.upcoming);
  const upcomingStatus = useOpportunityStore((state) => state.upcomingStatus);
  const { forViewer, loadOptions, fetchOpportunities, fetchRecommended, fetchUpcoming, loadMore } = useOpportunityStore.getState();
  const isStaff = [ROLES.ADMIN, ROLES.MODERATOR].includes(user?.role);
  // While searching or filtering, the list is the answer; the personal sections step aside.
  const browsing = Object.keys(DEFAULT_FILTERS).some((key) => key !== 'sort' && String(filters[key]) !== String(DEFAULT_FILTERS[key]));
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    forViewer(user?.id);
    loadOptions();
    fetchRecommended();
    fetchUpcoming();
  }, [user?.id]);
  useEffect(() => {
    fetchOpportunities(filters);
  }, [filterKey, user?.id]);

  const [listTitle, listDescription] = browsing ? ['Results', null] : LIST_TITLES[filters.sort] ?? LIST_TITLES.deadline;

  return (
    <PageContainer width="wide">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Opportunities</h1>
          <p className="mt-1 text-ink-muted">Find something worth doing.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button as={Link} to={ROUTES.OPPORTUNITIES_SAVED} variant="outline" size="sm" leftIcon={Bookmark}>Saved</Button>
          <Button as={Link} to={ROUTES.OPPORTUNITIES_MY} variant="secondary" size="sm" leftIcon={ListChecks}>My Opportunities</Button>
          {isStaff && <Button as={Link} to={ROUTES.ADMIN_OPPORTUNITIES} variant="outline" size="sm" leftIcon={Settings2}>Manage</Button>}
        </div>
      </header>

      <div className="mt-6 flex flex-col gap-4">
        <OpportunitySearch value={filters.search} onSearch={(search) => update({ search })} />
        <OpportunityFilters filters={filters} onChange={update} options={options} />
      </div>

      {!browsing && (
        <>
          <Section id="recommended" icon={Sparkles} title="Recommended for you" description="Matched to your college, branch, semester, skills and interests.">
            {recommendedStatus === 'loading' && recommended.length === 0 && <Loader centered label="Finding opportunities for you" className="min-h-32" />}
            {recommendedStatus === 'error' && <p className="text-sm text-ink-muted">We couldn’t load recommendations right now.</p>}
            {recommendedStatus === 'ready' && recommended.length === 0 && (
              <EmptyState
                icon={Compass}
                title="No opportunities matched your profile yet."
                description="Add skills and interests to your profile, or look through everything that's open."
                action={<Button as="a" href="#all-opportunities" variant="outline">Explore all opportunities</Button>}
                className="rounded-3xl border border-dashed border-line-strong py-8"
              />
            )}
            {recommended.length > 0 && <Grid items={recommended} showReason label="Recommended for you" />}
          </Section>

          <Section id="upcoming" icon={CalendarClock} title="Upcoming deadlines" description="Closing in the next 30 days, nearest first.">
            {upcomingStatus === 'loading' && upcoming.length === 0 && <Loader centered label="Loading deadlines" className="min-h-32" />}
            {upcomingStatus === 'error' && <p className="text-sm text-ink-muted">We couldn’t load deadlines right now.</p>}
            {upcomingStatus === 'ready' && upcoming.length === 0 && <p className="rounded-2xl bg-surface-muted px-4 py-3 text-sm text-ink-muted">No deadlines in the next 30 days.</p>}
            {upcoming.length > 0 && <Grid items={upcoming} label="Upcoming deadlines" />}
          </Section>
        </>
      )}

      <Section id="all-opportunities" icon={Compass} title={listTitle} description={browsing && pagination ? `${pagination.total} ${pagination.total === 1 ? 'opportunity' : 'opportunities'} found` : listDescription}>
        {opportunities.length === 0 && loading && <Loader centered label="Loading opportunities" className="min-h-40" />}
        {opportunities.length === 0 && !loading && error && <ErrorState title="We couldn't load opportunities" description={error} onRetry={() => fetchOpportunities(filters)} />}
        {opportunities.length === 0 && !loading && !error && (
          <EmptyState
            icon={Compass}
            title={browsing ? 'Nothing matches those filters' : 'No opportunities yet'}
            description={browsing ? 'Try another type, fewer filters or a different search.' : 'New internships, hackathons, scholarships and campus events will show up here.'}
            action={browsing && <Button variant="outline" onClick={() => update(DEFAULT_FILTERS)}>Clear search and filters</Button>}
            className="rounded-3xl border border-dashed border-line-strong"
          />
        )}
        {opportunities.length > 0 && <Grid items={opportunities} label={listTitle} />}
        {pagination?.hasMore && (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" loading={loadingMore} onClick={loadMore}>Load more opportunities</Button>
          </div>
        )}
      </Section>
    </PageContainer>
  );
}
