import { Fragment } from 'react';
import { ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link, NavLink } from 'react-router';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { SidebarAccount } from '@/components/layout/SidebarAccount';
import { MessagesUnreadBadge } from '@/components/messages/MessagesUnreadBadge';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { GlobalSearch } from '@/components/search/GlobalSearch';
import { CAMPUS_NAV } from '@/constants/navigation';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/utils/cn';

function SidebarLink({ item }) {
  const { icon: Icon, label, to } = item;

  return (
    <NavLink
      to={to}
      title={label}
      className={({ isActive }) =>
        cn(
          'relative isolate flex h-12 items-center justify-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors lg:justify-start lg:px-4',
          isActive ? 'text-primary-soft-fg' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="sidebar-active"
              className="absolute inset-0 -z-10 rounded-2xl bg-primary-soft"
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            />
          )}
          <Icon className="size-5 shrink-0" aria-hidden="true" />
          <span className="sr-only lg:not-sr-only">{label}</span>
          {item.badge === 'messages' && <MessagesUnreadBadge className="absolute top-1 right-1 lg:static lg:ml-auto" />}
        </>
      )}
    </NavLink>
  );
}

/** Desktop/tablet navigation: icon rail on `md`, full sidebar from `lg`. */
export function CampusSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col border-r border-line bg-surface md:flex lg:w-64">
      <div className="flex h-20 shrink-0 items-center justify-center px-4 lg:justify-start lg:px-6">
        <Link to={ROUTES.HOME} aria-label="CampusX home" className="rounded-xl">
          <Logo wordmarkClassName="hidden lg:inline" />
        </Link>
      </div>

      {/* Search sits above the navigation: a box on laptops, a button on the tablet icon rail. */}
      <div className="shrink-0 px-3 pb-1">
        <GlobalSearch />
      </div>

      <nav aria-label="Campus" className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="flex flex-col gap-1">
          {CAMPUS_NAV.map((item, index) => (
            <Fragment key={item.to}>
              <li>
                <SidebarLink item={item} />
              </li>
              {/* Notifications sit right under Home and open a panel instead of a page. */}
              {index === 0 && (
                <li>
                  <NotificationBell variant="sidebar" />
                </li>
              )}
            </Fragment>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-2 border-t border-line p-3">
        <NavLink
          to={ROUTES.SAFETY}
          title="Community guidelines"
          className={({ isActive }) => cn('inline-flex h-10 w-full items-center justify-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors lg:justify-start lg:px-4', isActive ? 'bg-primary-soft text-primary-soft-fg' : 'text-ink-muted hover:bg-surface-muted hover:text-ink')}
        >
          <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
          <span className="sr-only lg:not-sr-only">Community guidelines</span>
        </NavLink>
        <ThemeToggle showLabel />
        <SidebarAccount />
      </div>
    </aside>
  );
}
