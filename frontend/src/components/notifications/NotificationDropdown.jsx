import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ArrowRight, CheckCheck } from 'lucide-react';
import { Link } from 'react-router';
import { Button, ErrorState } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useNotificationStore } from '@/store/notificationStore';
import { toast } from '@/store/toastStore';
import { LiveUpdatesHint } from './LiveUpdatesHint';
import { NotificationEmptyState } from './NotificationEmptyState';
import { NotificationItem } from './NotificationItem';
import { NotificationSkeleton } from './NotificationSkeleton';

/** The bell's panel on tablets and desktops: the most recent few, "Mark all as read" and a link to all. */
export function NotificationDropdown({ labelId, onClose }) {
  const recent = useNotificationStore((state) => state.recent);
  const status = useNotificationStore((state) => state.recentStatus);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const { fetchRecent, markAllAsRead } = useNotificationStore.getState();
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    fetchRecent();
  }, []);

  const markAll = async () => {
    setMarking(true);
    try {
      await markAllAsRead();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="flex max-h-[min(36rem,calc(100dvh-2rem))] flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 id={labelId} className="font-display text-base font-bold text-ink">
          Notifications
          {unreadCount > 0 && <span className="ml-2 text-sm font-semibold text-ink-subtle">{unreadCount} unread</span>}
        </h2>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" leftIcon={CheckCheck} loading={marking} onClick={markAll} className="-mr-2">
            Mark all as read
          </Button>
        )}
      </header>
      <LiveUpdatesHint className="px-4 pt-2" />

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {status === 'loading' && <NotificationSkeleton rows={4} />}
        {status === 'error' && <ErrorState title="Couldn't load notifications" description="Please check your connection and try again." onRetry={fetchRecent} className="py-8" />}
        {status === 'ready' && recent.length === 0 && <NotificationEmptyState compact />}
        {recent.length > 0 && (
          <ul className="flex flex-col gap-1" aria-label="Recent notifications">
            <AnimatePresence initial={false}>
              {recent.map((notification) => (
                <NotificationItem key={notification.id} notification={notification} compact onNavigate={onClose} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <footer className="border-t border-line p-2">
        <Link
          to={ROUTES.NOTIFICATIONS}
          onClick={onClose}
          className="flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-primary transition-colors hover:bg-primary-soft"
        >
          View all notifications
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </footer>
    </div>
  );
}
