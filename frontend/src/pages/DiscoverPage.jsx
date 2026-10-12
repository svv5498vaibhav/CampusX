import { useEffect } from 'react';
import { RefreshCw, Sparkles, Telescope } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { PageContainer } from '@/components/layout/PageContainer';
import { RecommendationCard } from '@/components/recommendations/RecommendationCard';
import { RecommendationSection } from '@/components/recommendations/RecommendationSection';
import { RecommendationSkeleton } from '@/components/recommendations/RecommendationSkeleton';
import { RecommendedAchievementCard } from '@/components/recommendations/RecommendedAchievementCard';
import { RecommendedCommunityCard } from '@/components/recommendations/RecommendedCommunityCard';
import { RecommendedOpportunityCard } from '@/components/recommendations/RecommendedOpportunityCard';
import { RecommendedPostCard } from '@/components/recommendations/RecommendedPostCard';
import { RecommendedProjectCard } from '@/components/recommendations/RecommendedProjectCard';
import { RecommendedStudentCard } from '@/components/recommendations/RecommendedStudentCard';
import { TrendingSection } from '@/components/recommendations/TrendingSection';
import { Alert, Button, Card, EmptyState, ErrorState } from '@/components/ui';
import { DISCOVER_SECTIONS, RECOMMENDATION_META } from '@/constants/recommendations';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuthStore } from '@/store/authStore';
import { useRecommendationStore } from '@/store/recommendationStore';
import { useSearchStore } from '@/store/searchStore';
import { cn } from '@/utils/cn';

const CARDS = {
  opportunities: RecommendedOpportunityCard,
  projects: RecommendedProjectCard,
  communities: RecommendedCommunityCard,
  students: RecommendedStudentCard,
  achievements: RecommendedAchievementCard,
  posts: RecommendedPostCard,
};

const FETCH = {
  opportunities: 'fetchOpportunities',
  projects: 'fetchProjects',
  communities: 'fetchCommunities',
  students: 'fetchStudents',
  achievements: 'fetchAchievements',
  posts: 'fetchPosts',
};

const CHIPS = [{ id: 'all', label: 'For you' }, ...DISCOVER_SECTIONS.map((id) => ({ id, label: RECOMMENDATION_META[id].chip }))];

