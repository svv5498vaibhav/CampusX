import { Outlet } from 'react-router';
import { ROUTES } from '@/constants/routes';
import { useAuthStore } from '@/store/authStore';
import { RedirectTo } from './RedirectTo';

/**
 * Sends signed-in students to the right place based on onboarding. Use inside ProtectedRoute.
 *   <OnboardingGuard requireComplete />          campus pages: unfinished → /onboarding
 *   <OnboardingGuard requireComplete={false} />  /onboarding itself: finished → /home
 * UX only; the API decides what an account may do.
 */
export function OnboardingGuard({ requireComplete }) {
  const isComplete = useAuthStore((state) => Boolean(state.user?.onboardingCompleted));

  if (requireComplete && !isComplete) return <RedirectTo to={ROUTES.ONBOARDING} />;
  if (!requireComplete && isComplete) return <RedirectTo to={ROUTES.HOME} />;
  return <Outlet />;
}
