import { formatUnread } from '@/constants/notifications';
import { cn } from '@/utils/cn';

/**
 * The unread count on the bell. Decorative: the bell's own label already says "4 unread", so the
 * number is never the only way the state is told.
 */
export function NotificationBadge({ count, className }) {
  if (!count) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] leading-none font-bold text-white ring-2 ring-surface tabular-nums',
        className,
      )}
    >
      {formatUnread(count)}
    </span>
  );
}
