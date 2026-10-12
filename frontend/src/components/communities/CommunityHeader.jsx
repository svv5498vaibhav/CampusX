import { useState } from 'react';
import { BadgeCheck, Flag, LogOut, Settings, UsersRound } from 'lucide-react';
import { CommunityIcon } from '@/components/communities/CommunityIcon';
import { CommunityJoinButton } from '@/components/communities/CommunityJoinButton';
import { PostMenu } from '@/components/feed/PostMenu';
import { ModerationNotice } from '@/components/safety/ModerationNotice';
import { ReportModal } from '@/components/safety/ReportModal';
import { Badge, Button, Modal } from '@/components/ui';
import { COMMUNITY_TYPE_STYLES, ROLE_LABELS, communityScopeLine, communityTypeLabel, memberCountLabel } from '@/constants/communities';
import { useCommunityStore } from '@/store/communityStore';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';

/** Cover, icon, name, type, campus scope, member count and the student's actions (join / leave / settings). */
export function CommunityHeader({ community, onEdit }) {
  const options = useCommunityStore((state) => state.options);
  const leaving = useCommunityStore((state) => Boolean(state.busy[`${community.id}:join`]));
  const leaveCommunity = useCommunityStore((state) => state.leaveCommunity);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [reporting, setReporting] = useState(false);
  const style = COMMUNITY_TYPE_STYLES[community.type] ?? COMMUNITY_TYPE_STYLES['student-created'];
  const role = community.membership?.status === 'active' ? community.membership.role : null;

  const leave = async () => {
    try {
      await leaveCommunity(community.id);
      setConfirmLeave(false);
      toast.success('You left the community.');
    } catch (error) {
      setConfirmLeave(false);
      toast.error(error.message);
    }
  };

  const menuItems = [
    ...(community.permissions?.canEdit ? [{ id: 'settings', label: 'Community settings', icon: Settings, onSelect: onEdit }] : []),
    ...(role ? [{ id: 'leave', label: 'Leave Community', icon: LogOut, onSelect: () => setConfirmLeave(true), danger: true }] : []),
    // Anyone but its owners can report a community.
    ...(role !== 'owner' ? [{ id: 'report', label: 'Report community', icon: Flag, onSelect: () => setReporting(true), danger: true }] : []),
  ];

  return (
    <header className="overflow-hidden rounded-3xl border border-line bg-surface shadow-soft">
      <div className={cn('relative h-28 bg-linear-to-br sm:h-40', style.cover)}>
        {community.coverImageUrl && <img src={community.coverImageUrl} alt="" className="size-full object-cover" />}
        <div className="campus-grid absolute inset-0 opacity-40" aria-hidden="true" />
      </div>

      <div className="px-4 pb-5 sm:px-6">
        <div className="-mt-10 flex items-end justify-between gap-3 sm:-mt-12">
          <CommunityIcon community={community} size="xl" className="ring-4 ring-surface" />
          <div className="flex items-center gap-2 pb-1">
            <CommunityJoinButton community={community} size="md" joinedAsLink={false} />
            {menuItems.length > 0 && <PostMenu items={menuItems} label="Community options" />}
          </div>
        </div>

        <h1 className="mt-3 font-display text-2xl leading-tight font-bold text-ink sm:text-3xl">{community.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant={style.badge} icon={style.icon}>{communityTypeLabel(options, community.type)}</Badge>
          {community.official && <Badge variant="outline" icon={BadgeCheck}>Official</Badge>}
          {community.status === 'archived' && <Badge variant="neutral">Archived</Badge>}
          {role && role !== 'member' && <Badge variant="primary">{ROLE_LABELS[role]}</Badge>}
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
          <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
            <UsersRound className="size-4" aria-hidden="true" />
            {memberCountLabel(community.memberCount)}
          </span>
          <span aria-hidden="true">·</span>
          <span>{communityScopeLine(community)}</span>
        </p>
        {community.moderation && <ModerationNotice status={community.moderation.status} noun="community" className="mt-3" />}
        {!community.canJoin && !role && community.joinBlockedReason && (
          <p className="mt-2 text-sm font-medium text-ink-muted">{community.joinBlockedReason}</p>
        )}
      </div>

      <Modal
        open={confirmLeave}
        onClose={leaving ? () => {} : () => setConfirmLeave(false)}
        title="Leave this community?"
        description={role === 'owner' ? 'Owners can only leave once another member is an owner too.' : 'You can join again later, as long as it’s still open to you.'}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmLeave(false)} disabled={leaving}>
              Cancel
            </Button>
            <Button variant="danger" leftIcon={LogOut} loading={leaving} onClick={leave}>
              Leave
            </Button>
          </>
        }
      />
      <ReportModal target={{ type: 'community', id: community.id }} open={reporting} onClose={() => setReporting(false)} />
    </header>
  );
}
