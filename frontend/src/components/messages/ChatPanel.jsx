import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Ban, Flag, Lock, MessageCircleDashed, ShieldCheck, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { PostMenu } from '@/components/feed/PostMenu';
import { ReportModal } from '@/components/safety/ReportModal';
import { BlockDialog } from '@/components/social/BlockDialog';
import { Avatar, Button, EmptyState, ErrorState, Loader } from '@/components/ui';
import { profilePath, ROUTES } from '@/constants/routes';
import { useFollowStore } from '@/store/followStore';
import { useMessageStore } from '@/store/messageStore';
import { getFullName } from '@/utils/string';
import { MessageComposer } from './MessageComposer';
import { MessageThread } from './MessageThread';

const EMPTY_THREAD = { messages: [], status: 'idle', hasMore: false, loadingOlder: false };

/** Reads out messages that arrive while the conversation is open ("Asha Rao: See you at 5"). */
function ArrivalAnnouncer({ messages, name }) {
  const last = messages.at(-1);
  const [announced, setAnnounced] = useState('');
  useEffect(() => {
    if (last && !last.isMine && !last.status) setAnnounced(`${name}: ${last.text}`);
  }, [last?.id]);
  return (
    <span className="sr-only" aria-live="polite" aria-atomic="true">
      {announced}
    </span>
  );
}

/**
 * One conversation: who it's with, the messages and the message box. Opening it (and every message that
 * arrives while it's on screen) marks it read. When the other student can't be messaged (a block, or their
 * account isn't active) the box is replaced by a short explanation; the history stays readable.
 */
