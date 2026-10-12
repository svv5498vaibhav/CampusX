import { useNavigate } from 'react-router';
import { ROUTES } from '@/constants/routes';
import { authApi } from '@/services/authApi';
import { disconnectSocket } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';
import { clearAccountData } from '@/store/clearAccountData';
import { toast } from '@/store/toastStore';

/**
 * Deletes the signed-in student's account, then signs this browser out completely: the live connection is
 * closed, the access token and session hint are forgotten (other open tabs sign out too), every cached store
 * is cleared, and the student lands on the login page with a confirmation. The server has already ended every
 * session and cleared the refresh cookie.
 *
 * If the request fails nothing changes here: the error is thrown for the dialog to show, and the student stays
 * signed in (a wrong password is a field error, never an expired session).
 */
export function useDeleteAccount() {
  const navigate = useNavigate();

  return async ({ password, confirmation }) => {
    const userId = useAuthStore.getState().user?.id;
    const { status } = await authApi.deleteAccount({ password, confirmation });

    disconnectSocket();
    useAuthStore.getState().clearSession();
    clearAccountData(userId);
    toast.success(status === 'scheduled' ? 'Your account has been closed. Removing the rest of your data finishes automatically.' : 'Your account has been permanently deleted.');
    // flushSync: the signed-out state and the new page render together, so the profile page's guard never
    // gets to send the student to the login page as an expired session ("Please log in to continue").
    navigate(ROUTES.LOGIN, { replace: true, state: { accountDeleted: status }, flushSync: true });
    return status;
  };
}
