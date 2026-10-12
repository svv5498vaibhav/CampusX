import { useId } from 'react';
import { Badge } from '@/components/ui';
import { TRACKING_BADGES, trackingLabel } from '@/constants/opportunities';
import { useOpportunityStore } from '@/store/opportunityStore';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';

/** The student's own status for an opportunity (Saved, Applied, Selected, ...). */
export function TrackingBadge({ status, className }) {
  const options = useOpportunityStore((state) => state.options);
  const badge = TRACKING_BADGES[status];
  if (!badge) return null;
  return (
    <Badge variant={badge.variant} icon={badge.icon} className={cn('px-2 py-0.5 text-[11px]', className)}>
      {trackingLabel(options, status)}
    </Badge>
  );
}

/**
 * Lets the student change their own status. Mirrors the server's rules: Shortlisted, Selected,
 * Rejected and Withdrawn come after Applied; Saved and Interested only while it is open.
 * The server checks again and only ever changes the signed-in student's record.
 */
export function TrackingStatusSelect({ opportunity, label = 'My status', compact = false, onChanged }) {
  const options = useOpportunityStore((state) => state.options);
  const busy = useOpportunityStore((state) => Boolean(state.busy[opportunity.id]));
  const updateApplicationStatus = useOpportunityStore((state) => state.updateApplicationStatus);
  const selectId = useId();
  const current = opportunity.tracking?.status ?? '';
  const hasApplied = Boolean(opportunity.tracking?.appliedAt);
  const open = opportunity.acceptingApplications !== false && opportunity.available !== false;
  const allowed = (status) => {
    if (status.id === current) return true;
    if (!current && !open) return false;
    if (!open && ['saved', 'interested'].includes(status.id)) return false;
    return !status.afterApplying || hasApplied;
  };

  const change = async (event) => {
    const status = event.target.value;
    try {
      await updateApplicationStatus(opportunity.id, status);
      toast.success(`Marked as ${trackingLabel(options, status).toLowerCase()}.`);
      onChanged?.(status);
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div className={cn('flex items-center gap-2', compact && 'gap-1.5')}>
      <label htmlFor={selectId} className={cn('text-sm font-semibold text-ink-muted', compact && 'sr-only')}>{label}</label>
      <select
        id={selectId}
        value={current}
        onChange={change}
        disabled={busy || !options}
        aria-label={compact ? `${label} for ${opportunity.title}` : undefined}
        className="h-9 rounded-xl border border-line-strong bg-surface px-2.5 text-sm font-semibold text-ink focus:border-primary focus:ring-4 focus:ring-focus focus:outline-none disabled:opacity-60"
      >
        {!current && <option value="" disabled>Choose…</option>}
        {(options?.trackingStatuses ?? []).map((status) => (
          <option key={status.id} value={status.id} disabled={!allowed(status)}>
            {status.label}
            {status.afterApplying && !hasApplied ? ' (after applying)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
