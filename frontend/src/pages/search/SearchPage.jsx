import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { PageContainer } from '@/components/layout/PageContainer';
import { RecentSearches } from '@/components/search/RecentSearches';
import { SearchEmptyState } from '@/components/search/SearchEmptyState';
import { SearchFilters } from '@/components/search/SearchFilters';
import { SearchInput } from '@/components/search/SearchInput';
import { SearchResultList, SearchResultSection } from '@/components/search/SearchResultSection';
import { SearchSkeleton } from '@/components/search/SearchSkeleton';
import { SEARCH_PANEL_ID, SearchTabs, searchTabId } from '@/components/search/SearchTabs';
import { Button } from '@/components/ui';
import { GLOBAL_SECTIONS, SEARCH_FILTER_KEYS, SEARCH_TYPE_META, SEARCH_TYPES, countLabel, searchResultPath } from '@/constants/search';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAnonymousStore } from '@/store/anonymousStore';
import { useAuthStore } from '@/store/authStore';
import { useFeedStore } from '@/store/feedStore';
import { normalizeSearch, searchKey, useSearchStore } from '@/store/searchStore';

const FILTER_PARAMS = [...new Set(Object.values(SEARCH_FILTER_KEYS).flat())];

/** /search?q=react&type=projects&sort=newest&page=2&category=web → the store's search. */
function fromUrl(params) {
  return normalizeSearch({
    query: params.get('q') ?? '',
    type: params.get('type') ?? SEARCH_TYPES.ALL,
    sort: params.get('sort') ?? '',
    page: params.get('page') ?? 1,
    filters: Object.fromEntries(FILTER_PARAMS.map((key) => [key, params.get(key) ?? ''])),
  });
}

function toUrl(search) {
  const params = new URLSearchParams();
  if (search.query) params.set('q', search.query);
  if (search.type !== SEARCH_TYPES.ALL) params.set('type', search.type);
  for (const [key, value] of Object.entries(search.filters)) params.set(key, value);
  if (search.sort !== 'relevance') params.set('sort', search.sort);
  if (search.page > 1) params.set('page', String(search.page));
  return params;
}

/** Previous / Next for one category's results. */
function Pagination({ pagination, onPage }) {
  const { page, limit, total, hasMore } = pagination;
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Search result pages" className="mt-8 flex items-center justify-between gap-3">
      <Button variant="outline" size="sm" leftIcon={ChevronLeft} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <p className="text-sm font-semibold text-ink-muted" aria-live="polite">
        Page {page} of {pages}
      </p>
      <Button variant="outline" size="sm" rightIcon={ChevronRight} disabled={!hasMore} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </nav>
  );
}

/**
 * /search: one place to find students, posts, projects, communities, opportunities and achievements.
 * The search lives in the URL (?q=…&type=…&filters…&sort=…&page=…), so links, refresh and the back button
 * all work. Results come from the server already filtered by what the student may see.
 */
