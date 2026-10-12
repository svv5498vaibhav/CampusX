import { StudentSearchCard } from '@/components/search/StudentSearchCard';
import { getFullName } from '@/utils/string';
import { NotInterestedMenu, RecommendationLink } from './RecommendationCard';
import { RecommendationReason } from './RecommendationReason';

/**
 * A student with similar interests: their public card (never an email or roll number) plus what you have
 * in common. "Students with similar interests", not "people you may know".
 */
export function RecommendedStudentCard({ item, headingLevel = 'h3' }) {
  return (
    <RecommendationLink item={item}>
      <StudentSearchCard student={item} headingLevel={headingLevel} reason={<RecommendationReason reasons={item.reasons} />} menu={<NotInterestedMenu item={item} title={getFullName(item)} />} />
    </RecommendationLink>
  );
}
