import { BellRing, CheckCheck } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import { cn } from '@/utils/cn';

/** Nothing to show: no notifications yet, or nothing unread. */
export function NotificationEmptyState({ filter = 'all', compact = false, className }) {
  const unread = filter === 'unread';
  return (
    <EmptyState
      icon={unread ? CheckCheck : BellRing}
      title={unread ? "You're all caught up" : 'No notifications yet'}
      description={
        unread
          ? 'New likes, comments and campus updates will show up here.'
          : 'When students like or comment on your posts, or your communities and opportunities have news, you’ll see it here.'
      }
      className={cn(compact ? 'py-8' : 'rounded-3xl border border-dashed border-line-strong', className)}
    />
  );
}
