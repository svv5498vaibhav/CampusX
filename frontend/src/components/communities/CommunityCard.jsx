import { motion } from 'framer-motion';
import { BadgeCheck, UsersRound } from 'lucide-react';
import { Link } from 'react-router';
import { CommunityIcon } from '@/components/communities/CommunityIcon';
import { CommunityJoinButton } from '@/components/communities/CommunityJoinButton';
import { Badge } from '@/components/ui';
import { COMMUNITY_TYPE_STYLES, communityScopeLine, communityTypeLabel, memberCountLabel } from '@/constants/communities';
import { communityPath } from '@/constants/routes';
import { useCommunityStore } from '@/store/communityStore';
import { cn } from '@/utils/cn';

/**
 * A community in a grid: cover strip, icon, name, type, campus scope, short description, member
 * count, tags and Join / Joined. Only public community details are shown.
 */
export function CommunityCard({ community, reason, headingLevel = 'h3', preview = false }) {
  const options = useCommunityStore((state) => state.options);
  const style = COMMUNITY_TYPE_STYLES[community.type] ?? COMMUNITY_TYPE_STYLES['student-created'];
  const Heading = headingLevel;
  const scope = communityScopeLine(community);

  return (
    <motion.article
      whileHover={preview ? undefined : { y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-soft"
      data-community-id={community.id}
    >
      <div className={cn('relative h-16 shrink-0 bg-linear-to-br', style.cover)}>
        {community.coverImageUrl && <img src={community.coverImageUrl} alt="" loading="lazy" className="size-full object-cover" />}
        <div className="campus-grid absolute inset-0 opacity-40" aria-hidden="true" />
      </div>

      <div className="flex flex-1 flex-col px-4 pb-4">
        <div className="-mt-6 flex items-end justify-between gap-2">
          <CommunityIcon community={community} size="md" className="ring-4 ring-surface" />
          {reason && <span className="mb-0.5 truncate text-[11px] font-semibold text-primary">{reason}</span>}
        </div>

        <Heading className="mt-2 font-display text-base leading-snug font-bold text-ink">
          {preview ? community.name : (
            <Link to={communityPath(community.id)} className="hover:underline">
              {community.name}
            </Link>
          )}
        </Heading>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant={style.badge} icon={style.icon} className="px-2 py-0.5 text-[11px]">
            {communityTypeLabel(options, community.type)}
          </Badge>
          {community.official && (
            <Badge variant="outline" icon={BadgeCheck} className="px-2 py-0.5 text-[11px]">
              Official
            </Badge>
          )}
          {community.status === 'archived' && (
            <Badge variant="neutral" className="px-2 py-0.5 text-[11px]">
              Archived
            </Badge>
          )}
        </div>

        {scope && <p className="mt-2 line-clamp-1 text-xs font-medium text-ink-muted">{scope}</p>}
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-muted">{community.description}</p>

        {community.tags.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1" aria-label="Tags">
            {community.tags.slice(0, 3).map((tag) => (
              <li key={tag} className="rounded-md bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                #{tag}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <UsersRound className="size-3.5" aria-hidden="true" />
            {memberCountLabel(community.memberCount)}
          </span>
          {!preview && <CommunityJoinButton community={community} />}
        </div>
      </div>
    </motion.article>
  );
}
