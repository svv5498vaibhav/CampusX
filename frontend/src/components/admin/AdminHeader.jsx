import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Flag, LogOut, Menu, Moon, Search, ShieldAlert, Siren, Sun } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { ADMIN_ROUTES, PERMISSIONS, casePath, reportPath, targetLabel } from '@/constants/admin';
import { useLogout } from '@/hooks/useLogout';
import { ADMIN_THEMES } from '@/constants/appThemes';
import { useAdminStore } from '@/store/adminStore';
import { useThemeStore } from '@/store/themeStore';
import { cn } from '@/utils/cn';
import { popover } from '@/utils/motion';
import { formatRelativeTime } from '@/utils/time';
import { AdminAvatar, StatusPill, TerminalLabel } from './AdminUi';

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
        className="h-9 w-full rounded-lg border border-ax-border bg-ax-bg-2 pr-3 pl-9 text-sm text-ax-text outline-none transition-[border-color,box-shadow] placeholder:text-ax-subtle hover:border-ax-border-strong focus:border-ax-violet focus:ring-2 focus:ring-ax-violet/25"
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
        className="relative grid size-9 place-items-center rounded-lg border border-ax-border bg-ax-bg-2 text-ax-muted transition-colors hover:border-ax-border-strong hover:text-ax-text"
      >
        <Bell className="size-4" aria-hidden="true" />
        {unseen > 0 && <span className="absolute -top-1.5 -right-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-ax-violet px-1 font-mono text-[10px] font-bold text-ax-on-accent tabular-nums">{unseen > 9 ? '9+' : unseen}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div {...popover} className="admin-float absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] origin-top-right overflow-hidden">
            <div className="flex items-center justify-between border-b border-ax-border px-4 py-2.5">
              <TerminalLabel>Live alerts</TerminalLabel>
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
                        <Link to={view.to} onClick={() => setOpen(false)} className="block transition-colors hover:bg-ax-card-hover">
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

/** The control center's own light/dark choice (Aurora Glass Dark by default), separate from the student app's theme. */
function AdminThemeToggle() {
  const adminMode = useThemeStore((state) => state.adminMode);
  const setAdminMode = useThemeStore((state) => state.setAdminMode);
  const current = ADMIN_THEMES.find((theme) => theme.mode === adminMode) ?? ADMIN_THEMES[0];
  const next = ADMIN_THEMES.find((theme) => theme.mode !== adminMode) ?? ADMIN_THEMES[0];
  const Icon = adminMode === 'dark' ? Moon : Sun;
  return (
    <button
      type="button"
      onClick={() => setAdminMode(next.mode)}
      aria-label={`Admin theme: ${current.name}. Switch to ${next.name}`}
      title={`Switch to ${next.name}`}
      className="relative grid size-9 place-items-center overflow-hidden rounded-lg border border-ax-border bg-ax-bg-2 text-ax-muted transition-colors hover:border-ax-border-strong hover:text-ax-text"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={adminMode} className="grid place-items-center" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
          <Icon className="size-4" aria-hidden="true" />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

export function AdminHeader({ onMenu }) {
  const session = useAdminStore((state) => state.session);
  const overall = useOverallStatus();
  const logout = useLogout();
  const [signingOut, setSigningOut] = useState(false);
  const user = session?.user;

  return (
    <header className="sticky top-0 z-30 border-b border-ax-border bg-ax-bg/70 backdrop-blur-xl backdrop-saturate-150">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button type="button" onClick={onMenu} className="grid size-9 place-items-center rounded-lg border border-ax-border text-ax-muted hover:text-ax-text md:hidden" aria-label="Open navigation">
          <Menu className="size-4.5" aria-hidden="true" />
        </button>
        <p className="flex min-w-0 items-center gap-2 truncate font-display text-sm font-semibold tracking-tight text-ax-text sm:text-[15px]">
          <span>CampusX</span>
          <span aria-hidden="true" className="h-4 w-px bg-ax-border-strong" />
          <span className="truncate text-ax-muted">
            <span className="hidden sm:inline">Admin control center</span>
            <span className="sm:hidden">Control center</span>
          </span>
        </p>
        <HeaderSearch className="ml-auto hidden w-72 lg:block xl:w-96" />
        <div className="ml-auto flex items-center gap-2 lg:ml-3">
          <span className={cn('hidden items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.12em] uppercase transition-colors sm:inline-flex', overall.tone === 'ok' ? 'border-ax-success/30 text-ax-success' : overall.tone === 'warn' ? 'border-ax-warning/40 text-ax-warning' : overall.tone === 'down' ? 'border-ax-danger/40 text-ax-danger' : 'border-ax-border text-ax-subtle')} role="status">
            <span aria-hidden="true" className={cn('size-1.5 rounded-full', overall.tone === 'ok' ? 'bg-ax-success' : overall.tone === 'warn' ? 'bg-ax-warning' : overall.tone === 'down' ? 'bg-ax-danger' : 'bg-ax-subtle')} />
            {overall.label}
          </span>
          <AdminThemeToggle />
          <LiveEvents />
          {user && (
            <span className="flex items-center gap-2 rounded-lg border border-ax-border bg-ax-bg-2 py-1 pr-2.5 pl-1">
              <AdminAvatar src={user.avatarUrl} name={`${user.firstName} ${user.lastName}`} size="sm" />
              <span className="hidden min-w-0 leading-tight md:block">
                <span className="block max-w-32 truncate text-sm font-semibold text-ax-text">{user.firstName}</span>
                <span className="admin-label block text-[10px] text-ax-neon">{session.role}</span>
              </span>
              <span className="admin-label text-[10px] text-ax-neon md:hidden">{session.role === 'admin' ? 'ADM' : 'MOD'}</span>
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
