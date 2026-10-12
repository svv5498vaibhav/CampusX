import { getRedisClient } from '../config/redis.js';
import logger from '../utils/logger.js';

const SWEEP_INTERVAL_MS = 60_000;

/** In-memory fallback with the same async API as the Redis adapter. */
function createMemoryStore() {
  const entries = new Map();

  const isExpired = (entry) => entry.expiresAt !== null && entry.expiresAt <= Date.now();

  const sweep = setInterval(() => {
    for (const [key, entry] of entries) {
      if (isExpired(entry)) entries.delete(key);
    }
  }, SWEEP_INTERVAL_MS);
  sweep.unref();

  return {
    async get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (isExpired(entry)) {
        entries.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key, value, ttlSeconds) {
      const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
      entries.set(key, { value, expiresAt });
    },
    async del(key) {
      entries.delete(key);
    },
  };
}

const createRedisStore = (client) => ({
  get: (key) => client.get(key),
  set: (key, value, ttlSeconds) =>
    ttlSeconds ? client.set(key, value, { expiration: { type: 'EX', value: ttlSeconds } }) : client.set(key, value),
  del: (key) => client.del(key),
});

const memoryStore = createMemoryStore();
let redisStore = null;

// Redis while it is ready; the memory store when Redis is not configured or is down.
function activeStore() {
  const client = getRedisClient();
  if (!client?.isReady) return memoryStore;
  if (redisStore?.client !== client) redisStore = { client, ...createRedisStore(client) };
  return redisStore;
}

/**
 * Cache failures never break a request: reads degrade to a miss, writes are skipped.
 * Values are JSON-serialised so both stores behave identically.
 */
export async function getCache(key) {
  try {
    const raw = await activeStore().get(key);
    return raw === null || raw === undefined ? null : JSON.parse(raw);
  } catch (error) {
    logger.warn(`Cache read failed for "${key}": ${error.message}`);
    return null;
  }
}

export async function setCache(key, value, ttlSeconds) {
  try {
    await activeStore().set(key, JSON.stringify(value), ttlSeconds);
  } catch (error) {
    logger.warn(`Cache write failed for "${key}": ${error.message}`);
  }
}

export async function deleteCache(key) {
  try {
    await activeStore().del(key);
  } catch (error) {
    logger.warn(`Cache delete failed for "${key}": ${error.message}`);
  }
}
