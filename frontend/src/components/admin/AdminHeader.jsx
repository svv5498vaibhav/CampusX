import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Flag, LogOut, Menu, Search, ShieldAlert, Siren } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { ADMIN_ROUTES, PERMISSIONS, casePath, reportPath, targetLabel } from '@/constants/admin';
import { useLogout } from '@/hooks/useLogout';
import { useAdminStore } from '@/store/adminStore';
import { cn } from '@/utils/cn';
import { formatRelativeTime } from '@/utils/time';
import { AdminAvatar, StatusPill } from './AdminUi';

/** Overall state from the real checks: online · degraded (database or configured Redis down) · unreachable. */
function useOverallStatus() {
  const system = useAdminStore((state) => state.system);
  const status = useAdminStore((state) => state.systemStatus);
  if (status === 'unreachable') return { label: 'System unreachable', tone: 'down' };
  if (!system) return { label: 'Checking system', tone: 'idle' };
  if (system.database !== 'connected' || system.redis === 'unavailable') return { label: 'System degraded', tone: 'warn' };
  return { label: 'System online', tone: 'ok' };
}

/** Admins search students; moderators search content. Enter goes to that page with the query. */
function HeaderSearch({ className, onDone }) {
  const can = useAdminStore((state) => state.can);
  const permissions = useAdminStore((state) => state.session?.permissions);
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const target = can(PERMISSIONS.MANAGE_USERS) ? { path: ADMIN_ROUTES.USERS, label: 'Search students', hint: 'Search students by name, email, college or branch' } : can(PERMISSIONS.MANAGE_CONTENT) ? { path: ADMIN_ROUTES.CONTENT, label: 'Search content', hint: 'Search posts and other content' } : null;
  if (!permissions || !target) return null;
  return (
    <form
      role="search"
      className={cn('relative', className)}
      onSubmit={(event) => {
        event.preventDefault();
        const query = text.trim();
        navigate(query ? `${target.path}?search=${encodeURIComponent(query)}` : target.path);
        setText('');
        onDone?.();
      }}
    >
      <label className="sr-only" htmlFor="admin-header-search">
        {target.hint}
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ax-subtle" aria-hidden="true" />
      <input
        id="admin-header-search"
        type="search"
        value={text}
        maxLength={80}
        onChange={(event) => setText(event.target.value)}
        placeholder={target.label}
        className="h-9 w-full rounded-lg border border-ax-border bg-ax-bg-2 pr-3 pl-9 text-sm text-ax-text outline-none placeholder:text-ax-subtle focus:border-ax-violet"
      />
    </form>
  );
}

function eventView(event) {
  if (event.kind === 'report') return { icon: Flag, title: `New report: ${targetLabel(event.targetType)}`, detail: event.reason?.replace(/_/g, ' '), to: reportPath(event.reportId), priority: event.priority };
  if (event.kind === 'case') return { icon: ShieldAlert, title: `New case: ${targetLabel(event.targetType)}`, detail: event.source === 'report' ? 'from a report' : 'automated check', to: casePath(event.caseId), priority: event.priority };
  return { icon: Siren, title: event.message, detail: event.service, to: null, priority: event.level === 'warning' ? 'high' : null };
}

