import { useEffect, useState } from 'react';
import { Crown, ShieldCheck, UserMinus, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { PostMenu } from '@/components/feed/PostMenu';
import { Avatar, Badge, Button, ErrorState, Loader, Modal } from '@/components/ui';
import { ROLE_LABELS } from '@/constants/communities';
import { profilePath } from '@/constants/routes';
import { useCommunityStore } from '@/store/communityStore';
import { toast } from '@/store/toastStore';
import { getFullName } from '@/utils/string';

const ROLE_BADGE = { owner: 'accent', moderator: 'primary', member: 'neutral' };

/** What the viewer may do to a member (the server enforces the same rules). */
function actionsFor(member, permissions, viewerRole) {
  if (member.isYou || member.role === 'owner') return [];
  const actions = [];
  if (permissions.canChangeRoles) {
    if (member.role !== 'moderator') actions.push({ id: 'moderator', label: 'Make moderator', icon: ShieldCheck, role: 'moderator' });
    if (member.role !== 'member') actions.push({ id: 'member', label: 'Make member', icon: UserRound, role: 'member' });
    actions.push({ id: 'owner', label: 'Make co-owner', icon: Crown, role: 'owner' });
  }
  const canRemove = permissions.canManageMembers && (member.role === 'member' || viewerRole === 'owner');
  if (canRemove) actions.push({ id: 'remove', label: 'Remove from community', icon: UserMinus, danger: true });
  return actions;
}

/**
 * The member list: photo, name, branch, semester and community role, a page at a time. Owners and
 * moderators get basic tools (roles, remove). No email or account details are ever shown.
 */
export function CommunityMembers({ community, compact = false }) {
  const members = useCommunityStore((state) => state.members);
  const pagination = useCommunityStore((state) => state.membersPagination);
  const status = useCommunityStore((state) => state.membersStatus);
  const { fetchMembers, changeRole, removeMember } = useCommunityStore.getState();
  const [removing, setRemoving] = useState(null); // member being removed (confirm dialog)
  const [busy, setBusy] = useState(false);
  const permissions = community.permissions ?? {};
  const viewerRole = community.membership?.status === 'active' ? community.membership.role : null;

  useEffect(() => {
    fetchMembers(community.id);
  }, [community.id, fetchMembers]);

  const setRole = async (member, role) => {
    try {
      await changeRole(community.id, member.student.id, role);
      toast.success(`${member.student.firstName} is now ${role === 'owner' ? 'a co-owner' : `a ${role}`}.`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const confirmRemove = async () => {
    setBusy(true);
    try {
      await removeMember(community.id, removing.student.id);
      toast.success('Member removed.');
      setRemoving(null);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (status === 'error' && members.length === 0) {
    return <ErrorState title="We couldn't load the members" onRetry={() => fetchMembers(community.id)} />;
  }
  if (members.length === 0) {
    return status === 'ready' ? (
      <p className="py-4 text-sm text-ink-muted">No members yet. Be the first to join.</p>
    ) : (
      <Loader centered label="Loading members" className="min-h-40" />
    );
  }

  const shown = compact ? members.slice(0, 5) : members;
  return (
    <section aria-label="Members">
      <ul className="flex flex-col divide-y divide-line">
        {shown.map((member) => {
          const name = getFullName(member.student);
          const line = [member.student.branch?.shortName, member.student.semester?.label].filter(Boolean).join(' • ');
          const actions = compact ? [] : actionsFor(member, permissions, viewerRole);
          return (
            <li key={member.student.id} className="flex items-center gap-3 py-3">
              <Link to={profilePath(member.student.id)} className="shrink-0 rounded-xl" tabIndex={-1} aria-hidden="true">
                <Avatar src={member.student.avatarUrl} name={name} size="md" />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">
                  <Link to={profilePath(member.student.id)} className="hover:underline">{name}</Link>
                  {member.isYou && <span className="ml-1.5 font-medium text-ink-subtle">(you)</span>}
                </p>
                {!compact && member.student.college && <p className="truncate text-xs text-ink-muted">{member.student.college.name}</p>}
                {line && <p className="truncate text-xs text-ink-subtle">{line}</p>}
              </div>
              <Badge variant={ROLE_BADGE[member.role]} className="shrink-0">{ROLE_LABELS[member.role]}</Badge>
              {actions.length > 0 && (
                <PostMenu
                  label={`Manage ${name}`}
                  items={actions.map((action) => ({
                    ...action,
                    onSelect: action.id === 'remove' ? () => setRemoving(member) : () => setRole(member, action.role),
                  }))}
                />
              )}
            </li>
          );
        })}
      </ul>

      {!compact && pagination?.hasMore && (
        <Button variant="outline" className="mt-3 w-full" loading={status === 'loading'} onClick={() => fetchMembers(community.id, { more: true })}>
          Show more members
        </Button>
      )}

      <Modal
        open={Boolean(removing)}
        onClose={busy ? () => {} : () => setRemoving(null)}
        title="Remove this member?"
        description={removing ? `${getFullName(removing.student)} will leave ${community.name} and can't rejoin on their own.` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRemoving(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" leftIcon={UserMinus} loading={busy} onClick={confirmRemove}>
              Remove
            </Button>
          </>
        }
      />
    </section>
  );
}
