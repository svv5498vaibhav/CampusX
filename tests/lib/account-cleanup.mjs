// One round of the account deletion cleanup job (backend/jobs/accountDeletionCleanup.js runs the same
// resumeDeletions() on a timer), against a test database, with the campus event listeners registered as in
// the server so follow-ups reconcile other students' points. Started through the env hook by
// tests/lib/scripts.mjs runAccountCleanup(); prints `CLEANUP {json}`.
import { backendFile } from './paths.mjs';

const { connectDatabase, disconnectDatabase } = await import(backendFile('config/db.js'));
const gamification = await import(backendFile('services/gamificationEvents.js'));
const notifications = await import(backendFile('services/notificationEvents.js'));
const recommendations = await import(backendFile('services/recommendationEvents.js'));
const deletions = await import(backendFile('services/accountDeletionService.js'));

await connectDatabase();
gamification.registerGamificationListeners();
notifications.registerNotificationListeners();
recommendations.registerRecommendationListeners();

const now = process.env.CAMPUSX_CLEANUP_NOW ? new Date(process.env.CAMPUSX_CLEANUP_NOW) : new Date();
const result = await deletions.resumeDeletions(now);
await deletions.settled();
await gamification.settled();
await notifications.settled();
await recommendations.settled();
console.log(`CLEANUP ${JSON.stringify(result)}`);
await disconnectDatabase();
process.exit(0);
