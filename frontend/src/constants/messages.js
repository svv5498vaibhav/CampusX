/*
 * Direct messages: limits and formatting shared by the inbox and the chat. The limits mirror
 * backend/data/socialOptions.js (MESSAGE_RULES); the server enforces them.
 */

export const MESSAGE_MAX_LENGTH = 2000;
export const MESSAGE_PAGE_SIZE = 30;
// The character counter appears once a message gets this close to the limit.
export const MESSAGE_COUNTER_FROM = 1700;

/** "9+" style unread counts for the inbox and the Messages badge. */
export const formatUnreadMessages = (count) => (count > 99 ? '99+' : String(count));

/** The Messages link's accessible name, including the unread state. */
export const messagesLabel = (count) => (count ? `Messages, ${count} unread conversation${count === 1 ? '' : 's'}` : 'Messages');

/** "10:42 am" today, "Mon" this week, "12 Oct" this year, "12 Oct 2025" before that. */
export function shortTime(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const days = (now - date) / 86_400_000;
  if (days < 6) return date.toLocaleDateString(undefined, { weekday: 'short' });
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }) });
}

/** "Today", "Yesterday" or a date, for the separators between days in a conversation. */
export function dayLabel(value, now = new Date()) {
  const date = new Date(value);
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }) });
}
