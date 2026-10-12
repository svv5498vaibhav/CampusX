import { TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { REPORT_ACTIONS, reportPath } from '@/constants/admin';
import { AdminButton, StatusPill, TimeAgo, shortId } from './AdminUi';
import { TargetSummary } from './ModerationTable';

const ACTIONS_FOR = { pending: ['review', 'resolve', 'reject', 'escalate'], reviewing: ['resolve', 'reject', 'escalate'] };
const TONES = { review: 'violet', resolve: 'success', reject: 'neutral', escalate: 'warning' };

/** Which actions a report still allows (the API checks the same rule atomically). */
export const reportActionsFor = (report) => (ACTIONS_FOR[report.status] ?? []).filter((action) => !(action === 'escalate' && report.priority === 'critical' && report.status === 'reviewing'));

function Actions({ report, onAction, busy }) {
  const actions = reportActionsFor(report);
  if (!actions.length) return <span className="text-xs text-ax-subtle">Closed</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {actions.map((action) => (
        <AdminButton key={action} size="sm" tone={TONES[action]} disabled={busy} onClick={() => onAction(report, action)} aria-label={`${REPORT_ACTIONS[action].label} report ${shortId(report.id)}`}>
          {REPORT_ACTIONS[action].label}
        </AdminButton>
      ))}
    </span>
  );
}

function Reason({ report }) {
  return (
    <span className="block min-w-0">
      <span className="block text-sm text-ax-text">{report.reasonLabel}</span>
      {report.description && <span className="block max-w-56 truncate text-xs text-ax-subtle" title={report.description}>“{report.description}”</span>}
      {report.suspicious && (
        <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-ax-warning">
          <TriangleAlert className="size-3" aria-hidden="true" /> Possible report abuse
        </span>
      )}
    </span>
  );
}

export function ReportTable({ reports, onAction, busyId }) {
  return (
    <>
      <div className="relative hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-ax-border font-mono text-[10px] tracking-[0.16em] text-ax-subtle uppercase">
              <th scope="col" className="py-2.5 pr-3 font-semibold">Report</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Target</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Reason</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Priority</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Status</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Created</th>
              <th scope="col" className="py-2.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ax-border/50">
            {reports.map((report) => (
              <tr key={report.id} className="transition-colors hover:bg-ax-card-hover/70">
                <td className="py-3 pr-3 align-top">
                  <Link to={reportPath(report.id)} className="font-mono text-xs font-semibold text-ax-neon hover:underline">
                    {shortId(report.id)}
                  </Link>
                </td>
                <td className="max-w-[18rem] py-3 pr-3 align-top">
                  <TargetSummary target={report.target} targetType={report.targetType} />
                </td>
                <td className="py-3 pr-3 align-top">
                  <Reason report={report} />
                </td>
                <td className="py-3 pr-3 align-top">
                  <StatusPill kind="priority" value={report.priority} />
                </td>
                <td className="py-3 pr-3 align-top">
                  <StatusPill kind="report" value={report.status} />
                </td>
                <td className="py-3 pr-3 align-top text-xs text-ax-muted">
                  <TimeAgo value={report.createdAt} />
                </td>
                <td className="py-3 align-top">
                  <Actions report={report} onAction={onAction} busy={busyId === report.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2.5 lg:hidden">
        {reports.map((report) => (
          <li key={report.id} className="rounded-xl border border-ax-border bg-ax-bg-2/70 p-3">
            <span className="flex items-center justify-between gap-2">
              <Link to={reportPath(report.id)} className="font-mono text-xs font-semibold text-ax-neon hover:underline">
                {shortId(report.id)}
              </Link>
              <span className="flex items-center gap-1.5">
                <StatusPill kind="priority" value={report.priority} />
                <StatusPill kind="report" value={report.status} />
              </span>
            </span>
            <TargetSummary target={report.target} targetType={report.targetType} className="mt-2" />
            <span className="mt-2 flex items-end justify-between gap-2">
              <Reason report={report} />
              <span className="shrink-0 text-xs text-ax-muted">
                <TimeAgo value={report.createdAt} />
              </span>
            </span>
            <span className="mt-3 block">
              <Actions report={report} onAction={onAction} busy={busyId === report.id} />
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
