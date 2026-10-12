import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { AchievementForm } from '@/components/achievements/AchievementForm';
import { PageContainer } from '@/components/layout/PageContainer';
import { Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { achievementPath } from '@/constants/showcase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAchievementStore } from '@/store/achievementStore';
import { toast } from '@/store/toastStore';

/** /achievements/create */
export default function CreateAchievementPage() {
  useDocumentTitle('Add a win');
  const navigate = useNavigate();
  const options = useAchievementStore((state) => state.options);
  const loadOptions = useAchievementStore((state) => state.loadOptions);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  return (
    <PageContainer width="narrow">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Add a win</h1>
        <p className="mt-1 text-sm text-ink-muted">Hackathons, competitions, certifications, awards: celebrate it. You can add proof for review next.</p>
      </header>
      {options ? (
        <AchievementForm
          onCancel={() => navigate(ROUTES.ACHIEVEMENTS)}
          onSaved={(achievement) => {
            toast.success('Achievement added!');
            navigate(achievementPath(achievement.id), { state: { justCreated: true } });
          }}
        />
      ) : (
        <Loader centered label="Loading" />
      )}
    </PageContainer>
  );
}
