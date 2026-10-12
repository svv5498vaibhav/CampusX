import { CommunitySearchCard } from '@/components/search/CommunitySearchCard';
import { useRecommendationStore } from '@/store/recommendationStore';
import { NotInterestedMenu, RecommendationLink } from './RecommendationCard';
import { RecommendationReason } from './RecommendationReason';

/** A community the student may like (they can join it): the community card plus why. Joining updates it in place. */
export function RecommendedCommunityCard({ item, headingLevel = 'h3' }) {
  const onJoined = (updated) => useRecommendationStore.getState().patchItem(item.recommendationType, item.id, updated);
  return (
    <RecommendationLink item={item}>
      <CommunitySearchCard community={item} headingLevel={headingLevel} onJoined={onJoined} reason={<RecommendationReason reasons={item.reasons} />} menu={<NotInterestedMenu item={item} title={item.name} />} />
    </RecommendationLink>
  );
}
