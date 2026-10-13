import { motion } from 'framer-motion';
import { Link } from 'react-router';
import { Avatar } from '@/components/ui';
import { formatUnreadMessages, shortTime } from '@/constants/messages';
import { conversationPath } from '@/constants/routes';
import { cn } from '@/utils/cn';
import { getFullName } from '@/utils/string';

export function ConversationSkeleton() {
  return (
    <li className="flex items-center gap-3 px-3 py-3" aria-hidden="true">
      <span className="size-14 shrink-0 animate-pulse rounded-full bg-surface-muted" />
      <span className="flex-1 space-y-2">
        <span className="block h-3.5 w-1/2 animate-pulse rounded bg-surface-muted" />
        <span className="block h-3 w-4/5 animate-pulse rounded bg-surface-muted" />
      </span>
    </li>
  );
}

/** One inbox row: the other student, the latest message ("You: …" for your own), time and unread count. */
function ConversationRow({ conversation, active, index }) {
  const name = getFullName(conversation.participant);
  const unread = conversation.unreadCount > 0;
  const preview = conversation.lastMessage ? `${conversation.lastMessage.isMine ? 'You: ' : ''}${conversation.lastMessage.preview}` : 'No messages yet';
  return (
    <motion.li layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: index < 8 ? index * 0.025 : 0 }}>
      <Link
        to={conversationPath(conversation.id)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors',
          active ? 'bg-primary-soft' : 'hover:bg-surface-muted',
        )}
        data-conversation-id={conversation.id}
      >
        <Avatar src={conversation.participant.avatarUrl} name={name} size="lg" shape="circle" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn('truncate text-sm text-ink', unread ? 'font-bold' : 'font-semibold')}>{name}</span>
            {conversation.lastMessageAt && (
              <time dateTime={conversation.lastMessageAt} className={cn('shrink-0 text-xs', unread ? 'font-semibold text-primary' : 'text-ink-subtle')}>
                {shortTime(conversation.lastMessageAt)}
              </time>
            )}
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className={cn('truncate text-sm', unread ? 'font-semibold text-ink' : 'text-ink-muted')}>{preview}</span>
            {unread && (
              <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-fg tabular-nums">
                {formatUnreadMessages(conversation.unreadCount)}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </span>
        </span>
      </Link>
    </motion.li>
  );
}

export function ConversationList({ conversations, activeId }) {
  return (
    <ul className="flex flex-col gap-0.5" aria-label="Conversations">
      {conversations.map((conversation, index) => (
        <ConversationRow key={conversation.id} conversation={conversation} active={conversation.id === activeId} index={index} />
      ))}
    </ul>
  );
}
