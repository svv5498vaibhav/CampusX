import { motion } from 'framer-motion';
import { ArrowLeft, PanelLeftOpen, ShieldHalf } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { ADMIN_NAV } from '@/constants/admin';
import { ROUTES } from '@/constants/routes';
import { useAdminStore } from '@/store/adminStore';
import { cn } from '@/utils/cn';
import { SPRING } from '@/utils/motion';
import { SystemStatus } from './SystemStatus';

/*
 * The control center's navigation, grouped like an operations console. Items the signed-in staff
 * member's role can't use aren't listed (the API refuses them anyway).
 *   full      permanent sidebar (laptop/desktop) and the drawer (phone/tablet, `floating`: frosted glass)
 *   rail      icon rail on tablets; its toggle opens the full drawer
 */

function Brand({ compact }) {
  return (
    <Link to="/admin/dashboard" className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ax-violet" aria-label="CampusX admin control center home">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ax-violet bg-[image:var(--ag-gradient)] text-ax-on-accent shadow-[var(--ag-shadow-button)]">
        <ShieldHalf className="size-5" aria-hidden="true" />
      </span>
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block font-display text-base font-bold tracking-tight text-ax-text">CampusX</span>
          <span className="admin-label block text-[10px] text-ax-subtle">Admin control center</span>
        </span>
      )}
    </Link>
  );
}

export function AdminSidebar({ variant = 'full', floating = false, onNavigate, onExpand }) {
  const permissions = useAdminStore((state) => state.session?.permissions);
  const rail = variant === 'rail';
  const groups = ADMIN_NAV.map((group) => ({ ...group, items: group.items.filter((item) => permissions?.includes(item.permission)) })).filter((group) => group.items.length);
  // One highlight per sidebar instance (the permanent one and the drawer can both be mounted).
  const highlightId = `admin-nav-active-${variant}${floating ? '-drawer' : ''}`;

  return (
    <div
      className={cn(
        'flex h-full flex-col gap-5 overflow-y-auto border-r border-ax-border py-5',
        floating ? 'bg-[var(--ag-glass-strong)] backdrop-blur-xl backdrop-saturate-150' : 'bg-ax-card bg-[image:var(--ag-sheen)]',
        rail ? 'items-center px-2' : 'px-4',
      )}
    >
      <Brand compact={rail} />
      {rail && (
        <button type="button" onClick={onExpand} className="grid size-10 place-items-center rounded-lg border border-ax-border text-ax-muted transition-colors hover:border-ax-border-strong hover:text-ax-text" aria-label="Expand navigation">
          <PanelLeftOpen className="size-4" aria-hidden="true" />
        </button>
      )}

      <nav aria-label="Admin" className="flex flex-1 flex-col gap-5">
        {!permissions && <p className="admin-label px-2 text-ax-subtle">{rail ? '…' : 'Loading access…'}</p>}
        {groups.map((group) => (
          <div key={group.label}>
            {!rail && <p className="admin-label mb-2 px-2 text-[10px] text-ax-subtle">{group.label}</p>}
            <ul className={cn('flex flex-col gap-1', rail && 'items-center')}>
              {group.items.map(({ label, to, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    onClick={onNavigate}
                    title={rail ? label : undefined}
                    aria-label={rail ? label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'group relative isolate flex items-center gap-3 rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ax-violet',
                        rail ? 'size-11 justify-center' : 'h-10 px-3',
                        isActive ? 'text-ax-text' : 'text-ax-muted hover:bg-ax-card-hover hover:text-ax-text',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span layoutId={highlightId} transition={SPRING.selection} aria-hidden="true" className="absolute inset-0 -z-10 rounded-lg border border-ax-violet/35 bg-ax-violet/12">
                            <span className="absolute top-2 bottom-2 -left-px w-[3px] rounded-full bg-gradient-to-b from-ax-violet to-ax-neon" />
                          </motion.span>
                        )}
                        <Icon className={cn('size-4.5 shrink-0 transition-colors', isActive ? 'text-ax-neon' : 'text-ax-subtle group-hover:text-ax-muted')} aria-hidden="true" />
                        {!rail && label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {!rail && <SystemStatus />}
      <Link
        to={ROUTES.HOME}
        onClick={onNavigate}
        className={cn('flex items-center gap-2 rounded-lg text-xs font-semibold text-ax-subtle transition-colors hover:text-ax-text', rail ? 'size-10 justify-center border border-ax-border' : 'px-2')}
        aria-label={rail ? 'Back to CampusX' : undefined}
        title={rail ? 'Back to CampusX' : undefined}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {!rail && 'Back to CampusX'}
      </Link>
    </div>
  );
}
