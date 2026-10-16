import { Avatar } from '@/components/ui';
import { eliteTierOf } from '@/constants/elite';
import { notificationPresentation } from '@/constants/notifications';
import { cn } from '@/utils/cn';
import { getFullName } from '@/utils/string';

/**
 * An elite rank token change: the token's own emblem and colours (dimmed when it was lost), with one soft
 * shine when an unread one appears. No other motion.
 */
function EliteTokenIcon({ notification, className }) {
  const tier = eliteTierOf(notification.metadata?.tier) ?? eliteTierOf(notification.metadata?.previousTier);
  if (!tier) return null;
  const lost = !notification.metadata?.tier;
  const Icon = tier.icon;
  return (
    <span
      className={cn('grid size-10 shrink-0 place-items-center rounded-2xl', `elite-tier--${tier.id}`, !notification.isRead && 'elite-sweep', lost && 'opacity-60 grayscale-[40%]', className)}
      style={{ background: 'var(--elite-emblem-bg)', color: 'var(--elite-emblem-ink)' }}
      data-elite-note={tier.id}
    >
      <Icon className="size-5" strokeWidth={2.2} aria-hidden="true" />
    </span>
  );
}

/**
 * The student who acted (photo with a small type icon), or the type's icon for CampusX messages and
 * anything from the Anonymous Zone, which never has an actor.
 */
export function NotificationIcon({ notification, className }) {
  const { icon: Icon, tile } = notificationPresentation(notification.type);
  if (notification.type === 'ELITE_RANK_CHANGED' && eliteTierOf(notification.metadata?.tier ?? notification.metadata?.previousTier)) {
    return <EliteTokenIcon notification={notification} className={className} />;
  }

  if (notification.actor) {
    const name = getFullName(notification.actor);
    return (
      <span className={cn('relative shrink-0', className)}>
        <Avatar name={name} src={notification.actor.avatarUrl} size="md" shape="circle" />
        <span className={cn('absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full ring-2 ring-surface', tile)}>
          <Icon className="size-3" aria-hidden="true" />
        </span>
      </span>
    );
  }

  return (
    <span className={cn('grid size-10 shrink-0 place-items-center rounded-2xl', tile, className)}>
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}
