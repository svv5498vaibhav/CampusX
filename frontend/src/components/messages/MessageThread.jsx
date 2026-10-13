import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, CircleAlert, LoaderCircle, RotateCcw, Trash2 } from 'lucide-react';
import { dayLabel } from '@/constants/messages';
import { cn } from '@/utils/cn';

const URL_PATTERN = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;
// Messages from one student within this long of each other are grouped (one time label for the group).
const GROUP_GAP_MS = 5 * 60 * 1000;
// Within this many pixels of the bottom counts as "reading the latest" (new messages scroll into view).
const NEAR_BOTTOM_PX = 120;

const timeOf = (value) => new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Message text with web links made clickable (text stays text; React escapes everything else). */
function MessageText({ text, mine }) {
  return text.split(URL_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <a key={index} href={part} target="_blank" rel="noopener noreferrer nofollow ugc" className={cn('font-semibold break-all underline underline-offset-2', mine ? 'text-primary-fg' : 'text-primary')}>
        {part}
      </a>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

function Bubble({ message, showTime, seen, onRetry, onDiscard }) {
  const mine = message.isMine;
  const failed = message.status === 'failed';
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}
      data-message-id={message.id}
      data-message-status={message.status ?? 'sent'}
    >
      <div
        className={cn(
          'max-w-[min(85%,34rem)] rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap',
          mine ? 'rounded-br-lg bg-primary text-primary-fg' : 'rounded-bl-lg bg-surface-muted text-ink',
          message.status === 'sending' && 'opacity-70',
          failed && 'bg-danger-soft text-danger-fg ring-1 ring-danger/40',
        )}
      >
        <span className="sr-only">{mine ? 'You' : 'They'} said: </span>
        <MessageText text={message.text} mine={mine && !failed} />
      </div>
      {failed ? (
        <div className="mt-1 flex items-center gap-2 text-xs text-danger-fg" role="alert">
          <CircleAlert className="size-3.5" aria-hidden="true" />
          <span>{message.error || 'Not sent.'}</span>
          <button type="button" onClick={() => onRetry(message.clientId)} className="inline-flex items-center gap-1 rounded-md px-1 font-semibold underline-offset-2 hover:underline">
            <RotateCcw className="size-3" aria-hidden="true" /> Retry
          </button>
          <button type="button" onClick={() => onDiscard(message.clientId)} className="inline-flex items-center gap-1 rounded-md px-1 font-semibold underline-offset-2 hover:underline" aria-label="Remove unsent message">
            <Trash2 className="size-3" aria-hidden="true" />
          </button>
        </div>
      ) : message.status === 'sending' ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-ink-subtle">
          <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> Sending…
        </p>
      ) : (
        (showTime || seen) && (
          <p className="mt-1 px-1 text-[11px] text-ink-subtle">
            {showTime && <time dateTime={message.createdAt}>{timeOf(message.createdAt)}</time>}
            {seen && showTime && ' · '}
            {seen && <span className="font-semibold text-primary">Seen</span>}
          </p>
        )
      )}
    </motion.li>
  );
}

/**
 * A conversation's messages, oldest at the top. Opens at the latest message; earlier ones load when you
 * scroll to the top (the view stays where it was). New messages scroll into view while you're at the bottom;
 * otherwise a "New messages" button appears. "Seen" sits under your latest message once the other student
 * has read it.
 */
export function MessageThread({ thread, otherLastReadId, onLoadOlder, onRetry, onDiscard, emptyState }) {
  const scrollRef = useRef(null);
  const topRef = useRef(null);
  const nearBottom = useRef(true);
  const previous = useRef({ count: 0, firstId: null, lastId: null, height: 0 });
  const [unseenBelow, setUnseenBelow] = useState(false);
  const messages = thread.messages;

  // Keep the view steady when older messages are added above, follow new ones at the bottom.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const before = previous.current;
    const firstId = messages[0]?.id ?? null;
    const last = messages.at(-1);
    if (before.count === 0 && messages.length) {
      element.scrollTop = element.scrollHeight;
    } else if (firstId !== before.firstId && before.firstId && messages.length > before.count && last?.id === before.lastId) {
      element.scrollTop += element.scrollHeight - before.height;
    } else if (last && last.id !== before.lastId) {
      if (nearBottom.current || last.isMine) element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
      else setUnseenBelow(true);
    }
    previous.current = { count: messages.length, firstId, lastId: last?.id ?? null, height: element.scrollHeight };
  }, [messages]);

  // Earlier messages load when the top comes into view.
  useEffect(() => {
    const top = topRef.current;
    if (!top || !thread.hasMore) return undefined;
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && onLoadOlder(), { root: scrollRef.current, rootMargin: '200px 0px 0px 0px' });
    observer.observe(top);
    return () => observer.disconnect();
  }, [thread.hasMore, onLoadOlder]);

  const onScroll = () => {
    const element = scrollRef.current;
    nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM_PX;
    if (nearBottom.current) setUnseenBelow(false);
  };

  const sent = messages.filter((message) => message.isMine && !message.status);
  const lastMine = sent.at(-1);
  const seenId = lastMine && otherLastReadId && lastMine.id <= otherLastReadId ? lastMine.id : null;

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-3 py-4 sm:px-5" role="log" aria-label="Messages" aria-live="off" tabIndex={0}>
        <div ref={topRef} />
        {thread.loadingOlder && (
          <div className="flex justify-center py-2" role="status">
            <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
            <span className="sr-only">Loading earlier messages</span>
          </div>
        )}
        {thread.hasMore && !thread.loadingOlder && (
          <div className="flex justify-center pb-3">
            <button type="button" onClick={onLoadOlder} className="rounded-full px-3 py-1 text-xs font-semibold text-ink-muted hover:bg-surface-muted hover:text-ink">
              Load earlier messages
            </button>
          </div>
        )}
        {messages.length === 0 ? (
          emptyState
        ) : (
          <ol className="flex flex-col gap-1.5">
            {messages.map((message, index) => {
              const prev = messages[index - 1];
              const next = messages[index + 1];
              const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
              const endsGroup = !next || next.isMine !== message.isMine || new Date(next.createdAt) - new Date(message.createdAt) > GROUP_GAP_MS;
              return (
                <Fragment key={message.clientId ?? message.id}>
                  {newDay && (
                    <li className="my-3 flex justify-center">
                      <span className="rounded-full bg-surface-muted px-3 py-1 text-[11px] font-semibold text-ink-muted">{dayLabel(message.createdAt)}</span>
                    </li>
                  )}
                  <Bubble message={message} showTime={endsGroup} seen={message.id === seenId} onRetry={onRetry} onDiscard={onDiscard} />
                  {endsGroup && next && <li aria-hidden="true" className="h-1.5" />}
                </Fragment>
              );
            })}
          </ol>
        )}
      </div>

      <AnimatePresence>
        {unseenBelow && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onClick={() => {
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
              setUnseenBelow(false);
            }}
            className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-fg shadow-lift"
          >
            <ArrowDown className="size-3.5" aria-hidden="true" /> New messages
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
