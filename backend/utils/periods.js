import env from '../config/env.js';

/*
 * Calendar periods in the gamification time zone (GAMIFICATION_TIMEZONE, default Asia/Kolkata), used for
 * daily/weekly caps, streaks and the weekly/monthly leaderboards. All dates come from the server clock.
 *   day    "2026-10-03"
 *   week   the Monday that starts it, "2026-09-28"
 *   month  "2026-10"
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: env.gamificationTimezone, year: 'numeric', month: '2-digit', day: '2-digit' });
const offsetFormat = new Intl.DateTimeFormat('en-US', { timeZone: env.gamificationTimezone, timeZoneName: 'longOffset' });

/** "YYYY-MM-DD" of `date` in the gamification time zone. */
export const localDay = (date = new Date()) => dayFormat.format(date);

// Calendar arithmetic on "YYYY-MM-DD" strings (UTC noon avoids any date-line surprises).
const asUtc = (day) => new Date(`${day}T12:00:00Z`);
export const addDays = (day, days) => new Date(asUtc(day).getTime() + days * DAY_MS).toISOString().slice(0, 10);

/** The time zone's offset from UTC at `date`, in minutes (e.g. +330 for India). */
function offsetMinutes(date) {
  const name = offsetFormat.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!match) return 0;
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/** The moment a local day starts, as a Date. */
export function startOfLocalDay(day) {
  const midnightUtc = new Date(`${day}T00:00:00Z`);
  return new Date(midnightUtc.getTime() - offsetMinutes(midnightUtc) * 60 * 1000);
}

/** Keys and start times for the periods `date` falls in. */
export function periodsOf(date = new Date()) {
  const day = localDay(date);
  const weekday = (asUtc(day).getUTCDay() + 6) % 7; // Monday = 0
  const week = addDays(day, -weekday);
  const month = day.slice(0, 7);
  return {
    day,
    yesterday: addDays(day, -1),
    week,
    month,
    dayStart: startOfLocalDay(day),
    weekStart: startOfLocalDay(week),
    monthStart: startOfLocalDay(`${month}-01`),
  };
}
