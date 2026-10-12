import { useEffect } from 'react';
import { Lock, SearchX } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { AchievementForm } from '@/components/achievements/AchievementForm';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button, EmptyState, ErrorState, Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { achievementPath } from '@/constants/showcase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuthStore } from '@/store/authStore';
import { useAchievementStore } from '@/store/achievementStore';
import { toast } from '@/store/toastStore';

/** /achievements/:achievementId/edit (owners only; the server checks again on save). */
export default function EditAchievementPage() {
  useDocumentTitle('Edit achievement');
  const { achievementId } = useParams();
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id);
  const achievement = useAchievementStore((state) => state.selectedAchievement);
  const status = useAchievementStore((state) => state.selectedStatus);
  const options = useAchievementStore((state) => state.options);
  const { forViewer, loadOptions, fetchAchievement } = useAchievementStore.getState();
  const current = achievement?.id === achievementId ? achievement : null;

  useEffect(() => {
    forViewer(userId);
    loadOptions();
    fetchAchievement(achievementId);
  }, [achievementId, userId]);

  if (!current || !options) {
    return (
      <PageContainer width="narrow">
        {status === 'not-found' ? (
          <EmptyState icon={SearchX} titleAs="h1" title="Achievement not found." action={<Button as={Link} to={ROUTES.ACHIEVEMENTS}>Browse achievements</Button>} />
        ) : status === 'error' ? (
          <ErrorState title="We couldn't load this achievement" onRetry={() => fetchAchievement(achievementId)} />
        ) : (
          <Loader centered label="Loading achievement" />
        )}
      </PageContainer>
    );
  }
  if (!current.isOwner) {
    return (
      <PageContainer width="narrow">
        <EmptyState icon={Lock} titleAs="h1" title="You can only edit your own achievements" action={<Button as={Link} to={achievementPath(current.id)}>Back to the achievement</Button>} />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Edit achievement</h1>
        <p className="mt-1 text-sm text-ink-muted">{current.title}</p>
      </header>
      <AchievementForm
        key={current.id}
        achievement={current}
        onCancel={() => navigate(achievementPath(current.id))}
        onSaved={(saved) => {
          toast.success('Achievement updated.');
          navigate(achievementPath(saved.id));
        }}
      />
    </PageContainer>
  );
}
