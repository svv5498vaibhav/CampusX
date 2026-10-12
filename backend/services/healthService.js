import env from '../config/env.js';
import { getDatabaseStatus } from '../config/db.js';
import { getRedisStatus } from '../config/redis.js';

/** Non-sensitive runtime status: no hosts, URIs, versions or credentials. */
export function getHealthStatus() {
  return {
    environment: env.nodeEnv,
    database: getDatabaseStatus(),
    redis: getRedisStatus(),
  };
}