export default function SearchPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const current = useSearchStore((state) => state.current);
  const results = useSearchStore((state) => state.results);
  const status = useSearchStore((state) => state.status);
  const error = useSearchStore((state) => state.error);
  const pagination = useSearchStore((state) => state.pagination);
  const counts = useSearchStore((state) => state.counts);
  const options = useSearchStore((state) => state.options);
  const { forViewer, loadOptions, search, setType, setFilters, clearFilters, setSort, setPage, retry } = useSearchStore.getState();
  const [text, setText] = useState(() => searchParams.get('q') ?? '');
  const written = useRef(null);
  const previous = useRef(null);
  const resultsTop = useRef(null);

  useDocumentTitle(current.query ? `Search: ${current.query}` : 'Search');

  useEffect(() => {
    forViewer(user?.id);
    loadOptions();
    // Labels for post cards in the results.
    useFeedStore.getState().loadOptions();
    useAnonymousStore.getState().loadOptions();
  }, [user?.id]);

  // URL → search: first load, the back/forward buttons, and searches started from the navigation bar.
  const urlKey = searchParams.toString();
  useEffect(() => {
    if (urlKey === written.current) return;
    const next = fromUrl(searchParams);
    setText(next.query);
    if (searchKey(next) !== searchKey(useSearchStore.getState().current) || useSearchStore.getState().status === 'idle') search(next);
  }, [urlKey]);

  // Search → URL. A new query or tab is a new history entry; filters, sort and pages replace it.
  // Reads the store (not this render's copy): the effect above may have just started a newer search.
  const currentKey = searchKey(current);
  useEffect(() => {
    const latest = useSearchStore.getState().current;
    const next = toUrl(latest).toString();
    const before = previous.current;
    previous.current = latest;
    if (next === urlKey) return;
    written.current = next;
    const isNewSearch = !before || before.query !== latest.query || before.type !== latest.type;
    setSearchParams(next, { replace: !isNewSearch });
  }, [currentKey]);

  // The box shows the query being searched (also when it came from a suggestion or the URL).
  useEffect(() => setText(current.query), [current.query]);

  const submit = (query) => search({ query, page: 1 });
  const selectItem = (item) => {
    if (item.kind === 'search') search({ query: item.query, type: item.type ?? SEARCH_TYPES.ALL, filters: {}, sort: 'relevance', page: 1 });
    else if (item.kind === 'recent') search({ query: item.query, page: 1 });
    else navigate(searchResultPath(item.kind, item));
  };
  const goToPage = (page) => {
    setPage(page);
    resultsTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const hasQuery = current.query.length >= 2;
  const isAll = current.type === SEARCH_TYPES.ALL;
  const tabCounts = counts?.query === current.query ? counts.counts : undefined;
  const loading = status === 'loading';
  const allEmpty = isAll && results?.counts && Object.values(results.counts).every((count) => count === 0);
  const items = !isAll ? (results?.results ?? []) : [];
  const hasFilters = Object.keys(current.filters).length > 0;

  return (
    <PageContainer width="wide">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Search CampusX</h1>
        <p className="mt-1 text-ink-muted">Students, posts, projects, communities, opportunities and wins from across campus.</p>
      </header>

      <SearchInput
        size="lg"
        value={text}
        onValueChange={setText}
        onSubmit={submit}
        onSelect={selectItem}
        placeholder="What are you looking for?"
        autoFocus={!current.query}
        // Without a search the page lists recent searches itself; a dropdown would cover them.
        showRecent={hasQuery}
        className="mt-6"
      />

      <div className="mt-5">
        <SearchTabs tabs={options?.types} value={current.type} onChange={setType} counts={tabCounts} />
      </div>

      <div ref={resultsTop} id={SEARCH_PANEL_ID} role="tabpanel" aria-labelledby={searchTabId(current.type)} className="mt-6 scroll-mt-24" aria-busy={loading || undefined}>
        {!hasQuery && (
          <div className="flex flex-col gap-8">
            <RecentSearches />
            <SearchEmptyState variant="start" />
          </div>
        )}

        {hasQuery && !isAll && (
          <div className="mb-5">
            <SearchFilters type={current.type} filters={current.filters} sort={current.sort} onChange={setFilters} onSortChange={setSort} onClear={clearFilters} />
          </div>
        )}

        {hasQuery && loading && <SearchSkeleton variant={current.type === 'posts' ? 'posts' : 'grid'} count={isAll ? 6 : 9} />}
        {hasQuery && !loading && status === 'error' && <SearchEmptyState variant="error" error={error} onRetry={retry} />}

        {hasQuery && !loading && status === 'ready' && isAll && results?.counts && (
          allEmpty ? (
            <SearchEmptyState variant="none" />
          ) : (
            <div className="flex flex-col gap-10">
              <p className="sr-only" role="status">
                Results for {current.query}: {GLOBAL_SECTIONS.map((type) => countLabel(type, results.counts[type] ?? 0)).join(', ')}
              </p>
              {GLOBAL_SECTIONS.map((type) => (
                <SearchResultSection key={type} type={type} items={results[type]} total={results.counts[type] ?? 0} onViewAll={() => setType(type)} />
              ))}
            </div>
          )
        )}

        {hasQuery && !loading && status === 'ready' && !isAll && results?.results && (
          items.length === 0 ? (
            <SearchEmptyState variant="none" hasFilters={hasFilters} onClearFilters={clearFilters} />
          ) : (
            <>
              <p className="mb-4 text-sm font-semibold text-ink-muted" role="status">
                {countLabel(current.type, pagination?.total ?? items.length)} for “{current.query}”
              </p>
              <SearchResultList type={current.type} items={items} headingLevel="h2" label={SEARCH_TYPE_META[current.type].label} />
              {pagination && <Pagination pagination={pagination} onPage={goToPage} />}
            </>
          )
        )}
      </div>
    </PageContainer>
  );
}
