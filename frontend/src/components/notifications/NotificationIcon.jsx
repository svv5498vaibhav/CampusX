import { Avatar } from '@/components/ui';
import { notificationPresentation } from '@/constants/notifications';
import { cn } from '@/utils/cn';
import { getFullName } from '@/utils/string';

/**
 * The student who acted (photo with a small type icon), or the type's icon for CampusX messages and
 * anything from the Anonymous Zone, which never has an actor.
 */
export function NotificationIcon({ notification, className }) {
  const { icon: Icon, tile } = notificationPresentation(notification.type);

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
