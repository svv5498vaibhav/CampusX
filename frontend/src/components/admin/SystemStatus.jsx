import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAdminStore } from '@/store/adminStore';
import { formatRelativeTime } from '@/utils/time';
import { cn } from '@/utils/cn';
import { TerminalLabel } from './AdminUi';

/*
 * Live system status, as the server reports it (GET /admin/system-status, falling back to the public
 * health check). Every row says what it is: never "online" by assumption. Re-checked every 30 seconds.
 */

const REFRESH_MS = 30_000;

const STATES = {
  online: { label: 'Online', tone: 'ok' },
  connected: { label: 'Online', tone: 'ok' },
  connecting: { label: 'Connecting', tone: 'warn' },
  disconnecting: { label: 'Disconnecting', tone: 'warn' },
  disconnected: { label: 'Offline', tone: 'down' },
  unavailable: { label: 'Offline · memory fallback', tone: 'warn' },
  not_configured: { label: 'Not configured · memory', tone: 'idle' },
  offline: { label: 'Offline', tone: 'down' },
  unknown: { label: 'Unknown', tone: 'idle' },
};

const DOTS = {
  ok: 'bg-ax-success ring-3 ring-ax-success/20',
  warn: 'bg-ax-warning ring-3 ring-ax-warning/20',
  down: 'bg-ax-danger ring-3 ring-ax-danger/20',
  idle: 'bg-ax-subtle',
};

function Row({ name, value }) {
  const state = STATES[value] ?? STATES.unknown;
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className={cn('size-2 rounded-full', DOTS[state.tone], state.tone === 'ok' && 'motion-safe:animate-pulse')} />
        <span className="font-mono text-[11px] tracking-[0.08em] text-ax-text uppercase">{name}</span>
      </span>
      <span className={cn('text-right text-[11px]', state.tone === 'down' ? 'text-ax-danger' : state.tone === 'warn' ? 'text-ax-warning' : 'text-ax-muted')}>{state.label}</span>
    </li>
  );
}

/** Starts the 30-second status check (mounted once, in the admin layout). */
export function useSystemStatusPolling() {
  useEffect(() => {
    const { refreshSystem } = useAdminStore.getState();
    refreshSystem();
    const timer = setInterval(refreshSystem, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);
}

export function SystemStatus({ compact = false, className }) {
  const system = useAdminStore((state) => state.system);
  const status = useAdminStore((state) => state.systemStatus);
  const checkedAt = useAdminStore((state) => state.systemCheckedAt);
  const liveStatus = useAdminStore((state) => state.liveStatus);
  const refreshSystem = useAdminStore((state) => state.refreshSystem);

  return (
    <section aria-label="System status" className={cn('rounded-xl border border-ax-border bg-ax-bg-2 p-3', className)}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <TerminalLabel className="text-[10px]">System status</TerminalLabel>
        <button type="button" onClick={refreshSystem} className="grid size-6 place-items-center rounded text-ax-subtle hover:text-ax-text" aria-label="Check system status again">
          <RefreshCw className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      {status === 'unreachable' ? (
        <ul className="space-y-2" aria-live="polite">
          <Row name="API" value="offline" />
          <li className="text-[11px] text-ax-muted">The API isn’t answering, so the database and Redis can’t be checked.</li>
        </ul>
      ) : !system ? (
        <p className="text-[11px] text-ax-subtle">Checking…</p>
      ) : (
        <ul className="space-y-2" aria-live="polite">
          <Row name="API" value={system.api} />
          <Row name="Database" value={system.database} />
          <Row name="Redis" value={system.redis} />
          {!compact && <Row name="Live updates" value={liveStatus === 'live' ? 'online' : liveStatus === 'offline' ? 'offline' : 'connecting'} />}
        </ul>
      )}
      {checkedAt && <p className="mt-2.5 font-mono text-[10px] text-ax-subtle">checked {formatRelativeTime(checkedAt) === 'now' ? 'just now' : `${formatRelativeTime(checkedAt)} ago`}</p>}
    </section>
  );
}