function LiveEvents() {
  const events = useAdminStore((state) => state.events);
  const unseen = useAdminStore((state) => state.unseenEvents);
  const markEventsSeen = useAdminStore((state) => state.markEventsSeen);
  const liveStatus = useAdminStore((state) => state.liveStatus);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    markEventsSeen();
    const close = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unseen ? `Live alerts, ${unseen} new` : 'Live alerts'}
        className="relative grid size-9 place-items-center rounded-lg border border-ax-border bg-ax-bg-2 text-ax-muted hover:border-ax-violet/60 hover:text-ax-text"
      >
        <Bell className="size-4" aria-hidden="true" />
        {unseen > 0 && <span className="absolute -top-1.5 -right-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-ax-neon px-1 font-mono text-[10px] font-bold text-white shadow-[0_0_10px_var(--ax-neon)]">{unseen > 9 ? '9+' : unseen}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="admin-panel absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-ax-border px-4 py-2.5">
              <p className="font-mono text-[10.5px] font-semibold tracking-[0.18em] text-ax-muted uppercase">
                <span className="text-ax-neon">//</span> Live alerts
              </p>
              <span className="font-mono text-[10px] text-ax-subtle">{liveStatus === 'live' ? '● live' : '○ offline'}</span>
            </div>
            {events.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ax-subtle">New reports, cases and system alerts appear here while this page is open.</p>
            ) : (
              <ul className="max-h-80 divide-y divide-ax-border/60 overflow-y-auto">
                {events.map((event) => {
                  const view = eventView(event);
                  const Icon = view.icon;
                  const body = (
                    <span className="flex gap-3 px-4 py-2.5">
                      <Icon className="mt-0.5 size-4 shrink-0 text-ax-neon" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-ax-text">{view.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ax-subtle">
                          {view.priority && <StatusPill kind="priority" value={view.priority} />}
                          {view.detail}
                          <span>· {formatRelativeTime(event.at)}</span>
                        </span>
                      </span>
                    </span>
                  );
                  return (
                    <li key={event.id}>
                      {view.to ? (
                        <Link to={view.to} onClick={() => setOpen(false)} className="block hover:bg-ax-card-hover">
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AdminHeader({ onMenu }) {
  const session = useAdminStore((state) => state.session);
  const overall = useOverallStatus();
  const logout = useLogout();
  const [signingOut, setSigningOut] = useState(false);
  const user = session?.user;

  return (
    <header className="sticky top-0 z-30 border-b border-ax-border bg-ax-bg/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button type="button" onClick={onMenu} className="grid size-9 place-items-center rounded-lg border border-ax-border text-ax-muted hover:text-ax-text md:hidden" aria-label="Open navigation">
          <Menu className="size-4.5" aria-hidden="true" />
        </button>
        <p className="min-w-0 truncate font-mono text-xs font-semibold tracking-[0.18em] text-ax-text uppercase sm:text-[13px]">
          <span className="hidden sm:inline">CampusX </span>
          <span className="sm:hidden">CX </span>
          <span className="text-ax-neon">//</span>
          <span className="hidden sm:inline"> Admin control center</span>
          <span className="sm:hidden"> Control</span>
        </p>
        <HeaderSearch className="ml-auto hidden w-72 lg:block xl:w-96" />
        <div className="ml-auto flex items-center gap-2 lg:ml-3">
          <span className={cn('hidden items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase sm:inline-flex', overall.tone === 'ok' ? 'border-ax-success/30 text-ax-success' : overall.tone === 'warn' ? 'border-ax-warning/40 text-ax-warning' : overall.tone === 'down' ? 'border-ax-danger/40 text-ax-danger' : 'border-ax-border text-ax-subtle')} role="status">
            <span aria-hidden="true" className={cn('size-1.5 rounded-full', overall.tone === 'ok' ? 'bg-ax-success' : overall.tone === 'warn' ? 'bg-ax-warning' : overall.tone === 'down' ? 'bg-ax-danger' : 'bg-ax-subtle')} />
            {overall.label}
          </span>
          <LiveEvents />
          {user && (
            <span className="flex items-center gap-2 rounded-lg border border-ax-border bg-ax-bg-2 py-1 pr-2.5 pl-1">
              <AdminAvatar src={user.avatarUrl} name={`${user.firstName} ${user.lastName}`} size="sm" />
              <span className="hidden min-w-0 leading-tight md:block">
                <span className="block max-w-32 truncate text-sm font-semibold text-ax-text">{user.firstName}</span>
                <span className="block font-mono text-[9.5px] font-bold tracking-[0.18em] text-ax-neon uppercase">{session.role}</span>
              </span>
              <span className="font-mono text-[9.5px] font-bold tracking-[0.18em] text-ax-neon uppercase md:hidden">{session.role === 'admin' ? 'ADM' : 'MOD'}</span>
            </span>
          )}
          <button
            type="button"
            onClick={async () => {
              setSigningOut(true);
              await logout();
            }}
            disabled={signingOut}
            className="grid size-9 place-items-center rounded-lg border border-ax-border text-ax-muted hover:border-ax-danger/50 hover:text-ax-danger disabled:opacity-50"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {session && (
        <div className="border-t border-ax-border/60 px-4 py-2 lg:hidden">
          <HeaderSearch />
        </div>
      )}
    </header>
  );
}
