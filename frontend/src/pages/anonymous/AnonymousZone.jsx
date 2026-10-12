import { useEffect, useRef, useState } from 'react';
import { MessagesSquare, PenLine, Search, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { AnonymousFilters } from '@/components/anonymous/AnonymousFilters';
import { AnonymousPostCard } from '@/components/anonymous/AnonymousPostCard';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button, EmptyState, ErrorState, Input, Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { DEFAULT_ANONYMOUS_FILTERS, useAnonymousStore } from '@/store/anonymousStore';
import { useAuthStore } from '@/store/authStore';

/** /anonymous: campus thoughts, questions and feedback, without anyone's identity. */
export default function AnonymousZone() {
  useDocumentTitle('Anonymous Zone');
  const userId = useAuthStore((state) => state.user?.id);
  const [filters, update] = useUrlFilters(DEFAULT_ANONYMOUS_FILTERS);
  const [draft, setDraft] = useState(filters.search);
  const options = useAnonymousStore((state) => state.options);
  const posts = useAnonymousStore((state) => state.posts);
  const pagination = useAnonymousStore((state) => state.pagination);
  const loading = useAnonymousStore((state) => state.loading);
  const loadingMore = useAnonymousStore((state) => state.loadingMore);
  const error = useAnonymousStore((state) => state.error);
  const { forViewer, loadOptions, fetchAnonymousPosts, loadMore } = useAnonymousStore.getState();
  const filtered = filters.category !== 'all' || Boolean(filters.search);

  useEffect(() => {
    forViewer(userId);
    loadOptions();
  }, [userId]);
  useEffect(() => {
    fetchAnonymousPosts(filters);
  }, [filters.category, filters.sort, filters.search, userId]);

  const timer = useRef(null);
  useEffect(() => setDraft(filters.search), [filters.search]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onSearch = (value) => {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => update({ search: value.trim() }), 300);
  };

  return (
    <PageContainer width="narrow">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Anonymous Zone</h1>
          <p className="mt-1 text-ink-muted">Speak freely about campus life. Your identity stays hidden.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button as={Link} to={ROUTES.ANONYMOUS_MINE} variant="outline" size="sm" leftIcon={UserRound}>My anonymous posts</Button>
          <Button as={Link} to={ROUTES.ANONYMOUS_NEW} size="sm" leftIcon={PenLine}>Share Anonymously</Button>
        </div>
      </header>

      <div className="mt-6 flex flex-col gap-4">
        <Input type="search" aria-label="Search anonymous posts" placeholder="Search titles and posts…" leftIcon={Search} value={draft} maxLength={80} onChange={(event) => onSearch(event.target.value)} />
        <AnonymousFilters options={options} category={filters.category} sort={filters.sort} onChange={update} />
      </div>

      <section className="mt-6" aria-label="Anonymous posts">
        {posts.length === 0 && loading && <Loader centered label="Loading posts" className="min-h-40" />}
        {posts.length === 0 && !loading && error && <ErrorState title="We couldn't load the Anonymous Zone" description={error} onRetry={() => fetchAnonymousPosts(filters)} />}
        {posts.length === 0 && !loading && !error && (
          <EmptyState
            icon={MessagesSquare}
            title={filtered ? 'Nothing matches yet' : 'Nothing shared yet'}
            description={filtered ? 'Try another category or search.' : 'Start the conversation: feedback, a question or a suggestion about campus life.'}
            action={<Button as={Link} to={ROUTES.ANONYMOUS_NEW} leftIcon={PenLine} variant="outline">Share Anonymously</Button>}
            className="rounded-3xl border border-dashed border-line-strong"
          />
        )}
        {posts.length > 0 && (
          <ul className="flex flex-col gap-4">
            {posts.map((post) => <li key={post.id}><AnonymousPostCard post={post} /></li>)}
          </ul>
        )}
        {pagination?.hasMore && (
          <div className="mt-6 flex justify-center"><Button variant="outline" loading={loadingMore} onClick={loadMore}>Load more</Button></div>
        )}
      </section>
    </PageContainer>
  );
}
