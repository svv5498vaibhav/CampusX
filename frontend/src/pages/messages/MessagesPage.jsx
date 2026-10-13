import { useEffect, useRef } from 'react';
import { MessageCircle, MessagesSquare, Search } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ChatPanel } from '@/components/messages/ChatPanel';
import { ConversationList, ConversationSkeleton } from '@/components/messages/ConversationList';
import { Button, EmptyState, ErrorState } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useMessageStore } from '@/store/messageStore';
import { cn } from '@/utils/cn';

function Inbox({ activeId }) {
  const inboxIds = useMessageStore((state) => state.inboxIds);
  const conversations = useMessageStore((state) => state.conversations);
  const status = useMessageStore((state) => state.inboxStatus);
  const error = useMessageStore((state) => state.inboxError);
  const hasMore = useMessageStore((state) => state.inboxHasMore);
  const unreadCount = useMessageStore((state) => state.unreadCount);
  const fetchInbox = useMessageStore((state) => state.fetchInbox);
  const sentinelRef = useRef(null);
  const items = inboxIds.map((id) => conversations[id]).filter(Boolean);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || status !== 'ready' || !hasMore) return undefined;
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && fetchInbox({ more: true }), { rootMargin: '200px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [status, hasMore, fetchInbox]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 px-4 pt-5 pb-3">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Messages</h1>
        {unreadCount > 0 && <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary-soft-fg">{unreadCount} unread</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {status === 'loading' && (
          <ul aria-label="Loading conversations">
            {Array.from({ length: 6 }, (_, index) => (
              <ConversationSkeleton key={index} />
            ))}
          </ul>
        )}
        {status === 'error' && <ErrorState title="We couldn't load your messages" description={error} onRetry={() => fetchInbox()} />}
        {['ready', 'loading-more'].includes(status) && items.length === 0 && (
          <EmptyState
            icon={MessagesSquare}
            title="No messages yet"
            description="Open a classmate’s profile and tap Message to start a conversation."
            action={
              <Button as={Link} to={ROUTES.DISCOVER} variant="outline" leftIcon={Search}>
                Find students
              </Button>
            }
          />
        )}
        {items.length > 0 && <ConversationList conversations={items} activeId={activeId} />}
        {status === 'loading-more' && <ConversationSkeleton />}
        {hasMore && status === 'ready' && (
          <div ref={sentinelRef} className="flex justify-center py-2">
            <Button variant="ghost" size="sm" onClick={() => fetchInbox({ more: true })}>
              Show more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Direct messages: the inbox and one conversation. Side by side from `lg` up; on phones and tablets the inbox
 * is /messages and a conversation /messages/:id (with a back button). Fills the screen between the campus
 * navigation bars so the message box stays in reach.
 */
export default function MessagesPage() {
  const { conversationId } = useParams();
  useDocumentTitle('Messages');

  return (
    <div className="gutter-x mx-auto flex h-[calc(100dvh-9rem-env(safe-area-inset-bottom))] w-full max-w-7xl py-3 md:h-dvh md:py-6">
      <div className="flex min-h-0 w-full overflow-hidden rounded-3xl border border-line bg-surface shadow-soft">
        <aside className={cn('min-h-0 w-full flex-col border-line lg:flex lg:w-80 lg:shrink-0 lg:border-r xl:w-96', conversationId ? 'hidden' : 'flex')} aria-label="Inbox">
          <Inbox activeId={conversationId} />
        </aside>
        <div className={cn('min-h-0 min-w-0 flex-1 flex-col', conversationId ? 'flex' : 'hidden lg:flex')}>
          {conversationId ? (
            <ChatPanel key={conversationId} conversationId={conversationId} />
          ) : (
            <EmptyState className="m-auto" icon={MessageCircle} title="Your messages" description="Choose a conversation to read it, or start one from a student’s profile." />
          )}
        </div>
      </div>
    </div>
  );
}