export function ChatPanel({ conversationId }) {
  const navigate = useNavigate();
  const conversation = useMessageStore((state) => state.conversations[conversationId]);
  const thread = useMessageStore((state) => state.threads[conversationId]) ?? EMPTY_THREAD;
  const store = useMessageStore.getState;
  const participantId = conversation?.participant?.id ?? null;
  const relation = useFollowStore((state) => (participantId ? state.relations[participantId] : null));
  const [dialog, setDialog] = useState(null); // 'block' | 'report' | null
  const name = conversation ? getFullName(conversation.participant) : '';

  useEffect(() => {
    store().setActive(conversationId);
    store().loadConversation(conversationId);
    return () => store().setActive(null);
  }, [conversationId]);

  // Whether the viewer blocked them (for the menu and the notice under the messages).
  useEffect(() => {
    if (participantId) useFollowStore.getState().refreshRelationship(participantId);
  }, [participantId]);

  // Read while it's on screen: when it loads, when something new arrives, when the tab comes back.
  const lastMessageId = conversation?.lastMessage?.id;
  useEffect(() => {
    if (thread.status !== 'ready') return undefined;
    const markIfVisible = () => document.visibilityState === 'visible' && store().markRead(conversationId);
    markIfVisible();
    document.addEventListener('visibilitychange', markIfVisible);
    return () => document.removeEventListener('visibilitychange', markIfVisible);
  }, [conversationId, thread.status, lastMessageId]);

  const loadOlder = useCallback(() => store().loadOlder(conversationId), [conversationId]);
  const retry = useCallback((clientId) => store().retry(conversationId, clientId), [conversationId]);
  const discard = useCallback((clientId) => store().discardFailed(conversationId, clientId), [conversationId]);

  if (thread.status === 'not-found') {
    return (
      <EmptyState
        className="m-auto"
        icon={MessageCircleDashed}
        title="We couldn't find that conversation"
        description="It may have been removed, or the link isn't yours to open."
        action={
          <Button as={Link} to={ROUTES.MESSAGES} variant="outline">
            Back to messages
          </Button>
        }
      />
    );
  }
  if (thread.status === 'error' && !conversation) {
    return <ErrorState className="m-auto" title="We couldn't open this conversation" description={thread.error} onRetry={() => store().loadConversation(conversationId)} />;
  }
  if (!conversation) return <Loader centered label="Opening conversation" className="m-auto min-h-0" />;

  const unavailable = conversation.participant.unavailable;
  const blockedByYou = Boolean(relation?.blockedByYou);
  const menuItems = [
    ...(!unavailable ? [{ id: 'profile', label: 'View profile', icon: UserRound, onSelect: () => navigate(profilePath(participantId)) }] : []),
    ...(!unavailable ? [{ id: 'block', label: blockedByYou ? 'Unblock' : 'Block', icon: blockedByYou ? ShieldCheck : Ban, onSelect: () => setDialog('block'), danger: !blockedByYou }] : []),
    ...(!unavailable ? [{ id: 'report', label: 'Report', icon: Flag, onSelect: () => setDialog('report') }] : []),
  ];

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={`Conversation with ${name}`}>
      <header className="flex items-center gap-3 border-b border-line px-3 py-3 sm:px-4">
        <Link to={ROUTES.MESSAGES} className="grid size-10 shrink-0 place-items-center rounded-xl text-ink-muted hover:bg-surface-muted hover:text-ink lg:hidden" aria-label="Back to all messages">
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        {unavailable ? (
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar name={name} size="md" shape="circle" />
            <span className="truncate font-display text-base font-bold text-ink">{name}</span>
          </span>
        ) : (
          <Link to={profilePath(participantId)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl">
            <Avatar src={conversation.participant.avatarUrl} name={name} size="md" shape="circle" />
            <span className="min-w-0">
              <span className="block truncate font-display text-base font-bold text-ink hover:underline">{name}</span>
              {(conversation.participant.branch || conversation.participant.college) && (
                <span className="block truncate text-xs text-ink-muted">
                  {[conversation.participant.branch?.shortName, conversation.participant.semester?.label, conversation.participant.college?.shortName].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
          </Link>
        )}
        {menuItems.length > 0 && <PostMenu items={menuItems} label={`Options for your conversation with ${name}`} />}
      </header>

      {thread.status === 'loading' && thread.messages.length === 0 ? (
        <Loader centered label="Loading messages" className="min-h-0 flex-1" />
      ) : thread.status === 'error' && thread.messages.length === 0 ? (
        <ErrorState className="m-auto" title="We couldn't load the messages" description={thread.error} onRetry={() => store().loadConversation(conversationId)} />
      ) : (
        <MessageThread
          thread={thread}
          otherLastReadId={conversation.otherLastReadId}
          onLoadOlder={loadOlder}
          onRetry={retry}
          onDiscard={discard}
          emptyState={
            <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
              <Avatar src={conversation.participant.avatarUrl} name={name} size="xl" shape="circle" />
              <p className="mt-4 font-display text-lg font-bold text-ink">{name}</p>
              <p className="mt-1 max-w-sm text-sm text-ink-muted">This is the start of your conversation. Messages are private between the two of you.</p>
            </div>
          }
        />
      )}
      <ArrivalAnnouncer messages={thread.messages} name={name} />

      {conversation.canMessage ? (
        <MessageComposer key={conversationId} onSend={(text) => store().send(conversationId, text)} autoFocus />
      ) : (
        <div className="flex flex-col items-center gap-3 border-t border-line bg-surface-muted/60 px-4 py-4 text-center text-sm text-ink-muted sm:flex-row sm:justify-center sm:text-left" role="note">
          <Lock className="size-4 shrink-0" aria-hidden="true" />
          {blockedByYou ? (
            <>
              <span>You blocked {name}. Unblock them to send messages again.</span>
              <Button size="sm" variant="outline" onClick={() => setDialog('block')}>
                Unblock
              </Button>
            </>
          ) : (
            <span>{unavailable ? 'This student isn’t available on CampusX right now.' : `You can’t send messages to ${name}.`} Earlier messages stay here.</span>
          )}
        </div>
      )}

      {!unavailable && (
        <>
          <BlockDialog open={dialog === 'block'} onClose={() => setDialog(null)} userId={participantId} name={name} onChanged={() => store().refreshConversation(conversationId)} />
          <ReportModal target={{ type: 'user', id: participantId }} open={dialog === 'report'} onClose={() => setDialog(null)} />
        </>
      )}
    </section>
  );
}
