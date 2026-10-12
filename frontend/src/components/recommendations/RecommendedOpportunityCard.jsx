import { OpportunitySearchCard } from '@/components/search/OpportunitySearchCard';
import { NotInterestedMenu, RecommendationLink } from './RecommendationCard';
import { RecommendationReason } from './RecommendationReason';

/** A recommended opportunity (open, and the student is eligible): the opportunity card plus why. */
export function RecommendedOpportunityCard({ item, headingLevel = 'h3' }) {
  return (
    <RecommendationLink item={item}>
      <OpportunitySearchCard opportunity={item} headingLevel={headingLevel} reason={<RecommendationReason reasons={item.reasons} />} menu={<NotInterestedMenu item={item} title={item.title} />} />
    </RecommendationLink>
  );
}
