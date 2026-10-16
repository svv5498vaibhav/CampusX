import { motion } from 'framer-motion';
import { BadgeCheck, CircleSlash, Sparkles, Trophy } from 'lucide-react';
import { Link } from 'react-router';
import { OpportunityDeadline } from '@/components/opportunities/OpportunityDeadline';
import { OpportunitySaveButton } from '@/components/opportunities/OpportunitySaveButton';
import { OpportunityTypeIcon } from '@/components/opportunities/OpportunityTypeIcon';
import { Badge, Button } from '@/components/ui';
import { OPPORTUNITY_MODE_ICONS, formatDay, modeLabel, opportunityPath, typeLabel } from '@/constants/opportunities';
import { useOpportunityStore } from '@/store/opportunityStore';

/** Eligible / Not eligible, worked out by the server from the student's own profile. */
export function EligibilityBadge({ opportunity, className }) {
  const eligibility = opportunity.viewerEligibility;
  if (!eligibility) return null;
  return eligibility.eligible ? (
    <Badge variant="primary" icon={BadgeCheck} className={className ?? 'px-2 py-0.5 text-[11px]'} title={eligibility.restricted ? 'You match its eligibility rules.' : 'Open to every student.'}>
      Eligible
    </Badge>
  ) : (
    <Badge variant="neutral" icon={CircleSlash} className={className ?? 'px-2 py-0.5 text-[11px]'} title={eligibility.reasons.join(' · ')}>
      Not eligible
    </Badge>
  );
}

/**
 * One opportunity in a list: what it is, who runs it, when applications close, and the student's own
 * saved/applied state. Phones get the essentials (title, organizer, type, deadline, save, view).
 */
export function OpportunityCard({ opportunity, headingLevel = 'h3', showReason = false }) {
  const options = useOpportunityStore((state) => state.options);
  const Heading = headingLevel;
  const ModeIcon = OPPORTUNITY_MODE_ICONS[opportunity.mode] ?? OPPORTUNITY_MODE_ICONS.online;
  const reason = showReason ? opportunity.matchReasons?.[0] : null;
  const where = [modeLabel(options, opportunity.mode), opportunity.mode !== 'online' && opportunity.location].filter(Boolean).join(' · ');

  return (
    <motion.article
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="flex h-full flex-col glass-card rounded-3xl border border-line bg-surface p-4 shadow-soft"
      data-opportunity-id={opportunity.id}
      aria-labelledby={`opportunity-${opportunity.id}-title`}
    >
      <div className="flex items-start gap-3">
        <OpportunityTypeIcon opportunity={opportunity} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <p className="text-xs font-bold tracking-wide text-primary uppercase">{typeLabel(options, opportunity.type)}</p>
            <OpportunityDeadline opportunity={opportunity} />
          </div>
          <Heading id={`opportunity-${opportunity.id}-title`} className="mt-1 font-display text-base leading-snug font-bold text-ink">
            <Link to={opportunityPath(opportunity.id)} className="hover:underline">{opportunity.title}</Link>
          </Heading>
          <p className="mt-0.5 truncate text-sm text-ink-muted">{opportunity.organizer}</p>
        </div>
      </div>

      {reason && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-primary-soft px-2.5 py-1.5 text-xs font-semibold text-primary-soft-fg">
          <Sparkles className="mt-px size-3.5 shrink-0" aria-hidden="true" /> {reason}
        </p>
      )}

      <dl className="mt-3 flex flex-col gap-1.5 text-sm text-ink-muted">
        <div className="hidden items-center gap-1.5 sm:flex">
          <dt className="sr-only">Where</dt>
          <ModeIcon className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
          <dd className="truncate">{where}</dd>
        </div>
        {opportunity.applicationDeadline && (
          <div className="flex items-center gap-1.5">
            <dt className="font-semibold text-ink">Deadline:</dt>
            <dd>{formatDay(opportunity.applicationDeadline)}</dd>
          </div>
        )}
        {opportunity.skills.length > 0 && (
          <div className="hidden items-baseline gap-1.5 sm:flex">
            <dt className="font-semibold text-ink">Skills:</dt>
            <dd className="truncate">{opportunity.skills.slice(0, 4).join(' • ')}{opportunity.skills.length > 4 && ` +${opportunity.skills.length - 4}`}</dd>
          </div>
        )}
        {opportunity.prize && (
          <div className="hidden items-center gap-1.5 sm:flex">
            <dt><Trophy className="size-4 text-accent-fg" aria-hidden="true" /><span className="sr-only">Prize</span></dt>
            <dd className="truncate font-semibold text-ink">{opportunity.prize}</dd>
          </div>
        )}
      </dl>

      <div className="mt-3 mb-3 flex flex-wrap gap-1.5">
        <EligibilityBadge opportunity={opportunity} />
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
        <Button as={Link} to={opportunityPath(opportunity.id)} variant="ghost" size="sm" className="-ml-2" aria-label={`View details: ${opportunity.title}`}>
          View Details
        </Button>
        <OpportunitySaveButton opportunity={opportunity} />
      </div>
    </motion.article>
  );
}
