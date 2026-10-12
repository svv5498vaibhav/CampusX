import { useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router';
import { notificationLink } from '@/constants/notifications';
import { useNow } from '@/hooks/useNow';
import { useNotificationStore } from '@/store/notificationStore';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';
import { formatDateTime, formatRelativeTime } from '@/utils/time';
import { NotificationIcon } from './NotificationIcon';

const actionButton = 'relative z-10 grid size-8 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-surface hover:text-ink focus-visible:bg-surface';

/**
 * One notification. Opening it marks it read and goes where it points (the whole row is the link);
 * unread ones have a light-green background, a dot and an "Unread" label for screen readers.
 * `compact` (the bell's dropdown) clamps the text and leaves out the delete button.
 */
export function NotificationItem({ notification, compact = false, onNavigate }) {
  const now = useNow();
  const [deleting, setDeleting] = useState(false);
  const { markAsRead, deleteNotification } = useNotificationStore.getState();
  const unread = !notification.isRead;
  const to = notificationLink(notification);
  const gone = notification.entity?.available === false;

  const open = () => {
    if (unread) markAsRead(notification.id);
    if (to) onNavigate?.();
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteNotification(notification.id);
    } catch (error) {
      toast.error(error.message);
      setDeleting(false);
    }
  };

  const content = (
    <>
      <span className="flex items-center gap-2">
        <span className={cn('text-sm text-ink', unread ? 'font-bold' : 'font-semibold')}>{notification.title}</span>
        {unread && <span className="sr-only">(unread)</span>}
      </span>
      <span className={cn('mt-0.5 block text-sm leading-snug break-words text-ink-muted', compact && 'line-clamp-2')}>{notification.message}</span>
      {gone && <span className="mt-1 block text-xs text-ink-subtle italic">This content is no longer available.</span>}
      <time dateTime={notification.eventAt} title={formatDateTime(notification.eventAt)} className="mt-1 block text-xs text-ink-subtle">
        {formatRelativeTime(notification.eventAt, now)}
      </time>
    </>
  );
  // The link (or button) stretches over the whole row; the small action buttons sit above it.
  const mainClass = 'block min-w-0 flex-1 text-left outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-focus';

  return (
    <motion.li layout="position" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
      <div className={cn('relative flex items-start gap-3 rounded-2xl px-3 py-3 transition-colors', unread ? 'bg-primary-soft/55 hover:bg-primary-soft/80' : 'hover:bg-surface-muted')} data-unread={unread || undefined}>
        <NotificationIcon notification={notification} />
        {to ? (
          <Link to={to} onClick={open} className={mainClass}>
            {content}
          </Link>
        ) : (
          <button type="button" onClick={open} className={mainClass}>
            {content}
          </button>
        )}
        {/* Stacked on phones so the text keeps its width; in a row from `sm`. */}
        <div className={cn('flex shrink-0 items-center gap-0.5', !compact && 'flex-col-reverse sm:flex-row')}>
          {unread && !compact && (
            <button type="button" onClick={() => markAsRead(notification.id)} className={actionButton} aria-label={`Mark as read: ${notification.title}`} title="Mark as read">
              <Check className="size-4" aria-hidden="true" />
            </button>
          )}
          {!compact && (
            <button type="button" onClick={remove} disabled={deleting} className={cn(actionButton, 'hover:text-danger-fg disabled:opacity-50')} aria-label={`Delete notification: ${notification.title}`} title="Delete">
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          )}
          {unread && <span className={cn('size-2.5 rounded-full bg-primary', compact ? 'ml-1 mt-1.5' : 'my-1.5 sm:my-0 sm:ml-1')} aria-hidden="true" />}
        </div>
      </div>
    </motion.li>
  );
}
