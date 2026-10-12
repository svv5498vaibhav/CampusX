import { Star } from 'lucide-react';
import { Link } from 'react-router';
import { OpportunityDeadline } from '@/components/opportunities/OpportunityDeadline';
import { OpportunityTypeIcon } from '@/components/opportunities/OpportunityTypeIcon';
import { Badge, Button } from '@/components/ui';
import { OPPORTUNITY_MODE_ICONS, formatDay } from '@/constants/opportunities';
import { labelOf, searchResultPath } from '@/constants/search';
import { useSearchStore } from '@/store/searchStore';
import { cn } from '@/utils/cn';

/**
 * An opportunity in search results: title, type, organizer, mode, deadline, skills and a featured mark.
 * Closed ones (by a moderator or past their deadline) are clearly shown as closed, never as open.
 * Discover adds a recommendation `reason` and a `menu` (both optional).
 */
export function OpportunitySearchCard({ opportunity, headingLevel = 'h3', reason, menu }) {
  const filters = useSearchStore((state) => state.options?.filters);
  const Heading = headingLevel;
  const path = searchResultPath('opportunities', opportunity);
  const ModeIcon = OPPORTUNITY_MODE_ICONS[opportunity.mode] ?? OPPORTUNITY_MODE_ICONS.online;
  const closed = !opportunity.acceptingApplications;

  return (
    <article
      className={cn('flex h-full flex-col rounded-3xl border border-line bg-surface p-4 shadow-soft transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-lift', closed && 'bg-surface-muted/40')}
      data-search-result="opportunity"
      data-opportunity-id={opportunity.id}
    >
      <div className="flex items-start gap-3">
        <OpportunityTypeIcon opportunity={opportunity} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <p className="text-xs font-bold tracking-wide text-primary uppercase">{labelOf(filters?.opportunityTypes, opportunity.type)}</p>
            <OpportunityDeadline opportunity={opportunity} />
          </div>
          <Heading className="mt-1 font-display text-base leading-snug font-bold text-ink">
            <Link to={path} className="hover:underline">{opportunity.title}</Link>
          </Heading>
          <p className="mt-0.5 truncate text-sm text-ink-muted">{opportunity.organizer}</p>
        </div>
        {menu && <div className="-mt-1.5 -mr-2 shrink-0">{menu}</div>}
      </div>

      <dl className="mt-3 flex flex-col gap-1.5 text-sm text-ink-muted">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Mode</dt>
          <ModeIcon className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
          <dd className="truncate">{[labelOf(filters?.opportunityModes, opportunity.mode), opportunity.mode !== 'online' && opportunity.location].filter(Boolean).join(' · ')}</dd>
        </div>
        {opportunity.applicationDeadline && (
          <div className="flex items-center gap-1.5">
            <dt className="font-semibold text-ink">Deadline:</dt>
            <dd>{formatDay(opportunity.applicationDeadline)}</dd>
          </div>
        )}
        {opportunity.skills?.length > 0 && (
          <div className="flex items-baseline gap-1.5">
            <dt className="font-semibold text-ink">Skills:</dt>
            <dd className="truncate">{opportunity.skills.slice(0, 4).join(' • ')}</dd>
          </div>
        )}
      </dl>

      {opportunity.featured && (
        <div className="mt-3">
          <Badge variant="accent" icon={Star} className="px-2 py-0.5 text-[11px]">Featured</Badge>
        </div>
      )}

      {reason && <div className="mt-3">{reason}</div>}

      <div className="mt-auto pt-4">
        <Button as={Link} to={path} variant="outline" size="sm" fullWidth aria-label={`View opportunity: ${opportunity.title}`}>
          View Opportunity
        </Button>
      </div>
    </article>
  );
}
