import { useNavigate } from 'react-router';
import { ROUTES } from '@/constants/routes';
import { useAchievementStore } from '@/store/achievementStore';
import { useAdminStore } from '@/store/adminStore';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import { useFeedStore } from '@/store/feedStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useProfileStore } from '@/store/profileStore';
import { useProjectStore } from '@/store/projectStore';
import { useRoadmapStore } from '@/store/roadmapStore';

/**
 * Signs out (server session + local state) and returns to the login page. An explicit logout
 * also clears cached profile, feed, community, project, achievement, notification, roadmap and admin data and discards any unfinished onboarding draft; an expired session keeps it so the same
 * student can carry on after logging back in.
 */
export function useLogout() {
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  return async () => {
    await logout();
    useOnboardingStore.getState().reset();
    useProfileStore.getState().reset();
    useFeedStore.getState().reset();
    useCommunityStore.getState().reset();
    useProjectStore.getState().reset();
    useAchievementStore.getState().reset();
    useNotificationStore.getState().reset();
    useAdminStore.getState().reset();
    useRoadmapStore.getState().reset();
    navigate(ROUTES.LOGIN, { replace: true });
  };
}
