import { FolderKanban, Heart, MessageCircle, Newspaper, VenetianMask } from 'lucide-react';
import { Link } from 'react-router';
import { RECOMMENDATION_META, recommendationPath } from '@/constants/recommendations';
import { getFullName } from '@/utils/string';
import { cn } from '@/utils/cn';
import { RecommendationLink } from './RecommendationCard';

const excerpt = (text, length = 70) => ((text ?? '').length > length ? `${text.slice(0, length).trimEnd()}…` : text ?? '');

/**
 * "Trending on campus": recent engagement, kept apart from personal recommendations. Anonymous Zone
 * discussions stay anonymous: only their title and counts are shown, never who wrote them.
 */
export function TrendingSection({ trending, headingAs: Heading = 'h2', compact = false, className }) {
  const meta = RECOMMENDATION_META.trending;
  const rows = [
    ...(trending?.posts ?? []).map((item) => ({ item, icon: Newspaper, title: excerpt(item.content), byline: item.author ? getFullName(item.author) : 'Campus post', likes: item.likeCount, comments: item.commentCount })),
    ...(trending?.discussions ?? []).map((item) => ({ item, icon: VenetianMask, title: item.title, byline: 'Anonymous discussion', likes: item.likeCount, comments: item.commentCount })),
    ...(trending?.projects ?? []).map((item) => ({ item, icon: FolderKanban, title: item.title, byline: 'Project', likes: item.likeCount })),
  ].slice(0, compact ? 5 : 10);
  const Icon = meta.icon;

  return (
    <section aria-label={meta.title} className={cn('min-w-0', className)}>
      <Heading className="flex items-center gap-2 font-display text-base font-bold text-ink">
        <Icon className="size-4 text-accent-fg" aria-hidden="true" /> {meta.title}
      </Heading>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">Nothing is trending yet this week. Posts and projects with likes and comments show up here.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-1" aria-label={meta.title}>
          {rows.map(({ item, icon: RowIcon, title, byline, likes, comments }, index) => (
            <li key={`${item.recommendationType}:${item.id}`}>
              <RecommendationLink item={item}>
                <Link to={recommendationPath(item)} className="flex gap-3 rounded-2xl p-2 transition-colors hover:bg-surface-muted" data-trending={item.anonymous ? 'discussion' : item.recommendationType}>
                  <span className="mt-0.5 w-4 shrink-0 text-right font-display text-sm font-bold text-ink-subtle" aria-hidden="true">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm leading-snug font-semibold break-words text-ink">{title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
                      <span className="inline-flex items-center gap-1"><RowIcon className="size-3.5" aria-hidden="true" />{byline}</span>
                      <span className="inline-flex items-center gap-0.5"><Heart className="size-3" aria-hidden="true" />{likes ?? 0}<span className="sr-only"> likes</span></span>
                      {comments !== undefined && <span className="inline-flex items-center gap-0.5"><MessageCircle className="size-3" aria-hidden="true" />{comments}<span className="sr-only"> comments</span></span>}
                    </span>
                    <span className="sr-only">. {item.reasons?.[0]}</span>
                  </span>
                </Link>
              </RecommendationLink>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
