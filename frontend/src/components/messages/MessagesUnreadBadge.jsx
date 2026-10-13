import { NotificationBadge } from '@/components/notifications/NotificationBadge';
import { messagesLabel } from '@/constants/messages';
import { useMessageStore } from '@/store/messageStore';

/**
 * The unread conversation count on the Messages link (sidebar, Explore sheet). The number is decorative;
 * the sr-only text says the same for screen readers.
 */
export function MessagesUnreadBadge({ className }) {
  const unreadCount = useMessageStore((state) => state.unreadCount);
  if (!unreadCount) return null;
  return (
    <>
      <NotificationBadge count={unreadCount} className={className} />
      <span className="sr-only">{messagesLabel(unreadCount).replace('Messages', '')}</span>
    </>
  );
}

/** A small dot (e.g. on the mobile Explore button) while any conversation has unread messages. */
export function MessagesUnreadDot({ className }) {
  const unreadCount = useMessageStore((state) => state.unreadCount);
  if (!unreadCount) return null;
  return <span aria-hidden="true" className={`absolute size-2.5 rounded-full bg-danger ring-2 ring-canvas ${className ?? ''}`} />;
}
