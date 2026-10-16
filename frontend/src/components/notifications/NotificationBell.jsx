import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { bellLabel } from '@/constants/notifications';
import { ROUTES } from '@/constants/routes';
import { useNotificationStore } from '@/store/notificationStore';
import { cn } from '@/utils/cn';
import { NotificationBadge } from './NotificationBadge';
import { NotificationDropdown } from './NotificationDropdown';

/** Reads out live arrivals to screen readers ("New notification: New like. Aarav liked your post"). */
function ArrivalAnnouncer() {
  const lastArrival = useNotificationStore((state) => state.lastArrival);
  return (
    <span className="sr-only" aria-live="polite" aria-atomic="true">
      {lastArrival ? `New notification: ${lastArrival.title}. ${lastArrival.message}` : ''}
    </span>
  );
}

/**
 * The notification bell with its unread badge.
 *   topbar   phones: goes to the notifications page
 *   sidebar  tablets and desktops: opens the dropdown panel next to the sidebar
 */
export function NotificationBell({ variant = 'sidebar' }) {
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const { pathname } = useLocation();
  const onPage = pathname === ROUTES.NOTIFICATIONS;
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();
  const labelId = useId();

  // Any navigation closes the panel.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onPointerDown = (event) => {
      if (panelRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  if (variant === 'topbar') {
    return (
      <>
        <Link
          to={ROUTES.NOTIFICATIONS}
          aria-label={bellLabel(unreadCount)}
          title="Notifications"
          className={cn(
            'relative grid size-10 place-items-center rounded-xl transition-colors',
            onPage ? 'bg-primary-soft text-primary-soft-fg' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
          )}
        >
          <Bell className="size-5" aria-hidden="true" />
          <NotificationBadge count={unreadCount} className="absolute -top-0.5 -right-0.5" />
        </Link>
        <ArrivalAnnouncer />
      </>
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={bellLabel(unreadCount)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Notifications"
        className={cn(
          'relative flex h-12 w-full items-center justify-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors lg:justify-start lg:px-4',
          open || onPage ? 'bg-primary-soft text-primary-soft-fg' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
        )}
      >
        <span className="relative">
          <Bell className="size-5 shrink-0" aria-hidden="true" />
          <NotificationBadge count={unreadCount} className="absolute -top-2 -right-2.5 lg:hidden" />
        </span>
        <span className="hidden lg:inline" aria-hidden="true">Notifications</span>
        <NotificationBadge count={unreadCount} className="ml-auto hidden lg:grid" />
      </button>
      <ArrivalAnnouncer />

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-labelledby={labelId}
              tabIndex={-1}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.16 }}
              className="fixed top-4 left-[5.75rem] z-40 w-[min(24rem,calc(100vw-7rem))] glass-overlay overflow-hidden rounded-3xl border border-line bg-overlay shadow-lift outline-none lg:left-[16.75rem]"
            >
              <NotificationDropdown labelId={labelId} onClose={() => setOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
