const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const shortDateWithYear = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const fullDateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** "now", "5m", "3h", "2d", then "12 Sep" (or "12 Sep 2025" for older years). */
export function formatRelativeTime(value, now = Date.now()) {
  const date = new Date(value);
  const seconds = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (seconds < MINUTE) return 'now';
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h`;
  if (seconds < WEEK) return `${Math.floor(seconds / DAY)}d`;
  return (date.getFullYear() === new Date(now).getFullYear() ? shortDate : shortDateWithYear).format(date);
}

/** "2 Oct 2026, 3:45 pm": for tooltips and screen readers. */
export const formatDateTime = (value) => fullDateTime.format(new Date(value));
