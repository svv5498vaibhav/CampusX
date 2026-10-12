import { ProjectSearchCard } from '@/components/search/ProjectSearchCard';
import { NotInterestedMenu, RecommendationLink } from './RecommendationCard';
import { RecommendationReason } from './RecommendationReason';

/** A recommended project: the compact project card, why it's recommended, and "Not interested". */
export function RecommendedProjectCard({ item, headingLevel = 'h3' }) {
  return (
    <RecommendationLink item={item}>
      <ProjectSearchCard project={item} headingLevel={headingLevel} reason={<RecommendationReason reasons={item.reasons} />} menu={<NotInterestedMenu item={item} title={item.title} />} />
    </RecommendationLink>
  );
}