/** "Based on your skills, interests and campus" from the server's list of what it used. */
function basedOnText(basedOn) {
  const words = { interests: 'interests', skills: 'skills', campus: 'campus', communities: 'communities', activity: 'recent activity' };
  const parts = (basedOn ?? []).map((key) => words[key]).filter(Boolean);
  if (parts.length === 0) return null;
  return `Based on your ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`}.`;
}

/**
 * /discover: CampusX's personal discovery page. Every pick comes from the server's rule-based engine
 * with a plain reason; "Not interested" is in each card's ⋮ menu. Chips narrow it to one kind.
 */
export default function DiscoverPage() {
  useDocumentTitle('Discover CampusX');
  const user = useAuthStore((state) => state.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const focus = DISCOVER_SECTIONS.includes(searchParams.get('section')) ? searchParams.get('section') : 'all';

  const discovery = useRecommendationStore((state) => state.discovery);
  const personalized = useRecommendationStore((state) => state.personalized);
  const personalization = useRecommendationStore((state) => state.personalization);
  const status = useRecommendationStore((state) => state.status);
  const focusItems = useRecommendationStore((state) => (focus === 'all' ? null : state[focus]));

  useEffect(() => {
    useRecommendationStore.getState().forViewer(user.id);
    useSearchStore.getState().loadOptions();
  }, [user.id]);

  useEffect(() => {
    const store = useRecommendationStore.getState();
    if (focus === 'all') store.fetchDiscovery();
    else store[FETCH[focus]]({ limit: 20 });
  }, [focus, user.id]);

  const choose = (id) => setSearchParams(id === 'all' ? {} : { section: id }, { replace: true });
  const discoveryStatus = status.discovery;
  const focusStatus = focus === 'all' ? null : status[focus];
  const sections = discovery?.sections ?? {};
  const nothing = discoveryStatus === 'ready' && personalized.length === 0 && DISCOVER_SECTIONS.every((key) => !(sections[key]?.length));
  const based = basedOnText(personalization?.basedOn);

  return (
    <PageContainer width="wide">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-bold tracking-[0.14em] text-primary uppercase">
            <Telescope className="size-4" aria-hidden="true" /> Discovery
          </p>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Discover CampusX</h1>
          <p className="mt-1 text-sm text-ink-muted sm:text-base">Find ideas, opportunities, projects and people that match your journey.</p>
          {based && <p className="mt-1 text-xs font-medium text-ink-subtle">{based}</p>}
        </div>
        <Button variant="outline" size="sm" leftIcon={RefreshCw} onClick={() => useRecommendationStore.getState().refreshRecommendations()} loading={discoveryStatus === 'loading' || focusStatus === 'loading'} className="self-start sm:self-auto">
          Refresh
        </Button>
      </header>

      {personalization?.isNew && (
        <Alert variant="info" className="mt-4" title="Welcome to CampusX">
          {personalization.message ?? "You're new to CampusX. Here are some things to explore."}
        </Alert>
      )}

      <div className="-mx-4 mt-5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Show recommendations for">
        <div className="flex w-max gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={focus === chip.id}
              onClick={() => choose(chip.id)}
              className={cn(
                'h-9 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap transition-colors',
                focus === chip.id ? 'border-primary bg-primary text-primary-fg' : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {focus === 'all' ? (
        <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="flex min-w-0 flex-col gap-9">
            {discoveryStatus === 'loading' && !discovery && (
              <>
                <RecommendationSkeleton label="Finding things for you" />
                <RecommendationSkeleton count={3} label="Loading more recommendations" />
              </>
            )}
            {discoveryStatus === 'error' && !discovery && (
              <ErrorState title="We couldn't load recommendations" description="Please check your connection and try again." onRetry={() => useRecommendationStore.getState().fetchDiscovery()} />
            )}
            {nothing && (
              <EmptyState
                icon={Sparkles}
                title="Nothing new to recommend right now."
                description="Add skills and interests to your profile, join a community or save an opportunity, and this page fills up."
                action={<Button as={Link} to={ROUTES.PROFILE_EDIT} variant="outline" size="sm">Update your profile</Button>}
                className="rounded-3xl border border-dashed border-line-strong"
              />
            )}
            {personalized.length > 0 && (
              <RecommendationSection title={RECOMMENDATION_META.forYou.title} description={RECOMMENDATION_META.forYou.description} icon={RECOMMENDATION_META.forYou.icon} items={personalized} renderItem={(item) => <RecommendationCard item={item} />} />
            )}
            {DISCOVER_SECTIONS.filter((key) => sections[key]?.length > 0).map((key) => {
              const meta = RECOMMENDATION_META[key];
              const ItemCard = CARDS[key];
              return (
                <RecommendationSection
                  key={key}
                  title={meta.title}
                  description={meta.description}
                  icon={meta.icon}
                  items={sections[key]}
                  layout={key === 'posts' ? 'list' : 'row'}
                  seeAll={`${ROUTES.DISCOVER}?section=${key}`}
                  seeAllLabel="See more"
                  renderItem={(item) => <ItemCard item={item} />}
                />
              );
            })}
          </div>
          {discovery && (
            <aside aria-label="Trending" className="min-w-0">
              <Card padding="sm" className="xl:sticky xl:top-10">
                <TrendingSection trending={discovery.trending} />
              </Card>
            </aside>
          )}
        </div>
      ) : (
        <div className="mt-6">
          {focusStatus === 'loading' && !focusItems?.length && <RecommendationSkeleton label={`Loading ${RECOMMENDATION_META[focus].title.toLowerCase()}`} />}
          {focusStatus === 'error' && <ErrorState title="We couldn't load these recommendations" onRetry={() => useRecommendationStore.getState()[FETCH[focus]]({ limit: 20 })} />}
          {focusStatus === 'ready' && focusItems?.length === 0 && (
            <EmptyState icon={Sparkles} title="Nothing new to recommend right now." description="Check back soon, or explore everything on CampusX." action={<Button as={Link} to={RECOMMENDATION_META[focus].seeAll ?? ROUTES.DISCOVER} variant="outline" size="sm">Explore</Button>} className="rounded-3xl border border-dashed border-line-strong" />
          )}
          {focusItems?.length > 0 && (
            <RecommendationSection
              title={RECOMMENDATION_META[focus].title}
              description={RECOMMENDATION_META[focus].description}
              icon={RECOMMENDATION_META[focus].icon}
              items={focusItems}
              layout={focus === 'posts' ? 'list' : 'grid'}
              seeAll={RECOMMENDATION_META[focus].seeAll}
              seeAllLabel="Browse all"
              renderItem={(item) => {
                const ItemCard = CARDS[focus];
                return <ItemCard item={item} />;
              }}
            />
          )}
        </div>
      )}
    </PageContainer>
  );
}
