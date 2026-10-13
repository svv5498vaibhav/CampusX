import { useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { MessagesUnreadBadge, MessagesUnreadDot } from '@/components/messages/MessagesUnreadBadge';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { GlobalSearch } from '@/components/search/GlobalSearch';
import { Modal } from '@/components/ui';
import { CAMPUS_NAV } from '@/constants/navigation';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/utils/cn';

// Destinations that don't fit in the bottom tab bar live in the Explore sheet.
const EXPLORE_ITEMS = CAMPUS_NAV.filter((item) => !item.inBottomNav);

export function MobileTopBar() {
  const [exploring, setExploring] = useState(false);
  const { pathname } = useLocation();
  const inExplore = EXPLORE_ITEMS.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line/70 bg-canvas/85 px-4 backdrop-blur-md md:hidden">
      <Link to={ROUTES.HOME} aria-label="CampusX home" className="rounded-xl">
        {/* Just the mark on the narrowest phones, so the bell and menu buttons still fit. */}
        <Logo wordmarkClassName="hidden min-[360px]:inline" />
      </Link>

      <div className="flex items-center gap-1">
        <GlobalSearch variant="topbar" />
        <NotificationBell variant="topbar" />
        <button
          type="button"
          onClick={() => setExploring(true)}
          aria-label="Explore"
          title="Explore"
          className={cn(
            'relative grid size-10 place-items-center rounded-xl transition-colors',
            inExplore ? 'bg-primary-soft text-primary-soft-fg' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
          )}
        >
          <LayoutGrid className="size-5" aria-hidden="true" />
          {/* Messages live in Explore on phones: a dot says something is unread there. */}
          <MessagesUnreadDot className="top-1.5 right-1.5" />
        </button>
        <ThemeToggle />
        <AccountMenu />
      </div>

      <Modal open={exploring} onClose={() => setExploring(false)} title="Explore CampusX" size="sm">
        <nav aria-label="Explore">
          <ul className="grid grid-cols-2 gap-2">
            {EXPLORE_ITEMS.map(({ to, label, icon: Icon, badge }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={() => setExploring(false)}
                  className={({ isActive }) =>
                    cn(
                      'relative flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border text-sm font-semibold transition-colors',
                      isActive ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-line text-ink hover:border-line-strong',
                    )
                  }
                >
                  <Icon className="size-6 text-primary" aria-hidden="true" />
                  {label}
                  {badge === 'messages' && <MessagesUnreadBadge className="absolute top-2 right-2" />}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </Modal>
    </header>
  );
}
