import http from 'node:http';
import env, { developmentWarnings, validateEnv } from './config/env.js';
import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { connectRedis, disconnectRedis } from './config/redis.js';
import { startAccountDeletionCleanup, stopAccountDeletionCleanup } from './jobs/accountDeletionCleanup.js';
import { startEliteRankRefresh, stopEliteRankRefresh } from './jobs/eliteRankRefresh.js';
import { startDeadlineReminders, stopDeadlineReminders } from './jobs/opportunityDeadlineReminders.js';
import { settled as accountDeletionsSettled } from './services/accountDeletionService.js';
import { registerEliteRankListeners } from './services/eliteRankService.js';
import { registerGamificationListeners, settled as gamificationSettled } from './services/gamificationEvents.js';
import { registerNotificationListeners, settled as notificationsSettled } from './services/notificationEvents.js';
import { registerRecommendationListeners, settled as recommendationsSettled } from './services/recommendationEvents.js';
import { registerAdminRealtime, unregisterAdminRealtime } from './services/admin/adminRealtime.js';
import { logCloudinaryStatus } from './config/cloudinary.js';
import { initSocketServer, closeSocketServer } from './sockets/socket.js';
import { registerGracefulShutdown } from './utils/gracefulShutdown.js';
import logger from './utils/logger.js';

const httpServer = http.createServer(app);

function listen(port) {
  return new Promise((resolve, reject) => {
    httpServer.once('error', (error) => {
      reject(
        error.code === 'EADDRINUSE'
          ? new Error(`Port ${port} is already in use. Stop the other process or change PORT in backend/.env.`)
          : error,
      );
    });
    httpServer.listen(port, resolve);
  });
}

registerGracefulShutdown(async () => {
  unregisterAdminRealtime();
  await closeSocketServer();
  if (httpServer.listening) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  // Points and notifications still being written for the last requests finish before the database closes.
  await stopDeadlineReminders();
  await stopAccountDeletionCleanup();
  await accountDeletionsSettled();
  await gamificationSettled();
  // A ranking snapshot still running finishes (its notifications are then written below).
  await stopEliteRankRefresh();
  await notificationsSettled();
  await recommendationsSettled();
  await Promise.allSettled([disconnectDatabase(), disconnectRedis()]);
});

async function start() {
  logger.info('CampusX API starting...');
  validateEnv();
  if (env.auth.isJwtSecretEphemeral) {
    logger.warn('JWT_SECRET is not set - using a temporary secret (development only). Set it in backend/.env.');
  }
  for (const warning of developmentWarnings()) logger.warn(warning);

  await connectDatabase();
  await connectRedis();
  logCloudinaryStatus();
  // Points, levels and badges follow campus events (posts, projects, communities, ...).
  registerGamificationListeners();
  // Elite rank tokens (Gold, Silver, Bronze) follow the top three of the CampusX rankings.
  registerEliteRankListeners();
  // Notifications follow the same events; they are saved first, then delivered over Socket.IO.
  registerNotificationListeners();
  // Recommendations learn from the same events (likes, comments, memberships, tracking, profile edits).
  registerRecommendationListeners();
  initSocketServer(httpServer);
  // Live alerts for signed-in moderators and admins (new reports and cases, database/Redis connection changes).
  registerAdminRealtime();
  startDeadlineReminders();
  // Finishes account deletions a restart interrupted and retries files Cloudinary didn't remove yet.
  startAccountDeletionCleanup();
  // Ranking snapshots for the elite rank tokens: shortly after start-up, then every few minutes.
  startEliteRankRefresh();

  await listen(env.port);
  logger.info(`CampusX API running on http://localhost:${env.port} (${env.nodeEnv})`);
  logger.info(`API base: http://localhost:${env.port}${env.apiPrefix}`);
}

start().catch((error) => {
  logger.error(`Startup failed: ${error.message}`);
  process.exit(1);
});
