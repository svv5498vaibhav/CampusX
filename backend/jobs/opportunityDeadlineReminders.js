import mongoose from 'mongoose';
import env from '../config/env.js';
import { NOTIFICATION_RULES } from '../data/notificationOptions.js';
import { BEFORE_APPLYING_STATUSES } from '../data/opportunityOptions.js';
import Opportunity from '../models/Opportunity.js';
import OpportunityApplication from '../models/OpportunityApplication.js';
import User from '../models/User.js';
import { createBulkNotifications, logNotificationError } from '../services/notificationService.js';
import { canView, eligibilityOf } from '../services/opportunityAccess.js';

/*
 * Deadline reminders: a light in-process timer (no scheduler needed). Every few minutes it finds
 * published opportunities whose application deadline falls within the next
 * NOTIFICATION_RULES.deadlineReminder.hoursBefore hours and reminds the students who saved them or
 * marked them "interested" (not yet applied), if they can still see the opportunity and are eligible.
 * Each reminder is sent once per deadline, so restarts, several API instances or a moved deadline
 * never cause duplicates (a new deadline gets its own reminder). Times are shown in
 * GAMIFICATION_TIMEZONE, the campus time zone used across CampusX.
 */

const MINUTE = 60 * 1000;
const deadlineText = new Intl.DateTimeFormat('en-IN', {
  timeZone: env.gamificationTimezone,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

export async function sendDeadlineReminders(now = new Date()) {
  const soon = new Date(now.getTime() + NOTIFICATION_RULES.deadlineReminder.hoursBefore * 60 * MINUTE);
  const opportunities = await Opportunity.find({ status: 'published', applicationDeadline: { $gt: now, $lte: soon } })
    .select('title status visibility eligibleColleges eligibleBranches eligibleSemesters applicationDeadline')
    .lean();
  let sent = 0;
  for (const opportunity of opportunities) {
    const records = await OpportunityApplication.find({ opportunity: opportunity._id, status: { $in: BEFORE_APPLYING_STATUSES } }).select('user').lean();
    if (!records.length) continue;
    const students = await User.find({ _id: { $in: records.map((record) => record.user) } }).select('college branch semester role').lean();
    const saved = await createBulkNotifications({
      recipients: students.filter((student) => canView(opportunity, student) && eligibilityOf(opportunity, student).eligible).map((student) => student._id),
      type: 'OPPORTUNITY_DEADLINE',
      message: `Applications for “${opportunity.title}” close on ${deadlineText.format(opportunity.applicationDeadline)}. Don't miss it!`,
      entityType: 'opportunity',
      entityId: opportunity._id,
      metadata: { deadline: opportunity.applicationDeadline },
      dedupeKey: `opportunity:${opportunity._id}:deadline:${opportunity.applicationDeadline.getTime()}`,
    });
    sent += saved.length;
  }
  return sent;
}

let timer = null;
let running = null;

function runOnce() {
  // Skipped while the database is unavailable; the next tick tries again.
  if (running || mongoose.connection.readyState !== 1) return;
  running = sendDeadlineReminders()
    .catch((error) => logNotificationError('deadline reminders', error))
    .finally(() => {
      running = null;
    });
}

export function startDeadlineReminders() {
  if (timer) return;
  timer = setInterval(runOnce, NOTIFICATION_RULES.deadlineReminder.checkEveryMinutes * MINUTE);
  timer.unref();
  // A first check shortly after start-up.
  setTimeout(runOnce, 15_000).unref();
}

/** Stops the timer and waits for a check that is still running. */
export async function stopDeadlineReminders() {
  clearInterval(timer);
  timer = null;
  await running;
}
