import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Flag, Info, ShieldAlert } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Refetching } from '@/components/admin/AdminChart';
import { AdminButton, AdminEmpty, AdminError, AdminLoading, AdminPageHeader, AdminPagination, AdminPanel, AdminTabs, FilterBar, FilterSelect, KeyValues, StatusPill, Tag, TimeAgo, shortId } from '@/components/admin/AdminUi';
import { ConfirmActionModal } from '@/components/admin/ConfirmActionModal';
import { ReportTable, reportActionsFor } from '@/components/admin/ReportTable';
import { TargetAuthor } from '@/components/admin/ModerationTable';
import { ADMIN_ROUTES, PERMISSIONS, REPORT_ACTIONS, TARGET_LABELS, casePath, targetLabel } from '@/constants/admin';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { adminApi } from '@/services/adminApi';
import { reportApi } from '@/services/reportApi';
import { useAdminStore } from '@/store/adminStore';
import { toast } from '@/store/toastStore';
import { formatDateTime } from '@/utils/time';

const MESSAGES = { review: 'Report marked as under review.', resolve: 'Report resolved. The reporter has been told.', reject: 'Report rejected. The reporter has been told.', escalate: 'Report escalated.' };

/** Review is one click; resolving, rejecting and escalating are confirmed (they notify the reporter or raise priority). */
function useReportAction(onDone) {
  const canAct = useAdminStore((state) => state.can(PERMISSIONS.REVIEW_MODERATION));
  const [pending, setPending] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const run = async (report, action, note) => {
    setBusyId(report.id);
    try {
      const result = await adminApi.actOnReport(report.id, { action, ...(note && { note }) });
      toast.success(MESSAGES[action]);
      onDone(result);
    } catch (failure) {
      if (failure.status === 409) onDone(null);
      throw failure;
    } finally {
      setBusyId(null);
    }
  };

  const start = (report, action) => {
    if (action === 'review') run(report, action).catch((failure) => toast.error(failure.message));
    else setPending({ report, action });
  };

  const modal = (
    <ConfirmActionModal
      open={Boolean(pending)}
      onClose={() => setPending(null)}
      title={pending ? `${REPORT_ACTIONS[pending.action].label} report ${shortId(pending.report.id)}?` : ''}
      description={pending ? REPORT_ACTIONS[pending.action].description : ''}
      confirmLabel={pending ? REPORT_ACTIONS[pending.action].label : ''}
      reasonLabel="Note for the team"
      onConfirm={(note) => run(pending.report, pending.action, note)}
    />
  );
  return { start: canAct ? start : null, busyId, modal };
}

const TABS = [
  { id: 'pending', label: 'New' },
  { id: 'reviewing', label: 'Under review' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Rejected' },
  { id: 'high', label: 'High priority' },
  { id: 'all', label: 'All' },
];

function ReportQueue() {
  useDocumentTitle('Admin · Reports');
  const [filters, update] = useUrlFilters({ status: 'pending', targetType: '', reason: '', page: '1' });
  const [data, setData] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify(filters);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await adminApi.reports({ ...filters, page: Number(filters.page) || 1, limit: 20 }));
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    reportApi
      .getOptions()
      .then((options) => setReasons(options.reasons ?? []))
      .catch(() => setReasons([]));
  }, []);

  const { start, busyId, modal } = useReportAction(() => load());
  const set = (changes) => update({ ...changes, page: '1' });
  const counts = data?.counts;
  const tabs = TABS.map((tab) => ({ ...tab, count: counts ? (tab.id === 'high' ? counts.high : counts[tab.id]) : undefined }));

  return (
    <div className="space-y-6">
      <AdminPageHeader eyebrow="Moderation · Reports" title="Report management" description="Every report students filed, one at a time. Reporters are never identified, and closing a report tells them the outcome." />
      <AdminPanel label="Report queue" bodyClassName="space-y-4">
        <AdminTabs label="Report status" tabs={tabs} value={filters.status} onChange={(status) => set({ status })} />
        <FilterBar>
          <FilterSelect label="Reported item" value={filters.targetType} onChange={(targetType) => set({ targetType })} options={[{ value: '', label: 'Anything' }, ...Object.entries(TARGET_LABELS).map(([value, label]) => ({ value, label }))]} />
          <FilterSelect label="Reason" value={filters.reason} onChange={(reason) => set({ reason })} options={[{ value: '', label: 'Any reason' }, ...reasons.map((reason) => ({ value: reason.id, label: reason.label }))]} />
        </FilterBar>
        {counts?.legacyPending > 0 && (
          <p className="flex items-start gap-2 rounded-lg border border-ax-border bg-ax-bg-2 px-3 py-2 text-xs text-ax-muted">
            <Info className="mt-0.5 size-3.5 shrink-0 text-ax-neon" aria-hidden="true" />
            {counts.legacyPending} older {counts.legacyPending === 1 ? 'report was' : 'reports were'} filed before Trust &amp; Safety (Phase 13) and still {counts.legacyPending === 1 ? 'waits' : 'wait'} in the earlier report collections; they are not part of this queue.
          </p>
        )}
        {!data && error && <AdminError error={error} onRetry={load} />}
        {!data && !error && <AdminLoading label="Loading reports" />}
        {data && (
          <Refetching busy={busy}>
            {data.reports.length === 0 ? <AdminEmpty icon={Flag} title="No reports here" description="Nothing in this view right now." /> : <ReportTable reports={data.reports} onAction={start ?? (() => {})} busyId={busyId} />}
            <AdminPagination pagination={data.pagination} onPage={(page) => update({ page: String(page) })} />
          </Refetching>
        )}
      </AdminPanel>
      {modal}
    </div>
  );
}

