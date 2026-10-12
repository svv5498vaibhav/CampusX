import { useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { Alert, Button, EmptyState, ErrorState, Loader } from '@/components/ui';
import { RECOMMENDATION_META } from '@/constants/recommendations';
import { ROUTES } from '@/constants/routes';
import { useRecommendationStore } from '@/store/recommendationStore';
import { RecommendationSection } from './RecommendationSection';
import { RecommendedPostCard } from './RecommendedPostCard';

/**
 * The home page's "For you" view: campus posts picked for the student (interests, skills, communities,
 * campus), mixed with new and popular posts from around campus so it never narrows to one topic.
 */
export function ForYouFeed({ onShowCampus }) {
  const posts = useRecommendationStore((state) => state.posts);
  const status = useRecommendationStore((state) => state.status.posts);
  const personalization = useRecommendationStore((state) => state.personalization);

  useEffect(() => {
    useRecommendationStore.getState().fetchPosts({ limit: 20 });
  }, []);

  // Not started yet counts as loading (no empty section flashes before the first request).
  if ((!status || status === 'loading') && posts.length === 0) return <Loader centered label="Finding posts for you" className="min-h-[30vh]" />;
  if (status === 'error' && posts.length === 0) return <ErrorState title="We couldn't load posts for you" onRetry={() => useRecommendationStore.getState().fetchPosts({ limit: 20 })} />;
  if (status === 'ready' && posts.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Nothing new to recommend right now."
        description="The campus feed has everything that's happening."
        action={<Button variant="outline" size="sm" onClick={onShowCampus}>See the campus feed</Button>}
        className="rounded-3xl border border-dashed border-line-strong"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {personalization?.isNew && <Alert variant="info">{personalization.message ?? "You're new to CampusX. Here are some things to explore."}</Alert>}
      <RecommendationSection
        title="Posts for you"
        description="Picked from your interests, skills, communities and campus, with some new campus posts mixed in."
        icon={RECOMMENDATION_META.posts.icon}
        items={posts}
        layout="list"
        seeAll={ROUTES.DISCOVER}
        seeAllLabel="Discover more"
        renderItem={(item) => <RecommendedPostCard item={item} />}
      />
      <p className="py-2 text-center text-sm text-ink-subtle">
        That's all for now. <Link to={ROUTES.DISCOVER} className="font-semibold text-primary hover:underline">Discover more</Link>
      </p>
    </div>
  );
}
