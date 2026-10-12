import { useState } from 'react';
import { KeyRound, LogOut, ShieldCheck, ShieldHalf, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar, Badge, Button, Modal } from '@/components/ui';
import { ROLES } from '@/constants/auth';
import { ROUTES } from '@/constants/routes';
import { useLogout } from '@/hooks/useLogout';
import { useAuthStore } from '@/store/authStore';
import { getFullName } from '@/utils/string';

/** Mobile top-bar avatar that opens an account sheet with log out. */
export function AccountMenu() {
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!user) return null;
  const fullName = getFullName(user);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logout();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Your account"
        className="ml-1 grid place-items-center rounded-xl"
      >
        <Avatar name={fullName} src={user.avatarUrl} size="sm" />
      </button>

      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Your account"
        size="sm"
        footer={
          <>
            <Button variant="outline" leftIcon={LogOut} fullWidth loading={isLoggingOut} onClick={handleLogout}>
              Log out
            </Button>
            <Button as={Link} to={ROUTES.PROFILE} leftIcon={UserRound} fullWidth onClick={() => setIsOpen(false)}>
              View my profile
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-4">
          <Avatar name={fullName} src={user.avatarUrl} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{fullName}</p>
            <p className="truncate text-sm text-ink-muted">{user.email}</p>
            <Badge variant="primary" className="mt-2 capitalize">
              {user.role}
            </Badge>
          </div>
        </div>
        <Link to={ROUTES.SAFETY} onClick={() => setIsOpen(false)} className="mt-4 flex items-center gap-2 rounded-xl px-1 py-2 text-sm font-semibold text-primary hover:underline">
          <ShieldCheck className="size-4" aria-hidden="true" /> Community guidelines and your reports
        </Link>
        <Link to={`${ROUTES.PROFILE_EDIT}#password`} onClick={() => setIsOpen(false)} className="flex items-center gap-2 rounded-xl px-1 py-2 text-sm font-semibold text-primary hover:underline">
          <KeyRound className="size-4" aria-hidden="true" /> Change password
        </Link>
        {[ROLES.ADMIN, ROLES.MODERATOR].includes(user.role) && (
          <Link to={ROUTES.ADMIN} onClick={() => setIsOpen(false)} className="flex items-center gap-2 rounded-xl px-1 py-2 text-sm font-semibold text-primary hover:underline">
            <ShieldHalf className="size-4" aria-hidden="true" /> Admin control center
          </Link>
        )}
      </Modal>
    </>
  );
}
