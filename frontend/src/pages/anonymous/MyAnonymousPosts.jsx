import { useEffect } from 'react';
import { ArrowLeft, EyeOff, Info, PenLine } from 'lucide-react';
import { Link } from 'react-router';
import { AnonymousPostCard } from '@/components/anonymous/AnonymousPostCard';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button, EmptyState, ErrorState, Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAnonymousStore } from '@/store/anonymousStore';
import { useAuthStore } from '@/store/authStore';

/** What moderators have done with one of your posts, in calm words. Shown to you only. */
function moderationNote(post) {
  if (post.status === 'hidden') return 'Hidden by the CampusX team. Other students can’t see it.';
  if (post.moderationStatus === 'removed') return 'Removed by the CampusX team. Other students can’t see it.';
  if (post.moderationStatus === 'flagged') return 'Several students reported this post, so the CampusX team may review it. It is still visible.';
  return null;
}

/** /anonymous/mine: the student's own anonymous posts, to edit or delete. Only they see this list. */
export default function MyAnonymousPosts() {
  useDocumentTitle('My anonymous posts');
  const userId = useAuthStore((state) => state.user?.id);
  const posts = useAnonymousStore((state) => state.myPosts);
  const status = useAnonymousStore((state) => state.myStatus);
  const pagination = useAnonymousStore((state) => state.myPagination);
  const { forViewer, loadOptions, fetchMyAnonymousPosts } = useAnonymousStore.getState();

  useEffect(() => {
    forViewer(userId);
    loadOptions();
    fetchMyAnonymousPosts();
  }, [userId]);

  return (
    <PageContainer width="narrow">
      <Button as={Link} to={ROUTES.ANONYMOUS} variant="ghost" size="sm" leftIcon={ArrowLeft} className="-ml-2 mb-3">Anonymous Zone</Button>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">My anonymous posts</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted"><EyeOff className="size-4" aria-hidden="true" /> Only you can see this list. Other students never see these on your profile.</p>
        </div>
        <Button as={Link} to={ROUTES.ANONYMOUS_NEW} size="sm" leftIcon={PenLine}>Share Anonymously</Button>
      </header>

      <section className="mt-6" aria-label="Your anonymous posts">
        {posts.length === 0 && status === 'loading' && <Loader centered label="Loading your posts" className="min-h-40" />}
        {posts.length === 0 && status === 'error' && <ErrorState title="We couldn't load your posts" onRetry={() => fetchMyAnonymousPosts()} />}
        {posts.length === 0 && status === 'ready' && (
          <EmptyState icon={PenLine} title="You haven’t posted anonymously yet" action={<Button as={Link} to={ROUTES.ANONYMOUS_NEW} variant="outline">Share Anonymously</Button>} className="rounded-3xl border border-dashed border-line-strong" />
        )}
        {posts.length > 0 && (
          <ul className="flex flex-col gap-4">
            {posts.map((post) => {
              const note = moderationNote(post);
              return (
                <li key={post.id} className="flex flex-col gap-2">
                  {note && (
                    <p className="flex items-start gap-2 rounded-2xl bg-accent-soft px-3.5 py-2.5 text-sm text-accent-fg">
                      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {note}
                    </p>
                  )}
                  <AnonymousPostCard post={post} />
                </li>
              );
            })}
          </ul>
        )}
        {pagination?.hasMore && (
          <div className="mt-6 flex justify-center"><Button variant="outline" loading={status === 'loading-more'} onClick={() => fetchMyAnonymousPosts({ more: true })}>Load more</Button></div>
        )}
      </section>
    </PageContainer>
  );
}
