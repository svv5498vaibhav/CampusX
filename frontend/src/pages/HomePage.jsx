import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Newspaper, PartyPopper } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { CreatePost } from '@/components/feed/CreatePost';
import { FeedFilters } from '@/components/feed/FeedFilters';
import { FeedSidebar } from '@/components/feed/FeedSidebar';
import { PostCard } from '@/components/feed/PostCard';
import { PageContainer } from '@/components/layout/PageContainer';
import { ForYouFeed } from '@/components/recommendations/ForYouFeed';
import { RecommendationCard } from '@/components/recommendations/RecommendationCard';
import { RecommendationSection } from '@/components/recommendations/RecommendationSection';
import { Alert, Button, EmptyState, ErrorState, Loader } from '@/components/ui';
import { typeLabel } from '@/constants/posts';
import { RECOMMENDATION_META } from '@/constants/recommendations';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuthStore } from '@/store/authStore';
import { useFeedStore } from '@/store/feedStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useRecommendationStore } from '@/store/recommendationStore';
import { cn } from '@/utils/cn';

function emptyMessage(filter, options) {
  if (filter === 'all') return { title: 'Your campus feed is quiet', description: 'Be the first to share something: a project, a win, an event or a question for your campus.' };
  if (filter === 'branch') return { title: 'Nothing from your branch yet', description: 'Posts from students in your branch at your college will show up here.' };
  return { title: `No ${typeLabel(options, filter).toLowerCase()} posts yet`, description: 'When students share one, it will appear here.' };
}

const HOME_STRIP = 6;
const VIEWS = [
  { id: 'campus', label: 'Campus' },
  { id: 'for-you', label: 'For you' },
];

/**
 * The campus feed (/home). The filter and the view (Campus, the newest posts; For you, posts picked for the
 * student) live in the URL, so a refresh or a shared link keeps them. A short "Recommended for you" row
 * sits above the campus feed; Discover has the rest.
 */
export default function HomePage() {
  useDocumentTitle('Campus feed');
  const user = useAuthStore((state) => state.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get('filter') || 'all';
  const view = searchParams.get('view') === 'for-you' ? 'for-you' : 'campus';
  const recommended = useRecommendationStore((state) => state.personalized);

  const posts = useFeedStore((state) => state.posts);
  const loading = useFeedStore((state) => state.loading);
  const loadingMore = useFeedStore((state) => state.loadingMore);
  const error = useFeedStore((state) => state.error);
  const hasMore = useFeedStore((state) => state.hasMore);
  const options = useFeedStore((state) => state.options);
  const { fetchPosts, loadMore, loadOptions, forViewer } = useFeedStore.getState();

  // Shown once, right after onboarding. The flag lives in memory, so a reload won't repeat it.
  const [justOnboarded] = useState(() => useOnboardingStore.getState().justCompleted);
  useEffect(() => {
    useOnboardingStore.getState().clearJustCompleted();
  }, []);

  useEffect(() => {
    forViewer(user.id);
    loadOptions();
    useRecommendationStore.getState().forViewer(user.id);
    useRecommendationStore.getState().fetchRecommendations();
  }, [user.id]);

  useEffect(() => {
    fetchPosts(filter);
  }, [filter, user.id]);

  // Load the next page shortly before the end of the list comes into view.
  const sentinelRef = useRef(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return undefined;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && loadMore(), { rootMargin: '800px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, posts.length]);

  const chooseFilter = (next) => setSearchParams(next === 'all' ? {} : { filter: next }, { replace: true });
  const chooseView = (next) => setSearchParams(next === 'campus' ? {} : { view: next }, { replace: true });
  const empty = emptyMessage(filter, options);

  return (
    <PageContainer width="wide">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4">
          {justOnboarded && (
            <Alert variant="success" title="You're all set!">
              <span className="inline-flex items-center gap-1.5">
                Your campus identity is ready. Welcome in. <PartyPopper className="size-4" aria-hidden="true" />
              </span>
            </Alert>
          )}

          <header>
            <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Campus feed</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {user?.firstName ? `Hey ${user.firstName}, here's what's happening around campus.` : "Here's what's happening around campus."}
            </p>
          </header>

          <CreatePost />

          <div className="flex gap-1 self-start rounded-2xl border border-line bg-surface p-1" role="group" aria-label="Feed view">
            {VIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={view === item.id}
                onClick={() => chooseView(item.id)}
                className={cn('h-9 rounded-xl px-4 text-sm font-semibold transition-colors', view === item.id ? 'bg-primary text-primary-fg shadow-soft' : 'text-ink-muted hover:bg-surface-muted hover:text-ink')}
              >
                {item.label}
              </button>
            ))}
          </div>

          {view === 'for-you' ? (
            <ForYouFeed onShowCampus={() => chooseView('campus')} />
          ) : (
            <>
              <FeedFilters filters={options?.filters} value={filter} onChange={chooseFilter} />

              {filter === 'all' && recommended.length > 0 && (
                <RecommendationSection
                  title={RECOMMENDATION_META.forYou.title}
                  icon={RECOMMENDATION_META.forYou.icon}
                  items={recommended.slice(0, HOME_STRIP)}
                  seeAll={ROUTES.DISCOVER}
                  seeAllLabel="Discover more"
                  headingAs="h2"
                  className="glass-card rounded-3xl border border-line bg-surface-muted/40 p-4"
                  renderItem={(item) => <RecommendationCard item={item} />}
                />
              )}

              {error && posts.length > 0 && (
                <Alert variant="danger">
                  {error}{' '}
                  <button type="button" className="font-semibold underline" onClick={() => (hasMore ? loadMore() : fetchPosts(filter))}>
                    Try again
                  </button>
                </Alert>
              )}

              {posts.length === 0 && loading && <Loader centered label="Loading the campus feed" className="min-h-[30vh]" />}
              {posts.length === 0 && !loading && error && (
                <ErrorState title="We couldn't load the feed" description={error} onRetry={() => fetchPosts(filter)} />
              )}
              {posts.length === 0 && !loading && !error && (
                <EmptyState icon={Newspaper} title={empty.title} description={empty.description} className="rounded-3xl border border-dashed border-line-strong" />
              )}

              <ol className="flex flex-col gap-4" aria-label="Posts" aria-busy={loading || undefined}>
                <AnimatePresence initial={false}>
                  {posts.map((post) => (
                    <motion.li
                      key={post.id}
                      layout="position"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.18 } }}
                    >
                      <PostCard post={post} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ol>

              <div ref={sentinelRef} />
              {hasMore && posts.length > 0 && (
                <Button variant="outline" onClick={loadMore} loading={loadingMore} className="self-center">
                  Load more posts
                </Button>
              )}
              {!hasMore && posts.length > 0 && !loading && (
                <p className="py-4 text-center text-sm text-ink-subtle">You're all caught up.</p>
              )}
            </>
          )}
        </div>

        <aside aria-label="Campus highlights" className="hidden xl:block">
          <div className="sticky top-10">
            <FeedSidebar onShowOpportunities={() => chooseFilter('opportunity')} />
          </div>
        </aside>
      </div>
    </PageContainer>
  );
}
