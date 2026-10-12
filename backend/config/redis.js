import { createClient } from 'redis';
import env from './env.js';
import logger from '../utils/logger.js';

const INITIAL_CONNECT_RETRIES = 3;

let client = null;

/**
 * Optional Redis connection. Never throws: if REDIS_URL is empty or Redis is
 * unreachable, the API keeps running and services/cacheService.js uses its
 * in-memory store instead.
 */
export async function connectRedis() {
  if (!env.redisUrl) {
    logger.warn('Redis: not configured (REDIS_URL is empty) - continuing without Redis cache');
    return null;
  }

  let hasConnected = false;
  let isDown = false;

  const redisClient = createClient({
    url: env.redisUrl,
    socket: {
      connectTimeout: 5_000,
      // Give up quickly on the first connection; once connected, keep reconnecting with backoff.
      reconnectStrategy: (retries, cause) => {
        if (!hasConnected && retries >= INITIAL_CONNECT_RETRIES) return cause;
        return Math.min(retries * 200, 5_000);
      },
    },
  });

  // Log outages once rather than on every reconnect attempt.
  redisClient.on('error', (error) => {
    if (hasConnected && !isDown) {
      isDown = true;
      logger.warn(`Redis connection lost (${error.message}) - using in-memory cache until it returns`);
    }
  });
  redisClient.on('ready', () => {
    if (isDown) logger.info('Redis reconnected');
    isDown = false;
  });

  try {
    await redisClient.connect();
    hasConnected = true;
    client = redisClient;
    logger.info('Redis: connected');
    return client;
  } catch (error) {
    logger.warn(`Redis: unavailable (${error.message}) - continuing without Redis cache`);
    return null;
  }
}

export const getRedisClient = () => client;

/** 'connected' | 'unavailable' | 'not_configured' */
export function getRedisStatus() {
  if (!env.redisUrl) return 'not_configured';
  return client?.isReady ? 'connected' : 'unavailable';
}

export async function disconnectRedis() {
  if (client?.isOpen) {
    await client.close();
    logger.info('Redis connection closed');
  }
  client = null;
}
