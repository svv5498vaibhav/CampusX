import { getRedisClient } from '../config/redis.js';
import logger from './logger.js';

const MINUTE = 60 * 1000;

/**
 * Counts for express-rate-limit on Redis while it is connected (shared by every API instance), and in
 * this process's memory when Redis isn't configured or is down. Keys follow one convention:
 *   campusx:rl:<limiter name>:<client key>      e.g. campusx:rl:anonymous-posts:user:<id>
 * Pass `name` to createRateLimiter to use it.
 */
export class SharedCounterStore {
  constructor(name, { getClient = getRedisClient } = {}) {
    this.prefix = `campusx:rl:${name}:`;
    this.getClient = getClient;
    this.localKeys = false;
    this.windowMs = 15 * MINUTE;
    this.memory = new Map(); // key → { hits, resetAt }
    this.warned = false;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  redis() {
    const client = this.getClient();
    return client?.isReady ? client : null;
  }

  /** Redis errors fall back to memory for that request (logged once per outage). */
  async withRedis(work) {
    const client = this.redis();
    if (!client) return undefined;
    try {
      const result = await work(client);
      this.warned = false;
      return result;
    } catch (error) {
      if (!this.warned) logger.warn(`Rate limit store: Redis error (${error.message}) - counting in memory for now`);
      this.warned = true;
      return undefined;
    }
  }

  memoryEntry(key) {
    const now = Date.now();
    let entry = this.memory.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { hits: 0, resetAt: now + this.windowMs };
      this.memory.set(key, entry);
    }
    if (this.memory.size > 10_000) {
      for (const [stale, value] of this.memory) if (value.resetAt <= now) this.memory.delete(stale);
    }
    return entry;
  }

  async increment(key) {
    const fullKey = this.prefix + key;
    const shared = await this.withRedis(async (client) => {
      const [hits, ttl] = await client.multi().incr(fullKey).pTTL(fullKey).exec();
      let msLeft = Number(ttl);
      if (msLeft < 0) {
        await client.pExpire(fullKey, this.windowMs);
        msLeft = this.windowMs;
      }
      return { totalHits: Number(hits), resetTime: new Date(Date.now() + msLeft) };
    });
    if (shared) return shared;
    const entry = this.memoryEntry(fullKey);
    entry.hits += 1;
    return { totalHits: entry.hits, resetTime: new Date(entry.resetAt) };
  }

  async decrement(key) {
    const fullKey = this.prefix + key;
    const done = await this.withRedis(async (client) => {
      await client.decr(fullKey);
      return true;
    });
    if (done) return;
    const entry = this.memory.get(fullKey);
    if (entry && entry.hits > 0) entry.hits -= 1;
  }

  async resetKey(key) {
    const fullKey = this.prefix + key;
    await this.withRedis((client) => client.del(fullKey));
    this.memory.delete(fullKey);
  }
}
