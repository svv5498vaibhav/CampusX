import { Badge } from '@/components/ui';
import { VERIFICATION_BADGES } from '@/constants/showcase';

/**
 * Exactly what the server reports. Only "verified" (checked by a CampusX moderator) gets the
 * check-mark badge; everything else is clearly labelled as not verified (yet).
 */
export function VerificationBadge({ status, showHint = false, className }) {
  const badge = VERIFICATION_BADGES[status] ?? VERIFICATION_BADGES.unverified;
  return (
    <span className="inline-flex flex-col gap-1">
      <Badge variant={badge.variant} icon={badge.icon} className={className} title={badge.hint} data-verification={status}>
        {badge.label}
      </Badge>
      {showHint && <span className="text-xs text-ink-subtle">{badge.hint}</span>}
    </span>
  );
}
