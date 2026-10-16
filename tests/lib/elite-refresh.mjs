// Elite rank snapshots in a process of their own, against a test database (started through the env hook by
// tests/lib/scripts.mjs runEliteRefresh(), so backend/.env is never read). It plays a second API instance
// for what a request can't trigger:
//   CAMPUSX_ELITE_MODE=refresh     CAMPUSX_ELITE_TIMES refreshes at once (default 1)
//   CAMPUSX_ELITE_MODE=fail-read   the ranking read fails (the leaderboard query throws)
//   CAMPUSX_ELITE_MODE=emit-twice  the same ELITE_RANK_CHANGED event (CAMPUSX_ELITE_EVENT, JSON) twice
// Notification listeners are registered as in the server. Prints `ELITE {json}`.
import { backendFile } from './paths.mjs';

const { connectDatabase, disconnectDatabase } = await import(backendFile('config/db.js'));
const notifications = await import(backendFile('services/notificationEvents.js'));
const elite = await import(backendFile('services/eliteRankService.js'));
const { CAMPUS_EVENTS, emitCampusEvent } = await import(backendFile('services/campusEvents.js'));
const { default: StudentGamification } = await import(backendFile('models/StudentGamification.js'));

await connectDatabase();
notifications.registerNotificationListeners();

const mode = process.env.CAMPUSX_ELITE_MODE || 'refresh';
let result;
if (mode === 'fail-read') {
  StudentGamification.find = () => {
    throw new Error('injected: the ranking read failed');
  };
  result = await elite.refreshEliteRanks('test');
} else if (mode === 'emit-twice') {
  const payload = JSON.parse(process.env.CAMPUSX_ELITE_EVENT);
  emitCampusEvent(CAMPUS_EVENTS.ELITE_RANK_CHANGED, payload);
  emitCampusEvent(CAMPUS_EVENTS.ELITE_RANK_CHANGED, payload);
  result = { emitted: 2 };
} else {
  const times = Number(process.env.CAMPUSX_ELITE_TIMES || 1);
  result = await Promise.all(Array.from({ length: times }, () => elite.refreshEliteRanks('test')));
}
await notifications.settled();
console.log(`ELITE ${JSON.stringify(result)}`);
await disconnectDatabase();
process.exit(0);
