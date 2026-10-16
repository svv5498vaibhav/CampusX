import { BadgeCheck, Check, Lock, Plus, UsersRound } from 'lucide-react';
import { Link } from 'react-router';
import { CommunityIcon } from '@/components/communities/CommunityIcon';
import { Badge, Button } from '@/components/ui';
import { COMMUNITY_TYPE_STYLES, communityScopeLine, memberCountLabel } from '@/constants/communities';
import { labelOf, searchResultPath } from '@/constants/search';
import { useCommunityStore } from '@/store/communityStore';
import { useSearchStore } from '@/store/searchStore';
import { toast } from '@/store/toastStore';

/**
 * A community in search results: icon, name, description, type, members and campus scope, with
 * "View Community" and Join. Whether the student may join is decided by the server (canJoin), and the
 * join request is checked again there. Discover adds a recommendation `reason`, a `menu` and `onJoined`
 * (all optional; without `onJoined` a join updates the search results).
 */
export function CommunitySearchCard({ community, headingLevel = 'h3', reason, menu, onJoined }) {
  const types = useSearchStore((state) => state.options?.filters.communityTypes);
  const joining = useCommunityStore((state) => Boolean(state.busy[`${community.id}:join`]));
  const Heading = headingLevel;
  const style = COMMUNITY_TYPE_STYLES[community.type] ?? COMMUNITY_TYPE_STYLES['student-created'];
  const path = searchResultPath('communities', community);
  const scope = communityScopeLine(community);
  const isMember = community.membership?.status === 'active';

  const join = async () => {
    try {
      const updated = await useCommunityStore.getState().joinCommunity(community.id);
      if (updated) (onJoined ?? ((joined) => useSearchStore.getState().patchResult('communities', community.id, joined)))(updated);
      toast.success('Joined community!');
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <article className="flex h-full flex-col glass-card rounded-3xl border border-line bg-surface p-4 shadow-soft transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-lift" data-search-result="community" data-community-id={community.id}>
      <div className="flex items-start gap-3">
        <CommunityIcon community={community} size="md" />
        <div className="min-w-0 flex-1">
          <Heading className="font-display text-base leading-snug font-bold text-ink">
            <Link to={path} className="hover:underline">{community.name}</Link>
          </Heading>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={style.badge} icon={style.icon} className="px-2 py-0.5 text-[11px]">{labelOf(types, community.type)}</Badge>
            {community.official && <Badge variant="outline" icon={BadgeCheck} className="px-2 py-0.5 text-[11px]">Official</Badge>}
          </div>
        </div>
        {menu && <div className="-mt-1.5 -mr-2 shrink-0">{menu}</div>}
      </div>

      {scope && <p className="mt-3 line-clamp-1 text-xs font-medium text-ink-muted">{scope}</p>}
      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-muted">{community.description}</p>

      <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
        <UsersRound className="size-3.5" aria-hidden="true" />
        {memberCountLabel(community.memberCount)}
      </p>

      {reason && <div className="mt-3">{reason}</div>}

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Button as={Link} to={path} variant="outline" size="sm" className="flex-1" aria-label={`View community: ${community.name}`}>
          View Community
        </Button>
        {isMember ? (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary-soft px-3 text-sm font-semibold text-primary-soft-fg">
            <Check className="size-4" aria-hidden="true" /> Joined
          </span>
        ) : community.canJoin ? (
          <Button size="sm" leftIcon={Plus} loading={joining} onClick={join} aria-label={`Join ${community.name}`}>
            Join
          </Button>
        ) : (
          community.joinBlockedReason && (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-ink-subtle" title={community.joinBlockedReason}>
              <Lock className="size-3.5" aria-hidden="true" />
              <span className="sr-only">{community.joinBlockedReason}</span>
              <span aria-hidden="true">Can't join</span>
            </span>
          )
        )}
      </div>
    </article>
  );
}
