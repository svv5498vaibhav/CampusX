import { Outlet, useLocation } from 'react-router';
import { Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useAuthStore } from '@/store/authStore';
import { RedirectTo } from './RedirectTo';

/** For /login and /register: signed-in students go straight to campus instead. */
export function GuestRoute() {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();

  if (status === 'idle' || status === 'loading') {
    return <Loader centered label="Checking your session" />;
  }

  if (status === 'authenticated') {
    const from = location.state?.from;
    return <RedirectTo to={from ? `${from.pathname}${from.search ?? ''}` : ROUTES.HOME} fullScreen={false} />;
  }

  return <Outlet />;
}
