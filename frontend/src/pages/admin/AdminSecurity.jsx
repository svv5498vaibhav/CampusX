import { useCallback, useEffect, useState } from 'react';
import { CircleCheck, CircleMinus, Info, RefreshCw, TriangleAlert } from 'lucide-react';
import { AdminButton, AdminEmpty, AdminError, AdminLoading, AdminPageHeader, AdminPanel, KeyValues, Tag, TimeAgo } from '@/components/admin/AdminUi';
import { auditActionLabel } from '@/constants/admin';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { adminApi } from '@/services/adminApi';
import { cn } from '@/utils/cn';

/*
 * /admin/security (admins: VIEW_SECURITY). Shows exactly what GET /admin/security/status reports: the
 * environment, service health, which protections are on with their limits, and security event counts.
 * Nothing is inferred or invented here, and the API never sends secrets, hosts or connection strings.
 * It is a snapshot (Refresh asks again), not live monitoring.
 */

const SERVICE_STATES = {
  connected: { label: 'Online', tone: 'ok' },
  online: { label: 'Online', tone: 'ok' },
  configured: { label: 'Configured (not checked live)', tone: 'ok' },
  connecting: { label: 'Connecting', tone: 'warn' },
  disconnecting: { label: 'Disconnecting', tone: 'warn' },
  unavailable: { label: 'Unavailable · memory fallback', tone: 'warn' },
  disconnected: { label: 'Offline', tone: 'down' },
  offline: { label: 'Offline', tone: 'down' },
  not_configured: { label: 'Not configured', tone: 'idle' },
};
const SERVICES = [
  { id: 'database', label: 'MongoDB' },
  { id: 'redis', label: 'Redis (shared limits & cache)' },
  { id: 'realtime', label: 'Socket.IO (live updates)' },
  { id: 'cloudinary', label: 'Cloudinary (media)' },
];

const TONE_STYLES = {
  ok: { icon: CircleCheck, className: 'text-ax-success' },
  warn: { icon: TriangleAlert, className: 'text-ax-warning' },
  down: { icon: TriangleAlert, className: 'text-ax-danger' },
  idle: { icon: CircleMinus, className: 'text-ax-subtle' },
};

/** Icon + words (never colour alone). */
function State({ tone, children }) {
  const { icon: Icon, className } = TONE_STYLES[tone] ?? TONE_STYLES.idle;
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-medium', className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}

const onOff = (value, { on = 'On', off = 'Off', offTone = 'warn' } = {}) => (value ? <State tone="ok">{on}</State> : <State tone={offTone}>{off}</State>);
const minutes = (value) => `${value} min`;
const perWindow = ({ max, windowMinutes }) => `${max} per ${windowMinutes} min`;

// Security events the audit log has no wording for (they only reach the server log).
const EVENT_LABELS = {
  INVALID_TOKEN: 'Invalid or forged access token',
  REQUEST_REJECTED: 'Request refused by input screening',
  UPLOAD_REJECTED: 'Upload refused',
};
const eventLabel = (type) => EVENT_LABELS[type] ?? auditActionLabel(type);

function EventsTable({ sinceStart, audited }) {
  const types = [...new Set([...Object.keys(sinceStart), ...Object.keys(audited)])];
  const rows = types.map((type) => ({ type, ...sinceStart[type], audited: audited[type] }));
  if (rows.every((row) => !row.seen && !row.audited)) {
    return <AdminEmpty icon={CircleCheck} title="No security events yet" description="Nothing has been recorded since the API started, and the audit log has no security events from the last 24 hours." />;
  }
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="sr-only">Security events by type</caption>
        <thead>
          <tr className="border-b border-ax-border font-mono text-[10px] tracking-[0.14em] text-ax-subtle uppercase">
            <th scope="col" className="px-4 py-2 font-semibold sm:px-5">Event</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Seen</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Recorded</th>
            <th scope="col" className="px-3 py-2 font-semibold">Last recorded</th>
            <th scope="col" className="px-4 py-2 text-right font-semibold sm:px-5">Audit log, 24 h</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.type} className="border-b border-ax-border/50 last:border-0">
              <th scope="row" className="px-4 py-2.5 font-medium text-ax-text sm:px-5">
                {eventLabel(row.type)}
                <span className="block font-mono text-[10.5px] font-normal text-ax-subtle">{row.type}</span>
              </th>
              <td className="px-3 py-2.5 text-right text-ax-text tabular-nums">{row.seen ?? '—'}</td>
              <td className="px-3 py-2.5 text-right text-ax-text tabular-nums">{row.recorded ?? '—'}</td>
              <td className="px-3 py-2.5 text-ax-muted">{row.lastAt ? <TimeAgo value={row.lastAt} /> : '—'}</td>
              <td className="px-4 py-2.5 text-right text-ax-text tabular-nums sm:px-5">{row.audited ?? <span className="text-ax-subtle">not audited</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminSecurity() {
  useDocumentTitle('Admin · Security');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await adminApi.securityStatus());
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Security // Status"
        title="Security status"
        description="How CampusX is protected right now, as the API reports it about itself. A snapshot, not live monitoring: press Refresh to ask again."
        actions={
          data && (
            <>
              <span className="font-mono text-[11px] text-ax-subtle">
                Checked <TimeAgo value={data.checkedAt} />
              </span>
              <AdminButton size="sm" icon={RefreshCw} loading={busy} onClick={load}>
                Refresh
              </AdminButton>
            </>
          )
        }
      />

      {!data && error && <AdminError error={error} onRetry={load} />}
      {!data && !error && <AdminLoading label="Checking security status" />}
      {data && <SecurityReport data={data} error={error} />}
    </div>
  );
}

