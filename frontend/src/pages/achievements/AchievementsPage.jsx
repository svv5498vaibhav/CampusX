import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Plus, Search, Trophy } from 'lucide-react';
import { Link } from 'react-router';
import { AchievementCard } from '@/components/achievements/AchievementCard';
import { FeedFilters } from '@/components/feed/FeedFilters';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button, EmptyState, ErrorState, Input, Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useAuthStore } from '@/store/authStore';
import { useAchievementStore } from '@/store/achievementStore';
import { cn } from '@/utils/cn';

/** Campus achievements (/achievements): filter by type, verified only, search. */
export default function AchievementsPage() {
  useDocumentTitle('Campus Achievements');
  const userId = useAuthStore((state) => state.user?.id);
  const [filters, update] = useUrlFilters({ type: 'all', verified: 'false', search: '' });
  const { type, search } = filters;
  const verified = filters.verified === 'true';
  const [draft, setDraft] = useState(search);
  const achievements = useAchievementStore((state) => state.achievements);
  const loading = useAchievementStore((state) => state.loading);
  const loadingMore = useAchievementStore((state) => state.loadingMore);
  const error = useAchievementStore((state) => state.error);
  const pagination = useAchievementStore((state) => state.pagination);
  const options = useAchievementStore((state) => state.options);
  const { forViewer, loadOptions, fetchAchievements, loadMore } = useAchievementStore.getState();

  useEffect(() => {
    forViewer(userId);
    loadOptions();
  }, [userId]);
  useEffect(() => {
    fetchAchievements({ type, verified, search });
  }, [type, verified, search, userId]);

  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <PageContainer width="wide">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Campus Achievements</h1>
          <p className="mt-1 text-sm text-ink-muted">Hackathon wins, certifications, awards and more from students on CampusX.</p>
        </div>
        <Button as={Link} to={ROUTES.ACHIEVEMENT_CREATE} leftIcon={Plus}>Add a win</Button>
      </header>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="search"
          aria-label="Search achievements"
          placeholder="Search by title, organization, event or skill"
          leftIcon={Search}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => update({ search: event.target.value.trim() }), 300);
          }}
          containerClassName="flex-1"
        />
        <button
          type="button"
          aria-pressed={verified}
          onClick={() => update({ verified: !verified })}
          className={cn('inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors', verified ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-line-strong text-ink-muted hover:text-ink')}
        >
          <BadgeCheck className="size-4" aria-hidden="true" /> Verified only
        </button>
      </div>
      <div className="mt-4">
        <FeedFilters filters={options?.filters} value={type} onChange={(next) => update({ type: next })} label="Filter achievements" />
      </div>

      <section className="mt-6" aria-label="Achievements">
        {achievements.length === 0 && loading && <Loader centered label="Loading achievements" className="min-h-40" />}
        {achievements.length === 0 && !loading && error && <ErrorState title="We couldn't load achievements" description={error} onRetry={() => fetchAchievements({ type, verified, search })} />}
        {achievements.length === 0 && !loading && !error && (
          <EmptyState
            icon={Trophy}
            title={verified ? 'No verified achievements here yet' : search ? 'No achievements match that search' : 'No achievements here yet'}
            description="Won something, finished a course or ran a workshop? Add it."
            action={<Button as={Link} to={ROUTES.ACHIEVEMENT_CREATE} leftIcon={Plus} variant="outline">Add a win</Button>}
            className="rounded-3xl border border-dashed border-line-strong"
          />
        )}
        {achievements.length > 0 && (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {achievements.map((achievement) => <li key={achievement.id}><AchievementCard achievement={achievement} /></li>)}
          </ul>
        )}
        {pagination?.hasMore && (
          <div className="mt-6 flex justify-center"><Button variant="outline" loading={loadingMore} onClick={loadMore}>Load more</Button></div>
        )}
      </section>
    </PageContainer>
  );
}
