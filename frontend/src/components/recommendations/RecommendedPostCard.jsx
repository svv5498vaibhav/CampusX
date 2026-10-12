import { useEffect } from 'react';
import { PostSearchResult } from '@/components/search/PostSearchResult';
import { useFeedStore } from '@/store/feedStore';
import { describeRecommendation, NotInterestedMenu, RecommendationLink } from './RecommendationCard';
import { RecommendationReason } from './RecommendationReason';

/**
 * A recommended post: why it's recommended and "Not interested" above the feed's own post card (likes,
 * comments and saves work as in the feed and stay in step with it). Anonymous Zone posts keep their
 * anonymous card.
 */
export function RecommendedPostCard({ item, headingLevel = 'h3' }) {
  const deleted = useFeedStore((state) => !item.anonymous && state.external[item.id] === null);
  useEffect(() => {
    if (!item.anonymous && !(item.id in useFeedStore.getState().external)) useFeedStore.getState().showExternal([item]);
  }, [item.id]);
  if (deleted) return null;

  return (
    <RecommendationLink item={item}>
      <div className="mb-2 flex items-center gap-2">
        <RecommendationReason reasons={item.reasons} className="min-w-0" />
        <div className="ml-auto shrink-0">
          <NotInterestedMenu item={item} title={describeRecommendation(item).title} />
        </div>
      </div>
      <PostSearchResult post={item} headingLevel={headingLevel} />
    </RecommendationLink>
  );
}
