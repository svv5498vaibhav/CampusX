import { useEffect } from 'react';
import { ArrowLeft, Lock, SearchX } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { AnonymousPostForm } from '@/components/anonymous/AnonymousPostForm';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button, EmptyState, ErrorState, Loader } from '@/components/ui';
import { anonymousPostPath } from '@/constants/anonymous';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAnonymousStore } from '@/store/anonymousStore';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';

/** /anonymous/:postId/edit: the author changes the category, title or text (the API checks ownership). */
export default function EditAnonymousPost() {
  useDocumentTitle('Edit anonymous post');
  const { postId } = useParams();
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id);
  const options = useAnonymousStore((state) => state.options);
  const post = useAnonymousStore((state) => state.selectedPost);
  const status = useAnonymousStore((state) => state.selectedStatus);
  const error = useAnonymousStore((state) => state.selectedError);
  const { forViewer, loadOptions, fetchAnonymousPost } = useAnonymousStore.getState();
  const current = post?.id === postId && status === 'ready' ? post : null;

  useEffect(() => {
    forViewer(userId);
    loadOptions();
  }, [userId]);
  useEffect(() => {
    fetchAnonymousPost(postId);
  }, [postId, userId]);

  let body;
  if (status === 'not-found') body = <EmptyState icon={SearchX} title="Post not found." action={<Button as={Link} to={ROUTES.ANONYMOUS}>Back to the Anonymous Zone</Button>} />;
  else if (status === 'error') body = <ErrorState title="We couldn't load this post" description={error} onRetry={() => fetchAnonymousPost(postId)} />;
  else if (!current || !options) body = <Loader centered label="Loading" />;
  else if (!current.isOwner) body = <EmptyState icon={Lock} title="You can only edit your own anonymous posts" action={<Button as={Link} to={anonymousPostPath(postId)}>Back to the post</Button>} />;
  else {
    body = (
      <AnonymousPostForm
        key={current.id}
        post={current}
        onSaved={() => {
          toast.success('Post updated.');
          navigate(anonymousPostPath(postId), { replace: true });
        }}
        onCancel={() => navigate(anonymousPostPath(postId))}
      />
    );
  }

  return (
    <PageContainer width="narrow">
      <Button as={Link} to={anonymousPostPath(postId)} variant="ghost" size="sm" leftIcon={ArrowLeft} className="-ml-2 mb-3">Back to the post</Button>
      <h1 className="mb-6 font-display text-2xl font-bold text-ink sm:text-3xl">Edit anonymous post</h1>
      {body}
    </PageContainer>
  );
}
