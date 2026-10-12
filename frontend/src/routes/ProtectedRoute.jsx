import { Outlet, useLocation } from 'react-router';
import { AccessDenied } from '@/components/common/AccessDenied';
import { Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useAuthStore } from '@/store/authStore';
import { RedirectTo } from './RedirectTo';

/**
 * UX-only guard: sends signed-out visitors to /login (remembering where they were going)
 * and shows AccessDenied for the wrong role. Real enforcement happens in the API's
 * authenticate/authorizeRoles middleware; never rely on this for security.
 *
 *   <ProtectedRoute />                          any signed-in user
 *   <ProtectedRoute roles={[ROLES.ADMIN]} />    signed in with one of these roles
 */
export function ProtectedRoute({ roles }) {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader size="lg" label="Checking your session" />
      </div>
    );
  }

  if (status !== 'authenticated') {
    return <RedirectTo to={ROUTES.LOGIN} state={{ from: location }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <AccessDenied />;
  }

  return <Outlet />;
}
