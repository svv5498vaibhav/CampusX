import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ScrollText, VenetianMask } from 'lucide-react';
import { Link } from 'react-router';
import { Refetching } from '@/components/admin/AdminChart';
import { AdminEmpty, AdminError, AdminLoading, AdminPageHeader, AdminPagination, AdminPanel, AdminTabs, FilterBar, FilterDate, FilterSelect, Tag, shortId } from '@/components/admin/AdminUi';
import { ACTOR_ROLE_LABELS, AUDIT_CATEGORIES, TARGET_LABELS, adminUserPath, auditActionLabel, casePath, targetLabel } from '@/constants/admin';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { adminApi } from '@/services/adminApi';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/time';

const CATEGORY_TONES = { security: 'danger', users: 'warning', reports: 'violet', opportunities: 'neutral', verification: 'neutral', content: 'violet' };

function Target({ log }) {
  if (log.anonymityProtected) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ax-muted" title="Triggered by anonymous content: the student is hidden to protect the author's anonymity.">
        <VenetianMask className="size-3.5 text-ax-neon" aria-hidden="true" /> Student hidden (anonymous content)
      </span>
    );
  }
  const label = targetLabel(log.targetType);
  if (log.targetType === 'user' && log.targetId) {
    return (
      <Link to={adminUserPath(log.targetId)} className="font-mono text-xs text-ax-neon hover:underline">
        {label} {shortId(log.targetId)}
      </Link>
    );
  }
  return (
    <span className="font-mono text-xs text-ax-muted">
      {label} {shortId(log.targetId)}
    </span>
  );
}

function Actor({ log }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate text-sm text-ax-text">{log.actor?.name ?? (log.actorRole === 'system' ? 'CampusX (automated)' : '—')}</span>
      <span className="block font-mono text-[10px] tracking-wider text-ax-subtle uppercase">{ACTOR_ROLE_LABELS[log.actorRole] ?? log.actorRole}</span>
    </span>
  );
}

function Details({ log }) {
  return (
    <div className="grid gap-3 rounded-lg border border-ax-border bg-ax-bg/70 p-3 text-xs sm:grid-cols-2">
      <p>
        <span className="text-ax-subtle">Full time: </span>
        <span className="text-ax-text">{formatDateTime(log.createdAt)}</span>
      </p>
      <p>
        <span className="text-ax-subtle">Address: </span>
        <span className="font-mono text-ax-text">{log.ip ?? 'not recorded'}</span>
      </p>
      {log.caseId && (
        <p>
          <span className="text-ax-subtle">Case: </span>
          <Link to={casePath(log.caseId)} className="font-mono text-ax-neon hover:underline">
            {shortId(log.caseId)}
          </Link>
        </p>
      )}
      {log.targetId && (
        <p className="truncate">
          <span className="text-ax-subtle">Target id: </span>
          <span className="font-mono text-ax-text">{log.targetId}</span>
        </p>
      )}
      {log.metadata && (
        <pre className="relative overflow-x-auto rounded-md bg-ax-bg-2 p-2 font-mono text-[11px] text-ax-muted sm:col-span-2">{JSON.stringify(log.metadata, null, 2)}</pre>
      )}
    </div>
  );
}