function SecurityReport({ data, error }) {
  const { services, protections, authentication: auth, rateLimits, uploads, events } = data;
  const headers = protections.securityHeaders;
  return (
    <div className="space-y-5">
      {error && <AdminError title="Couldn’t refresh; showing the last answer" error={error} />}

      <div className="flex flex-wrap items-center gap-2 text-sm text-ax-muted">
        <Tag tone={data.production ? 'success' : 'warning'}>{data.environment}</Tag>
        {!data.production && <span>Development settings: production turns on HSTS and Secure cookies and hides error details.</span>}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <AdminPanel label="Services" title="Service health">
          <ul className="space-y-3">
            {SERVICES.map((service) => {
              const state = SERVICE_STATES[services[service.id]] ?? { label: services[service.id] ?? 'Unknown', tone: 'idle' };
              return (
                <li key={service.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                  <span className="text-ax-text">{service.label}</span>
                  <State tone={state.tone}>{state.label}</State>
                </li>
              );
            })}
          </ul>
        </AdminPanel>

        <AdminPanel label="Authentication" title="Sign-in and sessions">
          <KeyValues
            items={[
              { label: 'JWT secret', value: auth.jwtSecret === 'configured' ? <State tone="ok">Configured</State> : <State tone="warn">Temporary development secret</State> },
              { label: 'Token algorithm', value: auth.algorithm },
              { label: 'Access token lifetime', value: minutes(auth.accessTokenMinutes) },
              { label: 'Session (refresh) lifetime', value: `${auth.sessionDays} days` },
              {
                label: 'Refresh cookie',
                value: [auth.refreshCookie.httpOnly && 'HttpOnly', auth.refreshCookie.secure ? 'Secure' : 'not Secure (HTTP)', `SameSite=${auth.refreshCookie.sameSite}`].filter(Boolean).join(' · '),
              },
              { label: 'Password hashing', value: `${auth.passwordHashing.algorithm}, cost ${auth.passwordHashing.cost}` },
              { label: 'Account lock', value: `${auth.accountLock.attempts} wrong passwords → ${minutes(auth.accountLock.minutes)}${auth.accountLock.unknownEmailsToo ? ' (unknown emails too)' : ''}` },
            ]}
          />
        </AdminPanel>

        <AdminPanel label="Protections" title="Requests and responses">
          <KeyValues
            items={[
              { label: 'Security headers', value: onOff(headers.enabled) },
              { label: 'Content-Security-Policy (API)', value: <code className="font-mono text-xs break-all text-ax-muted">{headers.contentSecurityPolicy}</code> },
              { label: 'Frame options', value: headers.frameOptions },
              { label: 'HSTS', value: onOff(headers.strictTransportSecurity, { off: 'Off (HTTP development)', offTone: data.production ? 'down' : 'idle' }) },
              { label: 'Referrer policy', value: headers.referrerPolicy },
              { label: 'CORS', value: `${protections.cors.mode}, ${protections.cors.allowedOrigins} origin${protections.cors.allowedOrigins === 1 ? '' : 's'}${protections.cors.credentials ? ', with credentials' : ''}` },
              { label: 'Mongo operator stripping', value: onOff(protections.input.mongoOperatorStripping) },
              { label: 'Parameter pollution guard', value: onOff(protections.input.parameterPollution) },
              { label: 'Request screening', value: onOff(protections.input.requestScreening) },
              { label: 'Body limit · max depth', value: `${protections.input.bodyLimit} · ${protections.input.maxDepth} levels` },
              { label: 'Default caching', value: protections.responses.defaultCacheControl },
              { label: 'Error details in responses', value: protections.responses.stackTracesInErrors ? <State tone={data.production ? 'down' : 'idle'}>Shown (development)</State> : <State tone="ok">Hidden</State> },
              { label: 'Trusted proxy hops', value: String(protections.trustProxyHops || 0) },
            ]}
          />
        </AdminPanel>

        <AdminPanel label="Rate limits" title="Limits and where they are counted">
          <KeyValues
            items={[
              {
                label: 'Counter store',
                value: rateLimits.store === 'redis' ? <State tone="ok">Redis (shared by every API process)</State> : <State tone="warn">Memory (per API process, reset on restart)</State>,
              },
              { label: 'API requests per address', value: `${rateLimits.apiRequestsPer15MinutesPerAddress.toLocaleString()} per 15 min` },
              { label: 'Failed sign-ins per address', value: perWindow(rateLimits.failedSignInsPerAddress) },
              { label: 'Sign-ups per address', value: perWindow(rateLimits.signUpsPerAddress) },
              { label: 'Socket handshakes per address', value: `${rateLimits.socketHandshakesPerMinutePerAddress} per min` },
              { label: 'Live connections per student', value: String(rateLimits.socketConnectionsPerStudent) },
            ]}
          />
        </AdminPanel>
      </div>

      <AdminPanel label="Uploads" title="File checks">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-2 text-ax-muted">Content sniffing {onOff(uploads.contentSniffing)}</span>
            <span className="flex items-center gap-2 text-ax-muted">File-name checks {onOff(uploads.fileNameChecks)}</span>
            <span className="flex items-center gap-2 text-ax-muted">PDF active-content check {onOff(uploads.pdfActiveContentCheck)}</span>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {Object.entries(uploads.presets).map(([name, preset]) => (
              <li key={name} className="rounded-xl border border-ax-border bg-ax-bg-2/70 p-3">
                <p className="font-mono text-[11px] tracking-[0.12em] text-ax-text uppercase">{name}</p>
                <p className="mt-1 text-xs text-ax-muted">
                  up to {preset.maxMb} MB · {preset.types.map((type) => type.split('/')[1]).join(', ')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </AdminPanel>

      <AdminPanel label="Security events" title="Recorded events">
        <p className="mb-4 flex items-start gap-2 text-xs text-ax-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          “Seen” and “Recorded” count this API process since it started (repeats of one event are recorded once per throttle window) and reset on restart. The last column comes from the audit log, which keeps account events.
        </p>
        <EventsTable sinceStart={events.sinceStart} audited={events.auditedLast24Hours} />
      </AdminPanel>
    </div>
  );
}
