import { useState } from 'react';
import { LogOut, ShieldHalf } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar } from '@/components/ui';
import { ROLES } from '@/constants/auth';
import { ROUTES } from '@/constants/routes';
import { useLogout } from '@/hooks/useLogout';
import { useAuthStore } from '@/store/authStore';
import { getFullName } from '@/utils/string';

/** Signed-in student + log out, at the foot of the sidebar (stacked on the tablet rail). Staff also get the control center link. */
export function SidebarAccount() {
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!user) return null;
  const fullName = getFullName(user);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logout();
  };

  return (
    <div className="flex flex-col items-center gap-2 lg:flex-row lg:gap-3 lg:px-1">
      <Link
        to={ROUTES.PROFILE}
        title="View your profile"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 transition-colors hover:bg-surface-muted"
      >
        <Avatar name={fullName} src={user.avatarUrl} size="md" />
        <span className="hidden min-w-0 flex-1 lg:block">
          <span className="block truncate text-sm font-semibold text-ink">{fullName}</span>
          <span className="block truncate text-xs text-ink-subtle">{user.email}</span>
        </span>
      </Link>
      {[ROLES.ADMIN, ROLES.MODERATOR].includes(user.role) && (
        <Link
          to={ROUTES.ADMIN}
          aria-label="Admin control center"
          title="Admin control center"
          className="grid size-9 shrink-0 place-items-center rounded-xl text-ink-subtle transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <ShieldHalf className="size-4" aria-hidden="true" />
        </Link>
      )}
      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoggingOut}
        aria-label="Log out"
        title="Log out"
        className="grid size-9 shrink-0 place-items-center rounded-xl text-ink-subtle transition-colors hover:bg-danger-soft hover:text-danger-fg disabled:opacity-50"
      >
        <LogOut className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
