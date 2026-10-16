import { MessageCircle, Heart } from 'lucide-react';
import { Link } from 'react-router';
import { AnonymousByline } from '@/components/anonymous/AnonymousPostCard';
import { PostCard } from '@/components/feed/PostCard';
import { Badge } from '@/components/ui';
import { ANONYMOUS_CATEGORY_ICONS, categoryLabel } from '@/constants/anonymous';
import { searchResultPath } from '@/constants/search';
import { useAnonymousStore } from '@/store/anonymousStore';
import { useFeedStore } from '@/store/feedStore';

/**
 * An Anonymous Zone post in search results, shown the Anonymous Zone's way: "Anonymous Student", never
 * a name, photo or campus. The search API never sends the author, so there is nothing else to show.
 * The discussion (likes, comments, reports) lives on the post's own page.
 */
function AnonymousSearchCard({ post, headingLevel }) {
  const options = useAnonymousStore((state) => state.options);
  const Heading = headingLevel;
  const CategoryIcon = ANONYMOUS_CATEGORY_ICONS[post.category] ?? ANONYMOUS_CATEGORY_ICONS.other;
  const path = searchResultPath('posts', post);

  return (
    <article className="glass-card rounded-3xl border border-line bg-surface p-4 shadow-soft sm:p-5" data-search-result="anonymous-post" data-anonymous-post-id={post.id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AnonymousByline createdAt={post.createdAt} edited={post.edited} />
        <Badge variant="primary" icon={CategoryIcon} className="px-2 py-0.5 text-[11px]">
          Anonymous Zone · {categoryLabel(options, post.category)}
        </Badge>
      </div>
      <Heading className="mt-2 font-display text-lg leading-snug font-bold text-ink">
        <Link to={path} className="hover:underline">{post.title}</Link>
      </Heading>
      <p className="mt-1.5 line-clamp-3 text-[15px] leading-relaxed break-words whitespace-pre-line text-ink">{post.content}</p>
      <div className="mt-3 flex items-center gap-4 border-t border-line pt-2 text-sm font-semibold text-ink-muted">
        <span className="inline-flex items-center gap-1.5" aria-label={`${post.likeCount} ${post.likeCount === 1 ? 'like' : 'likes'}`}>
          <Heart className="size-4" aria-hidden="true" /> <span aria-hidden="true">{post.likeCount}</span>
        </span>
        <Link to={path} className="inline-flex items-center gap-1.5 rounded-lg px-1 hover:text-ink" aria-label={`${post.commentCount} ${post.commentCount === 1 ? 'comment' : 'comments'}: open the discussion`}>
          <MessageCircle className="size-4" aria-hidden="true" /> <span aria-hidden="true">{post.commentCount}</span>
        </Link>
        <Link to={path} className="ml-auto text-primary hover:underline">Open discussion</Link>
      </div>
    </article>
  );
}

/**
 * A post in search results. Campus posts use the feed's own PostCard (likes, comments, saves and edits
 * work as in the feed and stay in step with it); anonymous posts use the Anonymous Zone's safe card.
 */
export function PostSearchResult({ post, headingLevel = 'h3' }) {
  const live = useFeedStore((state) => (post.anonymous ? undefined : state.external[post.id]));
  if (post.anonymous) return <AnonymousSearchCard post={post} headingLevel={headingLevel} />;
  // null: deleted from here or elsewhere.
  if (live === null) return null;
  return <PostCard post={live ?? post} headingLevel={headingLevel} />;
}
