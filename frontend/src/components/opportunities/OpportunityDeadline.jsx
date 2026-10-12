import { CalendarClock, CircleSlash, Hourglass, Infinity as Rolling } from 'lucide-react';
import { deadlineInfo, formatDeadline } from '@/constants/opportunities';
import { useNow } from '@/hooks/useNow';
import { useOpportunityStore } from '@/store/opportunityStore';
import { cn } from '@/utils/cn';

const STATES = {
  open: { icon: CalendarClock, className: 'bg-primary-soft text-primary-soft-fg', srPrefix: 'Upcoming' },
  'closing-soon': { icon: Hourglass, className: 'bg-accent-soft text-accent-fg', srPrefix: 'Closing soon' },
  closed: { icon: CircleSlash, className: 'bg-surface-muted text-ink-muted', srPrefix: '' },
  rolling: { icon: Rolling, className: 'bg-surface-muted text-ink-muted', srPrefix: '' },
};

/** The live deadline state of an opportunity: "5 days left", "Tomorrow", "Deadline today", "Closed". */
export function useDeadline(opportunity) {
  const now = useNow();
  const closingSoonDays = useOpportunityStore((state) => state.options?.rules.closingSoonDays);
  return deadlineInfo(opportunity, now, closingSoonDays);
}

/** Countdown chip. Gentle colours: green when upcoming, warm when closing soon, grey when closed. */
export function OpportunityDeadline({ opportunity, className }) {
  const info = useDeadline(opportunity);
  const { icon: Icon, className: tone, srPrefix } = STATES[info.state];
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-bold whitespace-nowrap', tone, className)}
      title={opportunity.applicationDeadline ? `Deadline: ${formatDeadline(opportunity.applicationDeadline)}` : undefined}
      data-deadline-state={info.state}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {srPrefix && info.state !== 'closed' && <span className="sr-only">{srPrefix}: </span>}
      {info.label}
    </span>
  );
}
