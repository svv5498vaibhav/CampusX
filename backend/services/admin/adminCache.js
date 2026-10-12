import { ANALYTICS_RANGES } from '../../config/adminConfig.js';
import { deleteCache } from '../cacheService.js';

/*
 * Keys of the admin control center's short-lived statistics caches (Redis, or memory without it). An
 * admin action that changes something clears them, so the next dashboard, queue or analytics view
 * reflects it at once; changes made elsewhere (new reports, new content) show within the cache lifetime.
 */
export const ADMIN_CACHE_KEYS = Object.freeze({
  dashboard: 'admin:dashboard',
  moderationSummary: 'admin:moderation-summary',
  analytics: (range) => `admin:analytics:${range}`,
});

export async function invalidateAdminCaches() {
  await Promise.all([
    deleteCache(ADMIN_CACHE_KEYS.dashboard),
    deleteCache(ADMIN_CACHE_KEYS.moderationSummary),
    ...Object.keys(ANALYTICS_RANGES).map((range) => deleteCache(ADMIN_CACHE_KEYS.analytics(range))),
  ]);
}
