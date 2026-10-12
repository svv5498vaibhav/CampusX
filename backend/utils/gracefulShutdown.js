import logger from './logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Runs `cleanup` once on SIGINT/SIGTERM (exit 0) or on an unhandled error
 * (exit 1), with a forced exit if cleanup hangs. A second Ctrl+C falls back
 * to Node's default immediate exit.
 */
export function registerGracefulShutdown(cleanup) {
  let isShuttingDown = false;

  async function shutdown(reason, exitCode) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`${reason} received - shutting down gracefully`);

    setTimeout(() => {
      logger.error(`Shutdown did not finish within ${SHUTDOWN_TIMEOUT_MS / 1000}s - forcing exit`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    let code = exitCode;
    try {
      await cleanup();
      logger.info('Shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown:', error);
      code = 1;
    }
    process.exit(code);
  }

  process.once('SIGINT', () => shutdown('SIGINT', 0));
  process.once('SIGTERM', () => shutdown('SIGTERM', 0));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection:', reason);
    shutdown('unhandledRejection', 1);
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    shutdown('uncaughtException', 1);
  });
}