function ReportView({ reportId }) {
  useDocumentTitle('Admin · Report');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminApi.report(reportId));
    } catch (failure) {
      setError(failure);
    }
  }, [reportId]);
  useEffect(() => {
    load();
  }, [load]);
  const { start, busyId, modal } = useReportAction((result) => (result ? setData(result) : load()));

  if (error && !data) return <AdminError title={error.status === 404 ? 'Report not found' : 'Couldn’t load this report'} error={error} onRetry={error.status === 404 ? undefined : load} />;
  if (!data) return <AdminLoading label="Loading report" />;
  const { report, case: moderationCase, otherReports } = data;
  const actions = reportActionsFor(report);

  return (
    <div className="space-y-5">
      <AdminButton as={Link} to={ADMIN_ROUTES.REPORTS} size="sm" tone="neutral" icon={ArrowLeft}>
        Report queue
      </AdminButton>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <div className="min-w-0 space-y-5">
          <AdminPanel label={`Report ${shortId(report.id)}`}>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill kind="report" value={report.status} />
              <StatusPill kind="priority" value={report.priority} prefix="Priority" />
              <Tag tone="violet">{targetLabel(report.targetType)}</Tag>
            </div>
            <KeyValues
              className="mt-4"
              items={[
                { label: 'Reason', value: report.reasonLabel },
                { label: 'Filed', value: formatDateTime(report.createdAt) },
                { label: 'Student’s description', value: report.description ? `“${report.description}”` : 'None given' },
                { label: 'Other reports on this item', value: otherReports },
                { label: 'Closed', value: report.resolvedAt ? formatDateTime(report.resolvedAt) : 'Still open' },
                { label: 'Report abuse signal', value: report.suspicious ? 'Sent during a burst of reports' : 'None' },
              ]}
            />
            <p className="mt-4 text-[11px] text-ax-subtle">The reporter’s identity is never shown.</p>
          </AdminPanel>
          <AdminPanel label="Reported content" actions={report.target?.link && report.target.exists && <AdminButton as="a" href={report.target.link} target="_blank" rel="noreferrer" size="sm">Open in CampusX</AdminButton>}>
            {report.target?.exists ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <TargetAuthor author={report.target.author} />
                  {report.target.status && report.targetType !== 'opportunity' && <StatusPill kind={report.targetType === 'user' ? 'account' : 'content'} value={report.target.status} />}
                </div>
                {report.target.title && <h3 className="mt-3 font-display text-lg font-bold text-ax-text">{report.target.title}</h3>}
                <p className="mt-2 rounded-lg border border-ax-border bg-ax-bg-2/70 p-3 text-sm whitespace-pre-wrap text-ax-text">{report.target.text || '(no text)'}</p>
              </>
            ) : (
              <p className="text-sm text-ax-subtle italic">This content no longer exists.</p>
            )}
          </AdminPanel>
        </div>
        <div className="min-w-0 space-y-5">
          <AdminPanel label="Actions">
            {!start ? (
              <p className="text-sm text-ax-subtle">Your role can read reports but not act on them.</p>
            ) : actions.length === 0 ? (
              <p className="text-sm text-ax-muted">This report is closed.</p>
            ) : (
              <ul className="space-y-2">
                {actions.map((action) => (
                  <li key={action}>
                    <button type="button" disabled={busyId === report.id} onClick={() => start(report, action)} className="flex w-full flex-col items-start rounded-lg border border-ax-border p-2.5 text-left hover:border-ax-violet/50 hover:bg-ax-card-hover disabled:opacity-50">
                      <span className="text-sm font-semibold text-ax-text">{REPORT_ACTIONS[action].label}</span>
                      <span className="text-[11px] text-ax-subtle">{REPORT_ACTIONS[action].description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </AdminPanel>
          <AdminPanel label="Moderation case">
            {moderationCase ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill kind="case" value={moderationCase.status} />
                  <StatusPill kind="risk" value={moderationCase.riskLevel} prefix="Risk" />
                  <StatusPill kind="priority" value={moderationCase.priority} prefix="Priority" />
                </div>
                <p className="mt-3 text-sm text-ax-muted">
                  {moderationCase.reportCount} {moderationCase.reportCount === 1 ? 'report' : 'reports'} · score {moderationCase.automatedScore}/100
                </p>
                <AdminButton as={Link} to={casePath(moderationCase.id)} tone="primary" size="sm" icon={ShieldAlert} className="mt-3">
                  Open case to act on the content
                </AdminButton>
              </>
            ) : (
              <p className="text-sm text-ax-subtle">No case is linked to this report.</p>
            )}
          </AdminPanel>
          <p className="px-1 text-xs text-ax-subtle">
            Last updated <TimeAgo value={report.updatedAt} />
          </p>
        </div>
      </div>
      {modal}
    </div>
  );
}

/** /admin/reports (the queue) and /admin/reports/:reportId (one report). */
export default function AdminReports() {
  const { reportId } = useParams();
  return reportId ? <ReportView key={reportId} reportId={reportId} /> : <ReportQueue />;
}
