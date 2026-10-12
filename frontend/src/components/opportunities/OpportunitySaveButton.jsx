import { Check, Heart } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui';
import { TrackingBadge } from '@/components/opportunities/OpportunityStatus';
import { opportunityPath } from '@/constants/opportunities';
import { useOpportunityStore } from '@/store/opportunityStore';
import { toast } from '@/store/toastStore';

/**
 * "♡ Save" → "✓ Saved" (press again to unsave). Once the student has moved on (Interested, Applied,
 * Selected, ...) their status is shown instead, so a stray tap never drops their application record.
 */
export function OpportunitySaveButton({ opportunity, size = 'sm', fullWidth = false, showStatus = true }) {
  const busy = useOpportunityStore((state) => Boolean(state.busy[opportunity.id]));
  const { saveOpportunity, unsaveOpportunity } = useOpportunityStore.getState();
  const status = opportunity.tracking?.status ?? null;

  if (status && status !== 'saved') {
    if (!showStatus) return null;
    return (
      <Link to={opportunityPath(opportunity.id)} title="In My Opportunities" className="inline-flex items-center rounded-lg">
        <TrackingBadge status={status} className="h-9 rounded-xl px-3 text-xs" />
      </Link>
    );
  }

  const saved = status === 'saved';
  const closed = !saved && opportunity.acceptingApplications === false;
  const toggle = async () => {
    try {
      if (saved) {
        await unsaveOpportunity(opportunity.id);
        toast.info('Removed from saved.');
      } else {
        await saveOpportunity(opportunity.id);
        toast.success('Saved! Find it in My Opportunities.');
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Button
      variant={saved ? 'secondary' : 'outline'}
      size={size}
      fullWidth={fullWidth}
      leftIcon={saved ? Check : Heart}
      onClick={toggle}
      loading={busy}
      disabled={closed}
      aria-pressed={saved}
      aria-label={`${saved ? 'Saved' : 'Save'}: ${opportunity.title}`}
      title={closed ? 'Applications have closed' : saved ? 'Saved. Press to remove it from your saved list.' : 'Save to My Opportunities'}
    >
      {saved ? 'Saved' : 'Save'}
    </Button>
  );
}
