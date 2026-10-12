import { useEffect, useState } from 'react';
import { useNotificationStore } from '@/store/notificationStore';
import { cn } from '@/utils/cn';

const DELAY_MS = 4000;

/**
 * A quiet "Live updates reconnecting…" line, shown only when the live connection has been down for a
 * few seconds (short blips stay invisible). Notifications keep working without it.
 */
export function LiveUpdatesHint({ className }) {
  const reconnecting = useNotificationStore((state) => state.liveStatus === 'reconnecting');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!reconnecting) {
      setVisible(false);
      return undefined;
    }
    const timer = setTimeout(() => setVisible(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, [reconnecting]);

  if (!visible) return null;
  return (
    <p role="status" className={cn('flex items-center gap-2 text-xs text-ink-subtle', className)}>
      <span className="size-1.5 animate-pulse rounded-full bg-accent-fg" aria-hidden="true" />
      Live updates reconnecting…
    </p>
  );
}
