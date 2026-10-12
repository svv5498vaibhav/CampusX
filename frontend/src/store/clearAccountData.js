import { safetyNoticeKey } from '@/constants/anonymous';
import { useAchievementStore } from './achievementStore';
import { useAdminStore } from './adminStore';
import { useAnonymousStore } from './anonymousStore';
import { useCommunityStore } from './communityStore';
import { useFeedStore } from './feedStore';
import { useGamificationStore } from './gamificationStore';
import { useNotificationStore } from './notificationStore';
import { useOnboardingStore } from './onboardingStore';
import { useOpportunityStore } from './opportunityStore';
import { useProfileStore } from './profileStore';
import { useProjectStore } from './projectStore';
import { useRankingStore } from './rankingStore';
import { useRecommendationStore } from './recommendationStore';
import { useReportStore } from './reportStore';
import { useRoadmapStore } from './roadmapStore';
import { useSearchStore } from './searchStore';

const STORES_WITH_RESET = [
  useAchievementStore,
  useAdminStore,
  useAnonymousStore,
  useCommunityStore,
  useFeedStore,
  useGamificationStore,
  useNotificationStore,
  useOnboardingStore,
  useOpportunityStore,
  useProfileStore,
  useProjectStore,
  useRankingStore,
  useRoadmapStore,
];
// These clear themselves when the viewer changes; "nobody" clears them.
const STORES_PER_VIEWER = [useRecommendationStore, useReportStore, useSearchStore];

/**
 * Forgets everything this browser cached about an account that was just deleted: every store holding its
 * data, the onboarding draft (sessionStorage) and its "seen the Anonymous Zone note" flag (localStorage).
 * The theme choice is a device setting and stays. Sign-out itself (token, session hint) is the auth store's.
 */
export function clearAccountData(userId) {
  for (const store of STORES_WITH_RESET) store.getState().reset();
  for (const store of STORES_PER_VIEWER) store.getState().forViewer(null);
  useOnboardingStore.persist.clearStorage();
  try {
    if (userId) localStorage.removeItem(safetyNoticeKey(userId));
  } catch {
    /* storage blocked: nothing was stored */
  }
}
