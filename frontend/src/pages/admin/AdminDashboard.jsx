import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowRight, Compass, FileText, FolderKanban, Flag, RefreshCw, ShieldAlert, UserRound, UsersRound } from 'lucide-react';
import { Link } from 'react-router';
import { BarList, DonutChart, LineChart, Refetching } from '@/components/admin/AdminChart';
import { AdminStatCard } from '@/components/admin/AdminStatCard';
import { AdminButton, AdminError, AdminLoading, AdminPageHeader, AdminPanel, StatusPill, TimeAgo, shortId } from '@/components/admin/AdminUi';
import { AuditTimeline } from '@/components/admin/CaseDetail';
import { TargetSummary } from '@/components/admin/ModerationTable';
import { RiskRadar } from '@/components/admin/RiskRadar';
import { ADMIN_ROUTES, PERMISSIONS, SERIES, SERIES_NEUTRAL, casePath } from '@/constants/admin';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { adminApi } from '@/services/adminApi';
import { useAdminStore } from '@/store/adminStore';

/** /admin/dashboard: the command center. Every number comes from GET /admin/dashboard (database counts). */
export default function AdminDashboard() {
  useDocumentTitle('Admin · Command center');
  const can = useAdminStore((state) => state.can);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async ({ refresh = false } = {}) => {
    setBusy(true);
    setError(null);
    try {
      setData(await adminApi.dashboard({ refresh }));
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data && error) return <AdminError title="Couldn’t load the dashboard" error={error} onRetry={() => load()} />;
  if (!data) return <AdminLoading label="Loading command center" />;

  const { cards, activity, contentCreation, caseStatus, riskRadar, threats, auditStream } = data;
  const reviewLink = can(PERMISSIONS.REVIEW_MODERATION) ? ADMIN_ROUTES.MODERATION : undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="CampusX // Command center"
        title="Command center"
        description="Live counts from the CampusX database: students, content, reports and moderation."
        actions={
          <>
            <span className="font-mono text-[11px] text-ax-subtle">
              Updated <TimeAgo value={data.generatedAt} />
            </span>
            <AdminButton size="sm" icon={RefreshCw} loading={busy} onClick={() => load({ refresh: true })}>
              Refresh
            </AdminButton>
          </>
        }
      />
      {error && <AdminError title="Refresh failed; showing the last data" error={error} />}

      <Refetching busy={busy}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard delay={0} icon={UserRound} title="Total students" value={cards.totalStudents.value} trend={cards.totalStudents.trend} to={can(PERMISSIONS.MANAGE_USERS) ? ADMIN_ROUTES.USERS : undefined} />
          <AdminStatCard delay={0.03} icon={Activity} title="Active students" value={cards.activeStudents.value} detail={`Signed in or used CampusX in the last ${cards.activeStudents.windowDays} days`} />
          <AdminStatCard delay={0.06} icon={FileText} title="Total posts" value={cards.totalPosts.value} trend={cards.totalPosts.trend} to={can(PERMISSIONS.MANAGE_CONTENT) ? ADMIN_ROUTES.CONTENT : undefined} />
          <AdminStatCard delay={0.09} icon={FolderKanban} title="Total projects" value={cards.totalProjects.value} trend={cards.totalProjects.trend} />
          <AdminStatCard delay={0.12} icon={UsersRound} title="Communities" value={cards.totalCommunities.value} trend={cards.totalCommunities.trend} to={can(PERMISSIONS.MANAGE_COMMUNITIES) ? ADMIN_ROUTES.COMMUNITIES : undefined} />
          <AdminStatCard delay={0.15} icon={Compass} title="Opportunities" value={cards.totalOpportunities.value} detail={`${cards.totalOpportunities.published.toLocaleString()} published right now`} to={can(PERMISSIONS.MANAGE_OPPORTUNITIES) ? ADMIN_ROUTES.OPPORTUNITIES : undefined} />
          <AdminStatCard delay={0.18} icon={Flag} tone={cards.pendingReports.value ? 'warning' : 'violet'} title="Pending reports" value={cards.pendingReports.value} detail={`${cards.pendingReports.reviewing.toLocaleString()} under review · ${cards.pendingReports.trend.current.toLocaleString()} filed in ${cards.pendingReports.trend.days} days`} to={ADMIN_ROUTES.REPORTS} />
          <AdminStatCard delay={0.21} icon={ShieldAlert} tone={cards.openCases.highRisk ? 'danger' : 'violet'} title="Open cases" value={cards.openCases.value} detail={`${cards.openCases.highRisk.toLocaleString()} high or critical risk`} to={reviewLink} />
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <AdminPanel label="Platform activity" title={`Last ${activity.days.length} days`}>
            <LineChart
              caption="Platform activity per day"
              days={activity.days}
              series={[
                { id: 'students', label: 'New students', values: activity.series.students, color: SERIES[0] },
                { id: 'posts', label: 'New posts', values: activity.series.posts, color: SERIES[1] },
                { id: 'reports', label: 'Reports', values: activity.series.reports, color: SERIES[2] },
                { id: 'staffActions', label: 'Staff moderation actions', values: activity.series.staffActions, color: SERIES[3] },
              ]}
            />
          </AdminPanel>
          <AdminPanel label="Risk radar" title="Active cases by risk" actions={reviewLink && <AdminButton as={Link} to={reviewLink} size="sm">Queue</AdminButton>}>
            <RiskRadar levels={riskRadar} />
          </AdminPanel>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <AdminPanel label="Content creation" title={`Created in the last ${contentCreation.days} days`}>
            <BarList caption="Content created per kind" items={contentCreation.items} emptyText="Nothing created in this window yet." />
          </AdminPanel>
          <AdminPanel label="Moderation status" title="All cases by status">
            <DonutChart
              caption="Moderation cases by status"
              totalLabel="cases"
              items={[
                { id: 'open', label: 'Open', value: caseStatus.open, color: SERIES[0] },
                { id: 'reviewing', label: 'Reviewing', value: caseStatus.reviewing, color: SERIES[2] },
                { id: 'resolved', label: 'Resolved', value: caseStatus.resolved, color: SERIES[1] },
                { id: 'dismissed', label: 'Dismissed', value: caseStatus.dismissed, color: SERIES_NEUTRAL },
              ]}
            />
          </AdminPanel>
          <AdminPanel label="Threat monitor" title="Most urgent open cases" className="lg:col-span-2 xl:col-span-1">
            {threats.length === 0 ? (
              <p className="py-6 text-center text-sm text-ax-subtle">No open cases. All clear.</p>
            ) : (
              <ul className="divide-y divide-ax-border/50">
                {threats.map((item) => (
                  <li key={item.id}>
                    <Link to={casePath(item.id)} className="flex items-start gap-3 py-2.5 hover:bg-ax-card-hover/60">
                      <span className="flex w-20 shrink-0 flex-col gap-1">
                        <span className="font-mono text-xs font-semibold text-ax-neon">{shortId(item.id)}</span>
                        <StatusPill kind="risk" value={item.riskLevel} />
                      </span>
                      <TargetSummary target={item.target} targetType={item.targetType} className="flex-1" />
                      <ArrowRight className="mt-1 size-4 shrink-0 text-ax-subtle" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </AdminPanel>
        </div>

        {auditStream && (
          <AdminPanel label="Audit stream" title="Latest recorded actions" className="mt-5" actions={<AdminButton as={Link} to={ADMIN_ROUTES.AUDIT_LOGS} size="sm">Full audit log</AdminButton>}>
            <AuditTimeline entries={auditStream} emptyText="No actions recorded yet." />
          </AdminPanel>
        )}
      </Refetching>
    </div>
  );
}
