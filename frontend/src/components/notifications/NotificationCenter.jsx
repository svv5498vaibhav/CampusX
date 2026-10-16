import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCheck, Trash2 } from 'lucide-react';
import { Button, ErrorState, Modal } from '@/components/ui';
import { useNotificationStore } from '@/store/notificationStore';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';
import { LiveUpdatesHint } from './LiveUpdatesHint';
import { NotificationEmptyState } from './NotificationEmptyState';
import { NotificationItem } from './NotificationItem';
import { NotificationSkeleton } from './NotificationSkeleton';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
];

/**
 * The full list on /notifications: All / Unread tabs, "Mark all as read", "Clear read" and paging.
 * Opening the page doesn't mark anything read; a notification is read once it is opened (or marked).
 */
export function NotificationCenter() {
  const items = useNotificationStore((state) => state.items);
  const filter = useNotificationStore((state) => state.filter);
  const status = useNotificationStore((state) => state.status);
  const pagination = useNotificationStore((state) => state.pagination);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const { fetchNotifications, markAllAsRead, deleteRead } = useNotificationStore.getState();
  const [busy, setBusy] = useState(null); // 'mark' | 'clear'
  const [confirmingClear, setConfirmingClear] = useState(false);
  const tabRefs = useRef({});
  const hasRead = items.some((item) => item.isRead);

  useEffect(() => {
    fetchNotifications({ filter: useNotificationStore.getState().filter });
  }, []);

  const selectTab = (id) => {
    if (id !== filter) fetchNotifications({ filter: id });
  };
  const onTabKeyDown = (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = TABS[(TABS.findIndex((tab) => tab.id === filter) + step + TABS.length) % TABS.length].id;
    selectTab(next);
    tabRefs.current[next]?.focus();
  };

  const run = async (kind, action, done) => {
    setBusy(kind);
    try {
      await action();
      if (done) toast.success(done);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label="Notifications">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Show" onKeyDown={onTabKeyDown} className="flex gap-1 rounded-2xl bg-surface-muted p-1">
          {TABS.map((tab) => {
            const selected = tab.id === filter;
            return (
              <button
                key={tab.id}
                ref={(node) => { tabRefs.current[tab.id] = node; }}
                type="button"
                role="tab"
                id={`notifications-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls="notifications-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(tab.id)}
                className={cn('relative isolate flex h-9 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors', selected ? 'text-ink' : 'text-ink-muted hover:text-ink')}
              >
                {selected && <motion.span layoutId="notifications-tab" className="absolute inset-0 -z-10 rounded-xl bg-surface shadow-soft" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                {tab.label}
                {tab.id === 'unread' && unreadCount > 0 && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] leading-none font-bold text-primary-fg tabular-nums">{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" leftIcon={CheckCheck} disabled={!unreadCount} loading={busy === 'mark'} onClick={() => run('mark', markAllAsRead, "You're all caught up")}>
            Mark all as read
          </Button>
          {filter === 'all' && hasRead && (
            <Button variant="ghost" size="sm" leftIcon={Trash2} onClick={() => setConfirmingClear(true)}>
              Clear read
            </Button>
          )}
        </div>
      </div>
      <LiveUpdatesHint className="mt-3" />

      <div id="notifications-panel" role="tabpanel" aria-labelledby={`notifications-tab-${filter}`} className="mt-4">
        {status === 'loading' && items.length === 0 && <NotificationSkeleton rows={5} />}
        {status === 'error' && items.length === 0 && <ErrorState title="We couldn't load your notifications" onRetry={() => fetchNotifications()} />}
        {status === 'ready' && items.length === 0 && <NotificationEmptyState filter={filter} />}
        {items.length > 0 && (
          <ul className="flex flex-col gap-1 glass-card rounded-3xl border border-line bg-surface p-2" aria-label={filter === 'unread' ? 'Unread notifications' : 'All notifications'}>
            <AnimatePresence initial={false}>
              {items.map((notification) => (
                <NotificationItem key={notification.id} notification={notification} />
              ))}
            </AnimatePresence>
          </ul>
        )}
        {pagination?.hasMore && items.length > 0 && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" loading={status === 'loading-more'} onClick={() => fetchNotifications({ more: true })}>
              Load more
            </Button>
          </div>
        )}
      </div>

      <Modal
        open={confirmingClear}
        onClose={() => setConfirmingClear(false)}
        title="Clear read notifications?"
        description="Notifications you've already read will be removed. Unread ones stay."
        size="sm"
        footer={
          <>
            <Button variant="outline" fullWidth onClick={() => setConfirmingClear(false)}>Cancel</Button>
            <Button
              variant="danger"
              fullWidth
              leftIcon={Trash2}
              loading={busy === 'clear'}
              onClick={() => run('clear', deleteRead, 'Read notifications cleared').then(() => setConfirmingClear(false))}
            >
              Clear read
            </Button>
          </>
        }
      />
    </section>
  );
}
