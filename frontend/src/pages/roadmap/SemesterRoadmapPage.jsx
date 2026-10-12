import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Archive, Info, MapPin, UserRoundPen } from 'lucide-react';
import { Link } from 'react-router';
import { PageContainer } from '@/components/layout/PageContainer';
import { CareerGoalPicker } from '@/components/roadmap/CareerGoalPicker';
import { NextTaskCard } from '@/components/roadmap/NextTaskCard';
import { RoadmapHero } from '@/components/roadmap/RoadmapHero';
import { SemesterPanel } from '@/components/roadmap/SemesterPanel';
import { SemesterTimeline } from '@/components/roadmap/SemesterTimeline';
import { SkillMastery } from '@/components/roadmap/SkillMastery';
import { Button, EmptyState, ErrorState } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useAuthStore } from '@/store/authStore';
import { useGamificationStore } from '@/store/gamificationStore';
import { useRoadmapStore } from '@/store/roadmapStore';

const SAVE_SELECTION_MS = 800;

function RoadmapSkeleton() {
  return (
    <div role="status" aria-label="Loading your roadmap" className="flex animate-pulse flex-col gap-6">
      <div className="h-72 rounded-[2rem] bg-surface-muted" />
      <div className="h-24 rounded-3xl bg-surface-muted" />
      <div className="grid grid-cols-8 gap-2">
        {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-24 rounded-2xl bg-surface-muted" />)}
      </div>
      <div className="h-64 rounded-3xl bg-surface-muted" />
    </div>
  );
}

/**
 * /profile/roadmap: the signed-in student's Semester Roadmap. Every number comes from the server; the page
 * keeps only which semester is open (in the URL, and saved quietly so the roadmap reopens there).
 */
export default function SemesterRoadmapPage() {
  useDocumentTitle('Semester Roadmap');
  const userId = useAuthStore((state) => state.user?.id);
  const roadmap = useRoadmapStore((state) => state.roadmap);
  const status = useRoadmapStore((state) => state.status);
  const error = useRoadmapStore((state) => state.error);
  const errorStatus = useRoadmapStore((state) => state.errorStatus);
  const pending = useRoadmapStore((state) => state.pending);
  const lastChange = useRoadmapStore((state) => state.lastChange);
  const celebration = useRoadmapStore((state) => state.celebration);
  const savingGoal = useRoadmapStore((state) => state.savingGoal);
  const templates = useRoadmapStore((state) => state.templates);
  const streak = useGamificationStore((state) => state.profile?.streak?.current ?? 0);
  const { fetchRoadmap, setMilestoneStatus, changeGoal, dismissCelebration, loadTemplates } = useRoadmapStore.getState();

  const [{ semester: semesterParam }, updateUrl] = useUrlFilters({ semester: '' });
  const [goalPickerOpen, setGoalPickerOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState(null);
  const previousSelected = useRef(null);
  const saveTimer = useRef(null);
  const unsavedSelection = useRef(null);

  useEffect(() => {
    useRoadmapStore.getState().forViewer(userId);
    fetchRoadmap();
    useGamificationStore.getState().forViewer(userId);
    useGamificationStore.getState().fetchProfile();
  }, [userId]);

  // A selection made just before leaving is still remembered.
  useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
      if (unsavedSelection.current) useRoadmapStore.getState().saveSelectedSemester(unsavedSelection.current);
    },
    [],
  );

  const total = roadmap?.student.totalSemesters ?? 8;
  const fromUrl = Number(semesterParam);
  const selected = roadmap ? (Number.isInteger(fromUrl) && fromUrl >= 1 && fromUrl <= total ? fromUrl : (roadmap.selectedSemester ?? roadmap.student.currentSemester)) : null;
  // Forward slides in from the right, backward from the left.
  const direction = previousSelected.current && selected < previousSelected.current ? -1 : 1;
  useEffect(() => {
    previousSelected.current = selected;
  }, [selected]);

  const select = useCallback(
    (semester) => {
      if (!semester || semester === selected) return;
      updateUrl({ semester });
      clearTimeout(saveTimer.current);
      unsavedSelection.current = semester;
      saveTimer.current = setTimeout(() => {
        useRoadmapStore.getState().saveSelectedSemester(semester);
        unsavedSelection.current = null;
      }, SAVE_SELECTION_MS);
    },
    [selected, updateUrl],
  );

  const openMilestone = (milestone) => {
    select(milestone.semester);
    setFocusRequest({ id: milestone.id, at: Date.now() });
  };

  const changedMilestone = lastChange && roadmap?.semesters.flatMap((semester) => semester.milestones).find((milestone) => milestone.id === lastChange.id);
  const announcement = changedMilestone ? `${changedMilestone.title}: ${{ completed: 'completed', 'in-progress': 'in progress', 'not-started': 'not started' }[lastChange.status]}. Overall ${roadmap.overall.percentage}% complete.` : '';

  return (
    <PageContainer width="wide">
      <Link to={ROUTES.PROFILE} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-primary">
        <ArrowLeft className="size-4" aria-hidden="true" /> My profile
      </Link>

      {!roadmap && status !== 'error' && <RoadmapSkeleton />}
      {!roadmap && status === 'error' && (errorStatus === 409 ? (
        <EmptyState
          icon={UserRoundPen}
          title="Add your campus details first"
          description={error}
          action={<Button as={Link} to={ROUTES.PROFILE_EDIT}>Edit profile</Button>}
          className="rounded-3xl border border-dashed border-line-strong"
        />
      ) : (
        <ErrorState title="We couldn't load your roadmap" description={error} onRetry={fetchRoadmap} />
      ))}

      {roadmap && (
        <div className="flex flex-col gap-6">
          <RoadmapHero
            roadmap={roadmap}
            streak={streak}
            onChangeGoal={() => {
              loadTemplates();
              setGoalPickerOpen(true);
            }}
          />

          <NextTaskCard next={roadmap.nextMilestone} pending={roadmap.nextMilestone && pending[roadmap.nextMilestone.id]} onOpen={openMilestone} onSetStatus={setMilestoneStatus} />

          <section aria-labelledby="roadmap-journey-heading" className="min-w-0">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <h2 id="roadmap-journey-heading" className="font-display text-xl font-bold text-ink">Your semester journey</h2>
              {selected !== roadmap.student.currentSemester && (
                <Button variant="ghost" size="sm" leftIcon={MapPin} onClick={() => select(roadmap.student.currentSemester)}>
                  Back to Semester {roadmap.student.currentSemester}
                </Button>
              )}
            </div>
            <SemesterTimeline semesters={roadmap.semesters} selected={selected} onSelect={select} />
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <SemesterPanel
              semester={roadmap.semesters[selected - 1]}
              direction={direction}
              totalSemesters={total}
              pending={pending}
              lastChange={lastChange}
              focusRequest={focusRequest}
              celebration={celebration}
              onSetStatus={setMilestoneStatus}
              onSelect={select}
              onDismissCelebration={dismissCelebration}
            />
            <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-8" aria-label="Roadmap insights">
              {roadmap.skills.length > 0 && <SkillMastery skills={roadmap.skills} />}
              {roadmap.savedElsewhere > 0 && (
                <p className="flex items-start gap-2 rounded-3xl border border-line bg-surface p-4 text-sm text-ink-muted">
                  <Archive className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  {roadmap.savedElsewhere} completed {roadmap.savedElsewhere === 1 ? 'milestone is' : 'milestones are'} saved from another goal. {roadmap.savedElsewhere === 1 ? 'It counts' : 'They count'} again if you switch back.
                </p>
              )}
              <p className="flex items-start gap-2 rounded-3xl bg-surface-muted p-4 text-xs leading-relaxed text-ink-muted">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {roadmap.template.note} Follow your college’s curriculum for exams and credits.
              </p>
            </aside>
          </div>
        </div>
      )}

      <p className="sr-only" aria-live="polite">{announcement}</p>

      {roadmap && (
        <CareerGoalPicker
          open={goalPickerOpen}
          onClose={() => setGoalPickerOpen(false)}
          goals={roadmap.goals}
          currentGoal={roadmap.careerGoal.id}
          templates={templates}
          saving={savingGoal}
          onConfirm={async (goal) => {
            if (await changeGoal(goal)) setGoalPickerOpen(false);
          }}
        />
      )}
    </PageContainer>
  );
}