/** /admin/audit-logs (admins): every moderation decision and admin action, newest first. */
export default function AdminAuditLogs() {
  useDocumentTitle('Admin · Audit logs');
  const [filters, update] = useUrlFilters({ category: '', actorRole: '', targetType: '', from: '', to: '', page: '1' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const key = JSON.stringify(filters);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await adminApi.auditLogs({ ...filters, page: Number(filters.page) || 1, limit: 25 }));
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }, [key]);
  useEffect(() => {
    load();
  }, [load]);
  const set = (changes) => update({ ...changes, page: '1' });

  return (
    <div className="space-y-6">
      <AdminPageHeader eyebrow="Security // Audit stream" title="Audit logs" description="Who did what, when, and from where: moderation decisions, account changes, report handling, opportunity changes, sign-ins, refused requests and anonymous-author lookups. Rows are never edited." />
      <AdminPanel label="Audit stream" bodyClassName="space-y-4">
        <AdminTabs label="Category" tabs={AUDIT_CATEGORIES} value={filters.category} onChange={(category) => set({ category })} />
        <FilterBar>
          <FilterSelect label="Actor" value={filters.actorRole} onChange={(actorRole) => set({ actorRole })} options={[{ value: '', label: 'Anyone' }, ...Object.entries(ACTOR_ROLE_LABELS).map(([value, label]) => ({ value, label }))]} />
          <FilterSelect label="Target" value={filters.targetType} onChange={(targetType) => set({ targetType })} options={[{ value: '', label: 'Anything' }, ...Object.entries(TARGET_LABELS).map(([value, label]) => ({ value, label }))]} />
          <FilterDate label="From" value={filters.from} onChange={(from) => set({ from })} />
          <FilterDate label="To" value={filters.to} onChange={(to) => set({ to })} />
        </FilterBar>
        {!data && error && <AdminError error={error} onRetry={load} />}
        {!data && !error && <AdminLoading label="Loading audit log" />}
        {data && (
          <Refetching busy={busy}>
            {data.logs.length === 0 ? (
              <AdminEmpty icon={ScrollText} title="No audit entries match" />
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ax-border font-mono text-[10px] tracking-[0.16em] text-ax-subtle uppercase">
                      <th scope="col" className="py-2.5 pr-3 font-semibold">Time</th>
                      <th scope="col" className="py-2.5 pr-3 font-semibold">Actor</th>
                      <th scope="col" className="py-2.5 pr-3 font-semibold">Action</th>
                      <th scope="col" className="py-2.5 pr-3 font-semibold">Target</th>
                      <th scope="col" className="py-2.5 pr-3 font-semibold">Change</th>
                      <th scope="col" className="py-2.5 pr-3 font-semibold">Reason</th>
                      <th scope="col" className="py-2.5 font-semibold">
                        <span className="sr-only">Details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ax-border/50">
                    {data.logs.map((log) => (
                      <Fragment key={log.id}>
                        <tr className={cn('hover:bg-ax-card-hover/70', open === log.id && 'bg-ax-card-hover/50')}>
                          <td className="py-2.5 pr-3 align-top font-mono text-xs whitespace-nowrap text-ax-muted">{formatDateTime(log.createdAt)}</td>
                          <td className="max-w-[12rem] py-2.5 pr-3 align-top">
                            <Actor log={log} />
                          </td>
                          <td className="py-2.5 pr-3 align-top">
                            <span className="block text-sm font-semibold text-ax-text">{auditActionLabel(log.action)}</span>
                            <Tag tone={CATEGORY_TONES[log.category]} className="mt-1">
                              {log.category}
                            </Tag>
                          </td>
                          <td className="py-2.5 pr-3 align-top">
                            <Target log={log} />
                          </td>
                          <td className="py-2.5 pr-3 align-top font-mono text-xs text-ax-muted">{log.previousStatus || log.newStatus ? `${log.previousStatus ?? '—'} → ${log.newStatus ?? '—'}` : '—'}</td>
                          <td className="max-w-[16rem] py-2.5 pr-3 align-top text-xs break-words text-ax-muted">{log.reason || '—'}</td>
                          <td className="py-2.5 align-top">
                            <button type="button" onClick={() => setOpen(open === log.id ? null : log.id)} aria-expanded={open === log.id} className="grid size-7 place-items-center rounded-md border border-ax-border text-ax-subtle hover:text-ax-text" aria-label="Show details">
                              <ChevronDown className={cn('size-4 transition-transform', open === log.id && 'rotate-180')} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                        {open === log.id && (
                          <tr>
                            <td colSpan={7} className="pb-3">
                              <Details log={log} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <AdminPagination pagination={data.pagination} onPage={(page) => update({ page: String(page) })} />
          </Refetching>
        )}
      </AdminPanel>
    </div>
  );
}
