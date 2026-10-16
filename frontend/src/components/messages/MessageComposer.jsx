import { useEffect, useId, useRef, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { MESSAGE_COUNTER_FROM, MESSAGE_MAX_LENGTH } from '@/constants/messages';
import { cn } from '@/utils/cn';

const MAX_HEIGHT_PX = 160;
// On touch keyboards Enter adds a line (there's a Send button); with a hardware keyboard Enter sends.
const enterSends = () => typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches;

/**
 * The message box: grows with the text (up to a few lines), Enter sends and Shift+Enter adds a line, the
 * character counter shows near the limit. Plain text only.
 */
export function MessageComposer({ onSend, disabled = false, placeholder = 'Write a message…', autoFocus = false }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);
  const hintId = useId();
  const trimmed = text.trim();
  const tooLong = text.length > MESSAGE_MAX_LENGTH;
  const canSend = !disabled && trimmed.length > 0 && !tooLong;

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [text]);

  useEffect(() => {
    if (autoFocus && !disabled) textareaRef.current?.focus({ preventScroll: true });
  }, [autoFocus, disabled]);

  const submit = () => {
    if (!canSend) return;
    onSend(trimmed);
    setText('');
    textareaRef.current?.focus();
  };

  return (
    <form
      className="flex items-end gap-2 border-t border-line bg-surface px-3 py-3 sm:px-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="relative min-w-0 flex-1">
        <label htmlFor={`${hintId}-input`} className="sr-only">
          Message
        </label>
        <textarea
          id={`${hintId}-input`}
          ref={textareaRef}
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && enterSends()) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          aria-describedby={hintId}
          aria-invalid={tooLong || undefined}
          className={cn(
            'block max-h-40 w-full resize-none rounded-2xl border bg-surface-muted px-4 py-2.5 text-[15px] leading-relaxed text-ink outline-none transition-colors placeholder:text-ink-subtle focus:bg-surface focus:ring-4 focus:ring-focus disabled:opacity-60',
            tooLong ? 'border-danger' : 'border-transparent focus:border-primary',
          )}
        />
        <p
          id={hintId}
          className={cn(
            'text-xs',
            text.length >= MESSAGE_COUNTER_FROM ? 'absolute -top-5 right-2 rounded-md bg-surface px-1 tabular-nums' : 'sr-only',
            tooLong ? 'font-semibold text-danger-fg' : 'text-ink-subtle',
          )}
        >
          {text.length >= MESSAGE_COUNTER_FROM ? `${text.length} / ${MESSAGE_MAX_LENGTH} characters` : 'Press Enter to send, Shift+Enter for a new line.'}
        </p>
      </div>
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Send message"
        className="glass-primary grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-fg shadow-soft transition-[background-color,box-shadow,transform,opacity] hover:bg-primary-hover hover:shadow-glow active:scale-95 disabled:pointer-events-none disabled:opacity-40"
      >
        <SendHorizontal className="size-5" aria-hidden="true" />
      </button>
    </form>
  );
}
