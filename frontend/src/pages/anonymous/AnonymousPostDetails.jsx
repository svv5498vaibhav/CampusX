import { useEffect } from 'react';
import { ArrowLeft, SearchX } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { AnonymousComments } from '@/components/anonymous/AnonymousComment';
import { AnonymousPostCard } from '@/components/anonymous/AnonymousPostCard';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button, EmptyState, ErrorState, Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAnonymousStore } from '@/store/anonymousStore';
import { useAuthStore } from '@/store/authStore';

/** /anonymous/:postId: one anonymous post and its comments, with the same anonymity rules. */
export default function AnonymousPostDetails() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id);
  const post = useAnonymousStore((state) => state.selectedPost);
  const status = useAnonymousStore((state) => state.selectedStatus);
  const error = useAnonymousStore((state) => state.selectedError);
  const { forViewer, loadOptions, fetchAnonymousPost } = useAnonymousStore.getState();
  const current = post?.id === postId ? post : null;
  useDocumentTitle(current?.title ?? 'Anonymous post');

  useEffect(() => {
    forViewer(userId);
    loadOptions();
  }, [userId]);
  useEffect(() => {
    fetchAnonymousPost(postId);
  }, [postId, userId]);

  return (
    <PageContainer width="narrow">
      <Button as={Link} to={ROUTES.ANONYMOUS} variant="ghost" size="sm" leftIcon={ArrowLeft} className="-ml-2 mb-3">Anonymous Zone</Button>
      {current ? (
        <div className="flex flex-col gap-4">
          <AnonymousPostCard post={current} detail headingLevel="h1" onDeleted={() => navigate(ROUTES.ANONYMOUS, { replace: true })} />
          <AnonymousComments post={current} />
        </div>
      ) : status === 'not-found' ? (
        <EmptyState icon={SearchX} titleAs="h1" title="Post not found." description="It may have been deleted, or it isn't shared with you." action={<Button as={Link} to={ROUTES.ANONYMOUS}>Back to the Anonymous Zone</Button>} />
      ) : status === 'error' ? (
        <ErrorState title="We couldn't load this post" description={error} onRetry={() => fetchAnonymousPost(postId)} />
      ) : (
        <Loader centered label="Loading post" />
      )}
    </PageContainer>
  );
}
