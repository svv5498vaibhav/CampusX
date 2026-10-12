import mongoose from 'mongoose';
import { ACCOUNT_DELETION } from '../config/securityConfig.js';
import { resumeDeletions } from '../services/accountDeletionService.js';
import logger from '../utils/logger.js';

/*
 * Account deletion cleanup: a light in-process timer, like the deadline reminders. Every
 * ACCOUNT_DELETION.checkEveryMinutes it finishes deletions that were interrupted (the account stays locked
 * meanwhile), runs follow-ups that never ran, and retries Cloudinary files that could not be removed yet
 * (services/accountDeletionService.js resumeDeletions). Every step is safe to repeat, so restarts or several
 * API instances never delete anything twice or leave anything half done.
 */

const MINUTE = 60 * 1000;

let timer = null;
let running = null;

function runOnce() {
  // Skipped while the database is unavailable; the next tick tries again.
  if (running || mongoose.connection.readyState !== 1) return;
  running = resumeDeletions()
    .then((result) => {
      if (result.resumed || result.finished || result.mediaRemoved) logger.info(`Account deletion cleanup: ${JSON.stringify(result)}`);
    })
    .catch((error) => logger.error(`Account deletion cleanup failed: ${error?.message ?? error}`))
    .finally(() => {
      running = null;
    });
}

export function startAccountDeletionCleanup() {
  if (timer) return;
  timer = setInterval(runOnce, ACCOUNT_DELETION.checkEveryMinutes * MINUTE);
  timer.unref();
  // A first check shortly after start-up picks up anything a restart interrupted.
  setTimeout(runOnce, 30_000).unref();
}

/** Stops the timer and waits for a round that is still running. */
export async function stopAccountDeletionCleanup() {
  clearInterval(timer);
  timer = null;
  await running;
}
