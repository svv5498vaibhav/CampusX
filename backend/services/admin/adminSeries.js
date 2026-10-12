import env from '../../config/env.js';
import Session from '../../models/Session.js';
import User, { ACCOUNT_STATUSES, ROLES } from '../../models/User.js';
import { addDays, localDay, startOfLocalDay } from '../../utils/periods.js';

/*
 * Time series and shared counts for the dashboard and analytics. Days are calendar days in the CampusX
 * time zone (GAMIFICATION_TIMEZONE, as for rankings), oldest first, and every count comes from a
 * database query: days without activity are 0, never estimated.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The last `days` calendar days (today included) and when the first one started. */
export function dayWindow(days) {
  const today = localDay();
  const keys = Array.from({ length: days }, (_, index) => addDays(today, index - days + 1));
  return { keys, start: startOfLocalDay(keys[0]) };
}

/** Documents per day over the window, matched by `match` and dated by `dateField`. */
export async function dailyCounts(model, match, window, { dateField = 'createdAt' } = {}) {
  const rows = await model.aggregate([
    { $match: { ...match, [dateField]: { $gte: window.start } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: `$${dateField}`, timezone: env.gamificationTimezone } }, count: { $sum: 1 } } },
  ]);
  const byDay = new Map(rows.map((row) => [row._id, row.count]));
  return window.keys.map((day) => byDay.get(day) ?? 0);
}

/** Documents created in the last `days` days and in the `days` before that (for "this week" trends). */
export async function trend(model, match, days) {
  const now = Date.now();
  const [current, previous] = await Promise.all([
    model.countDocuments({ ...match, createdAt: { $gte: new Date(now - days * DAY_MS) } }),
    model.countDocuments({ ...match, createdAt: { $gte: new Date(now - 2 * days * DAY_MS), $lt: new Date(now - days * DAY_MS) } }),
  ]);
  return { current, previous, days };
}

/**
 * Active students: active student accounts that signed in, or used CampusX (a session renewed its
 * sign-in), within the last `days` days.
 */
export async function activeStudentCount(days) {
  const since = new Date(Date.now() - days * DAY_MS);
  const sessionUsers = await Session.distinct('user', { lastUsedAt: { $gte: since } });
  return User.countDocuments({ role: ROLES.STUDENT, status: ACCOUNT_STATUSES.ACTIVE, $or: [{ lastLoginAt: { $gte: since } }, { _id: { $in: sessionUsers } }] });
}

/** Rows of { _id, count } → { [id]: count } with every listed key present. */
export function countMap(rows, keys = []) {
  const counts = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const row of rows) counts[row._id ?? 'none'] = (counts[row._id ?? 'none'] ?? 0) + row.count;
  return counts;
}
