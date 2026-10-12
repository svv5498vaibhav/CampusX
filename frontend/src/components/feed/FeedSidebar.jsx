import { ArrowRight, Compass, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { RecommendationReason } from '@/components/recommendations/RecommendationReason';
import { RecommendationLink } from '@/components/recommendations/RecommendationCard';
import { TrendingSection } from '@/components/recommendations/TrendingSection';
import { Card } from '@/components/ui';
import { recommendationPath } from '@/constants/recommendations';
import { ROUTES } from '@/constants/routes';
import { useRecommendationStore } from '@/store/recommendationStore';

/**
 * Right-hand column on wide screens: trending on campus (recent engagement), a few opportunities picked
 * for the student (with why), the way to Discover, and posting tips. All of it comes from the recommendation engine
 * (loaded by the home page); nothing here is invented.
 */
export function FeedSidebar({ onShowOpportunities }) {
  const home = useRecommendationStore((state) => state.home);
  const status = useRecommendationStore((state) => state.status.home);
  const opportunities = home?.sections?.opportunities?.slice(0, 3) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card padding="sm" className="campus-grid">
        {home ? (
          <TrendingSection trending={home.trending} compact />
        ) : (
          <div role="status" aria-label="Loading what's trending" className="space-y-2">
            <div className="h-5 w-40 animate-pulse rounded bg-surface-muted" />
            <div className="h-10 animate-pulse rounded-xl bg-surface-muted" />
            <div className="h-10 animate-pulse rounded-xl bg-surface-muted" />
            {status === 'error' && <p className="text-sm text-ink-muted">Trending posts couldn't load right now.</p>}
          </div>
        )}
        <Link to={ROUTES.DISCOVER} className="mt-3 inline-flex items-center gap-1 rounded-lg text-sm font-semibold text-primary hover:underline">
          Discover more <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </Card>

      <Card padding="sm">
        <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
          <Compass className="size-4 text-primary" aria-hidden="true" /> Opportunities for you
        </h2>
        {opportunities.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-3" aria-label="Opportunities for you">
            {opportunities.map((item) => (
              <li key={item.id}>
                <RecommendationLink item={item}>
                  <Link to={recommendationPath(item)} className="block rounded-xl text-sm leading-snug font-semibold text-ink hover:text-primary hover:underline">
                    {item.title}
                  </Link>
                  <p className="truncate text-xs text-ink-muted">{item.organizer}</p>
                  <RecommendationReason reasons={item.reasons} compact className="mt-1.5" />
                </RecommendationLink>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">Internships, hackathons and scholarships you're eligible for show up here.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
          <Link to={ROUTES.OPPORTUNITIES} className="rounded-lg text-primary hover:underline">
            Opportunities hub
          </Link>
          <span className="text-ink-subtle" aria-hidden="true">·</span>
          <button type="button" onClick={onShowOpportunities} className="rounded-lg text-ink-muted hover:text-ink hover:underline">
            Show opportunity posts
          </button>
        </div>
      </Card>

      <Card padding="sm" tone="muted">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Sparkles className="size-4 text-primary" aria-hidden="true" /> Posting tips
        </h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-xs leading-relaxed text-ink-muted">
          <li>Pick “My branch” for class updates only your batch needs.</li>
          <li>Tag achievements and projects so classmates can find them.</li>
          <li>You can edit or delete your posts any time from the ⋮ menu.</li>
        </ul>
      </Card>
    </div>
  );
}
