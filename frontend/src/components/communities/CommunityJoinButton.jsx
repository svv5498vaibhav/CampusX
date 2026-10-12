import { Check, Lock, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui';
import { communityPath } from '@/constants/routes';
import { useCommunityStore } from '@/store/communityStore';
import { toast } from '@/store/toastStore';

/**
 * Join Community / Joined / why you can't join. Joining updates every list at once (no reload).
 * The server decides: the button only reflects what it reported (canJoin, joinBlockedReason).
 */
export function CommunityJoinButton({ community, size = 'sm', fullWidth = false, joinedAsLink = true }) {
  const busy = useCommunityStore((state) => Boolean(state.busy[`${community.id}:join`]));
  const joinCommunity = useCommunityStore((state) => state.joinCommunity);
  const isMember = community.membership?.status === 'active';

  if (isMember) {
    return joinedAsLink ? (
      <Button as={Link} to={communityPath(community.id)} variant="secondary" size={size} fullWidth={fullWidth} leftIcon={Check} aria-label={`Joined. Open ${community.name}`}>
        Joined
      </Button>
    ) : (
      // A status, not an action: leaving lives in the community's ⋮ menu.
      <span className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary-soft px-4 text-sm font-semibold text-primary-soft-fg">
        <Check className="size-4" aria-hidden="true" />
        Joined
      </span>
    );
  }

  if (!community.canJoin) {
    return (
      <Button variant="outline" size={size} fullWidth={fullWidth} leftIcon={Lock} disabled title={community.joinBlockedReason ?? undefined}>
        <span className="sr-only">{community.joinBlockedReason}</span>
        <span aria-hidden="true">Can't join</span>
      </Button>
    );
  }

  const join = async () => {
    try {
      await joinCommunity(community.id);
      toast.success('Joined community!');
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Button size={size} fullWidth={fullWidth} leftIcon={Plus} loading={busy} onClick={join} aria-label={`Join ${community.name}`}>
      Join Community
    </Button>
  );
}
