import { useEffect } from 'react';
import { ArrowLeft, SearchX } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { PostCard } from '@/components/feed/PostCard';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button, EmptyState, ErrorState, Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuthStore } from '@/store/authStore';
import { useFeedStore } from '@/store/feedStore';
import { getFullName } from '@/utils/string';

/** One post with its comments open: where shared links land. */
export default function PostPage() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id);
  const post = useFeedStore((state) => state.selectedPost);
  const status = useFeedStore((state) => state.selectedStatus);
  const error = useFeedStore((state) => state.selectedError);
  const { fetchPost, loadOptions, forViewer } = useFeedStore.getState();
  useDocumentTitle(post ? `${getFullName(post.author)}'s post` : 'Post');

  useEffect(() => {
    forViewer(userId);
    loadOptions();
  }, [userId]);

  useEffect(() => {
    fetchPost(postId);
  }, [postId, userId]);

  const current = post?.id === postId ? post : null;

  return (
    <PageContainer width="narrow">
      <Button as={Link} to={ROUTES.HOME} variant="ghost" size="sm" leftIcon={ArrowLeft} className="-ml-2 mb-4">
        Back to feed
      </Button>

      {current ? (
        <PostCard post={current} defaultShowComments headingLevel="h1" onDeleted={() => navigate(ROUTES.HOME, { replace: true })} />
      ) : status === 'not-found' ? (
        <EmptyState
          icon={SearchX}
          titleAs="h1"
          title="Post not found."
          description="It may have been deleted, or it isn't shared with you."
          action={
            <Button as={Link} to={ROUTES.HOME}>
              Go to the campus feed
            </Button>
          }
        />
      ) : status === 'error' ? (
        <ErrorState title="We couldn't load this post" description={error} onRetry={() => fetchPost(postId)} />
      ) : (
        <Loader centered label="Loading post" />
      )}
    </PageContainer>
  );
}
