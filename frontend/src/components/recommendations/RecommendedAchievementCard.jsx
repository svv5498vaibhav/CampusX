import { AchievementSearchCard } from '@/components/search/AchievementSearchCard';
import { NotInterestedMenu, RecommendationLink } from './RecommendationCard';
import { RecommendationReason } from './RecommendationReason';

/** A recommended achievement, for discovery and inspiration (never private ones): the achievement card plus why. */
export function RecommendedAchievementCard({ item, headingLevel = 'h3' }) {
  return (
    <RecommendationLink item={item}>
      <AchievementSearchCard achievement={item} headingLevel={headingLevel} reason={<RecommendationReason reasons={item.reasons} />} menu={<NotInterestedMenu item={item} title={item.title} />} />
    </RecommendationLink>
  );
}
