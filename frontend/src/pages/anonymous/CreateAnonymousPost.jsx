import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { AnonymousPostForm } from '@/components/anonymous/AnonymousPostForm';
import { AnonymousSafetyNotice, useSafetyNotice } from '@/components/anonymous/AnonymousSafetyNotice';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button, ErrorState, Loader } from '@/components/ui';
import { anonymousPostPath } from '@/constants/anonymous';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAnonymousStore } from '@/store/anonymousStore';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';

/** /anonymous/new: the safety note on a student's first visit, then the form. */
export default function CreateAnonymousPost() {
  useDocumentTitle('Share anonymously');
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id);
  const options = useAnonymousStore((state) => state.options);
  const optionsStatus = useAnonymousStore((state) => state.optionsStatus);
  const { forViewer, loadOptions } = useAnonymousStore.getState();
  const { seen, acknowledge } = useSafetyNotice(userId);
  const [noticeOpen, setNoticeOpen] = useState(!seen);

  useEffect(() => {
    forViewer(userId);
    loadOptions();
  }, [userId]);

  const saved = (post) => {
    toast.success('Posted anonymously.');
    navigate(anonymousPostPath(post.id), { replace: true });
  };

  return (
    <PageContainer width="narrow">
      <Button as={Link} to={ROUTES.ANONYMOUS} variant="ghost" size="sm" leftIcon={ArrowLeft} className="-ml-2 mb-3">Anonymous Zone</Button>
      <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Share anonymously</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">Feedback, a question or a suggestion about campus life. Other students see “Anonymous Student”, never your name.</p>
      {optionsStatus === 'error' ? (
        <ErrorState title="We couldn't load the form" onRetry={loadOptions} />
      ) : !options ? (
        <Loader centered label="Loading" />
      ) : (
        !noticeOpen && <AnonymousPostForm onSaved={saved} onCancel={() => navigate(ROUTES.ANONYMOUS)} />
      )}
      <AnonymousSafetyNotice
        open={noticeOpen}
        onContinue={() => {
          acknowledge();
          setNoticeOpen(false);
        }}
        onCancel={() => navigate(ROUTES.ANONYMOUS)}
      />
    </PageContainer>
  );
}
