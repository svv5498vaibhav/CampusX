import { ArrowLeft, PanelLeftOpen, Terminal } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { ADMIN_NAV } from '@/constants/admin';
import { ROUTES } from '@/constants/routes';
import { useAdminStore } from '@/store/adminStore';
import { cn } from '@/utils/cn';
import { SystemStatus } from './SystemStatus';

/*
 * The control center's navigation, grouped like an operations console. Items the signed-in staff
 * member's role can't use aren't listed (the API refuses them anyway).
 *   full   permanent sidebar (laptop/desktop) and the drawer (phone/tablet)
 *   rail   icon rail on tablets; its toggle opens the full drawer
 */

function Brand({ compact }) {
  return (
    <Link to="/admin/dashboard" className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ax-violet" aria-label="CampusX admin control center home">
      <span className="admin-glow grid size-10 shrink-0 place-items-center rounded-xl border border-ax-violet/50 bg-gradient-to-br from-ax-deep/60 to-ax-bg text-ax-neon">
        <Terminal className="size-5" aria-hidden="true" />
      </span>
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block font-display text-base font-extrabold tracking-[0.12em] text-ax-text">CAMPUSX</span>
          <span className="block font-mono text-[9.5px] font-semibold tracking-[0.2em] text-ax-muted">ADMIN CONTROL CENTER</span>
        </span>
      )}
    </Link>
  );
}

export function AdminSidebar({ variant = 'full', onNavigate, onExpand }) {
  const permissions = useAdminStore((state) => state.session?.permissions);
  const rail = variant === 'rail';
  const groups = ADMIN_NAV.map((group) => ({ ...group, items: group.items.filter((item) => permissions?.includes(item.permission)) })).filter((group) => group.items.length);

  return (
    <div className={cn('flex h-full flex-col gap-5 overflow-y-auto border-r border-ax-border bg-ax-bg-2/95 py-5', rail ? 'items-center px-2' : 'px-4')}>
      <Brand compact={rail} />
      {rail && (
        <button type="button" onClick={onExpand} className="grid size-10 place-items-center rounded-lg border border-ax-border text-ax-muted hover:border-ax-violet/60 hover:text-ax-text" aria-label="Expand navigation">
          <PanelLeftOpen className="size-4" aria-hidden="true" />
        </button>
      )}

      <nav aria-label="Admin" className="flex flex-1 flex-col gap-5">
        {!permissions && <p className="px-2 font-mono text-[11px] text-ax-subtle">{rail ? '…' : 'Loading access…'}</p>}
        {groups.map((group) => (
          <div key={group.label}>
            {!rail && <p className="mb-2 px-2 font-mono text-[10px] font-semibold tracking-[0.2em] text-ax-subtle uppercase">{group.label}</p>}
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
                        'group relative flex items-center gap-3 rounded-lg border text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ax-violet',
                        rail ? 'size-11 justify-center' : 'h-10 px-3',
                        isActive ? 'border-ax-violet/50 bg-ax-violet/15 text-ax-text' : 'border-transparent text-ax-muted hover:border-ax-border hover:bg-ax-card hover:text-ax-text',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span aria-hidden="true" className="absolute top-2 bottom-2 -left-px w-0.5 rounded-full bg-ax-neon shadow-[0_0_10px_var(--ax-neon)]" />}
                        <Icon className={cn('size-4.5 shrink-0', isActive ? 'text-ax-neon' : 'text-ax-subtle group-hover:text-ax-muted')} aria-hidden="true" />
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
        className={cn('flex items-center gap-2 rounded-lg text-xs font-semibold text-ax-subtle hover:text-ax-text', rail ? 'size-10 justify-center border border-ax-border' : 'px-2')}
        aria-label={rail ? 'Back to CampusX' : undefined}
        title={rail ? 'Back to CampusX' : undefined}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {!rail && 'Back to CampusX'}
      </Link>
    </div>
  );
}
