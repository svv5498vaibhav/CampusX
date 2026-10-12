import { OPPORTUNITY_TYPE_ICONS } from '@/constants/opportunities';
import { cn } from '@/utils/cn';

const SIZES = {
  md: { box: 'size-12 rounded-2xl', icon: 'size-6' },
  lg: { box: 'size-16 rounded-3xl', icon: 'size-8' },
};

/** The organizer's logo when there is one, otherwise the opportunity type's icon on a green tile. */
export function OpportunityTypeIcon({ opportunity, size = 'md', className }) {
  const Icon = OPPORTUNITY_TYPE_ICONS[opportunity.type] ?? OPPORTUNITY_TYPE_ICONS.other;
  const { box, icon } = SIZES[size];
  if (opportunity.organizerLogo) {
    return (
      <span className={cn('grid shrink-0 place-items-center overflow-hidden border border-line bg-white', box, className)}>
        <img src={opportunity.organizerLogo} alt={`${opportunity.organizer} logo`} loading="lazy" className="size-full object-contain" />
      </span>
    );
  }
  return (
    <span className={cn('grid shrink-0 place-items-center bg-primary-soft text-primary-soft-fg', box, className)} aria-hidden="true">
      <Icon className={icon} />
    </span>
  );
}
