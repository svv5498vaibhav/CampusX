import { useEffect, useRef, useState } from 'react';
import { Plus, Search, UsersRound } from 'lucide-react';
import { CommunityCard } from '@/components/communities/CommunityCard';
import { CreateCommunityModal } from '@/components/communities/CreateCommunityModal';
import { FeedFilters } from '@/components/feed/FeedFilters';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button, EmptyState, ErrorState, Input, Loader } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';

const SEARCH_DELAY_MS = 300;

function CardGrid({ communities, reasons = false, label }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={label}>
      {communities.map((community) => (
        <li key={community.id}>
          <CommunityCard community={community} reason={reasons ? community.reason : undefined} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Community discovery (/communities): search, filters, the student's own communities, rule-based
 * suggestions and everything open to them. Filter, sort and search live in the URL.
 */
export default function CommunitiesPage() {
  useDocumentTitle('Communities');
  const userId = useAuthStore((state) => state.user?.id);
  const [{ filter, sort, search }, updateParams] = useUrlFilters({ filter: 'all', sort: 'popular', search: '' });
  const [draft, setDraft] = useState(search);
  const [creating, setCreating] = useState(false);

  const communities = useCommunityStore((state) => state.communities);
  const loading = useCommunityStore((state) => state.loading);
  const loadingMore = useCommunityStore((state) => state.loadingMore);
  const error = useCommunityStore((state) => state.error);
  const pagination = useCommunityStore((state) => state.pagination);
  const myCommunities = useCommunityStore((state) => state.myCommunities);
  const recommended = useCommunityStore((state) => state.recommendedCommunities);
  const options = useCommunityStore((state) => state.options);
  const { forViewer, loadOptions, fetchCommunities, fetchMyCommunities, fetchRecommended, loadMore } = useCommunityStore.getState();

  useEffect(() => {
    forViewer(userId);
    loadOptions();
    fetchMyCommunities();
    fetchRecommended();
  }, [userId]);

  useEffect(() => {
    fetchCommunities({ filter, sort, search });
  }, [filter, sort, search, userId]);

  // Search as you type (debounced); the URL keeps the last search.
  const timer = useRef(null);
  const onSearch = (value) => {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => updateParams({ search: value.trim() }), SEARCH_DELAY_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);


  const browsing = filter === 'all' && !search;
  // While browsing, Explore skips what's already shown above (your communities and suggestions).
  const shownAbove = new Set(browsing ? recommended.map((item) => item.id) : []);
  const openToMe = browsing
    ? communities.filter((item) => item.membership?.status !== 'active' && !shownAbove.has(item.id))
    : communities;

  return (
    <PageContainer width="wide">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Communities</h1>
          <p className="mt-1 text-sm text-ink-muted">Find your campus people: your branch, your clubs, your interests.</p>
        </div>
        <Button leftIcon={Plus} onClick={() => setCreating(true)}>
          Create community
        </Button>
      </header>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="search"
          aria-label="Search communities"
          placeholder="Search communities, tags, topics..."
          leftIcon={Search}
          value={draft}
          onChange={(event) => onSearch(event.target.value)}
          containerClassName="flex-1"
        />
        <label className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
          Sort
          <select
            value={sort}
            onChange={(event) => updateParams({ sort: event.target.value })}
            className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold text-ink focus:border-primary focus:ring-4 focus:ring-focus focus:outline-none"
          >
            {(options?.sorts ?? [{ id: 'popular', label: 'Popular' }, { id: 'new', label: 'New' }]).map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <FeedFilters filters={options?.filters} value={filter} onChange={(next) => updateParams({ filter: next })} label="Filter communities" />
      </div>

      {browsing && myCommunities.length > 0 && (
        <section className="mt-8" aria-labelledby="my-communities">
          <h2 id="my-communities" className="mb-3 font-display text-lg font-bold text-ink">My Communities</h2>
          <CardGrid communities={myCommunities.slice(0, 6)} label="My Communities" />
          {myCommunities.length > 6 && (
            <Button variant="ghost" className="mt-2" onClick={() => updateParams({ filter: 'mine' })}>
              See all {myCommunities.length}
            </Button>
          )}
        </section>
      )}

      {browsing && recommended.length > 0 && (
        <section className="mt-8" aria-labelledby="recommended-communities">
          <h2 id="recommended-communities" className="font-display text-lg font-bold text-ink">Recommended for you</h2>
          <p className="mb-3 text-sm text-ink-muted">Based on your campus, branch and interests.</p>
          <CardGrid communities={recommended} reasons label="Recommended communities" />
        </section>
      )}

      <section className="mt-8" aria-labelledby="explore-communities">
        <h2 id="explore-communities" className="mb-3 font-display text-lg font-bold text-ink">
          {search ? `Results for “${search}”` : browsing ? 'Explore' : (options?.filters.find((item) => item.id === filter)?.label ?? 'Communities')}
        </h2>
        {openToMe.length === 0 && loading && <Loader centered label="Loading communities" className="min-h-40" />}
        {openToMe.length === 0 && !loading && error && <ErrorState title="We couldn't load communities" description={error} onRetry={() => fetchCommunities({ filter, sort, search })} />}
        {openToMe.length === 0 && !loading && !error && browsing && recommended.length > 0 && (
          <p className="text-sm text-ink-muted">That's everything open to you right now. Start a community for your club or project.</p>
        )}
        {openToMe.length === 0 && !loading && !error && !(browsing && recommended.length > 0) && (
          <EmptyState
            icon={UsersRound}
            title={filter === 'mine' ? "You haven't joined any communities yet" : search ? 'No communities match that search' : 'Nothing here yet'}
            description={filter === 'mine' ? 'Join your branch community to get started, or create one for your club.' : 'Try another search or filter, or start a community yourself.'}
            action={<Button leftIcon={Plus} variant="outline" onClick={() => setCreating(true)}>Create community</Button>}
            className="rounded-3xl border border-dashed border-line-strong"
          />
        )}
        {openToMe.length > 0 && <CardGrid communities={openToMe} label="Communities" />}
        {pagination?.hasMore && (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" loading={loadingMore} onClick={loadMore}>Load more communities</Button>
          </div>
        )}
      </section>

      <CreateCommunityModal open={creating} onClose={() => setCreating(false)} />
    </PageContainer>
  );
}
