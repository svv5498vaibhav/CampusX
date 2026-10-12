import { useCallback, useEffect, useState } from 'react';
import { Info, RefreshCw } from 'lucide-react';
import { BarList, DonutChart, LineChart, Refetching } from '@/components/admin/AdminChart';
import { AdminButton, AdminError, AdminLoading, AdminPageHeader, AdminPanel, AdminTabs, TerminalLabel, TimeAgo } from '@/components/admin/AdminUi';
import { RiskRadar } from '@/components/admin/RiskRadar';
import { ACCOUNT_STATUS_LABELS, SERIES, SERIES_NEUTRAL } from '@/constants/admin';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { adminApi } from '@/services/adminApi';

const RANGES = [
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
];
const TRACKING_LABELS = { saved: 'Saved', interested: 'Interested', applied: 'Applied', shortlisted: 'Shortlisted', selected: 'Selected', rejected: 'Rejected', withdrawn: 'Withdrawn' };

function Figure({ label, value, note }) {
  return (
    <div className="rounded-xl border border-ax-border bg-ax-bg-2/70 p-3.5">
      <p className="font-mono text-[10px] tracking-[0.14em] text-ax-subtle uppercase">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-ax-text tabular-nums">{Number(value ?? 0).toLocaleString()}</p>
      {note && <p className="mt-0.5 text-[11px] text-ax-subtle">{note}</p>}
    </div>
  );
}

function Section({ label, title, children }) {
  return (
    <section className="space-y-4" aria-label={title}>
      <div className="border-b border-ax-border pb-2">
        <TerminalLabel>{label}</TerminalLabel>
        <h2 className="mt-1 font-display text-lg font-bold text-ax-text">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/** /admin/analytics (admins): only what the database actually records, over 7, 30 or 90 days. */
export default function AdminAnalytics() {
  useDocumentTitle('Admin · Analytics');
  const [{ range }, update] = useUrlFilters({ range: '30d' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async ({ refresh = false } = {}) => {
      setBusy(true);
      setError(null);
      try {
        setData(await adminApi.analytics({ range, refresh }));
      } catch (failure) {
        setError(failure);
      } finally {
        setBusy(false);
      }
    },
    [range],
  );
  useEffect(() => {
    load();
  }, [load]);

  const days = RANGES.find((item) => item.id === range)?.label.toLowerCase() ?? '';

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Insights // Analytics"
        title="Platform analytics"
        description="Students, content, engagement, moderation and opportunities, counted from the CampusX database."
        actions={
          data && (
            <>
              <span className="font-mono text-[11px] text-ax-subtle">
                Computed <TimeAgo value={data.generatedAt} />
              </span>
              <AdminButton size="sm" icon={RefreshCw} loading={busy} onClick={() => load({ refresh: true })}>
                Recompute
              </AdminButton>
            </>
          )
        }
      />
      <AdminTabs label="Date range" tabs={RANGES} value={range} onChange={(next) => update({ range: next })} />

      {!data && error && <AdminError error={error} onRetry={() => load()} />}
      {!data && !error && <AdminLoading label="Computing analytics" />}
      {data && (
        <Refetching busy={busy} className="space-y-10">
          {error && <AdminError title="Couldn’t update; showing the last results" error={error} />}

          <Section label="User analytics" title="Students">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Figure label="New students" value={data.users.newStudents} note={days} />
              <Figure label="Active students" value={data.users.activeStudents} note={`signed in or active, ${days}`} />
              <Figure label="All students" value={data.users.totalStudents} />
              <Figure label="Onboarded" value={data.users.onboarded} note="campus profile completed" />
            </div>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <AdminPanel label="Registration trend" title="New student accounts per day">
                <LineChart caption="New student accounts per day" days={data.days} series={[{ id: 'registrations', label: 'New students', values: data.users.registrations, color: SERIES[0] }]} />
              </AdminPanel>
              <AdminPanel label="Account status" title="All student accounts">
                <BarList caption="Student accounts by status" items={Object.entries(data.users.byStatus).map(([id, value]) => ({ id, label: ACCOUNT_STATUS_LABELS[id] ?? id, value }))} />
              </AdminPanel>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <AdminPanel label="College distribution" title="Students per college">
                <BarList caption="Students per college" items={data.users.colleges.map((item) => ({ id: item.id ?? 'none', label: item.label, value: item.count }))} />
              </AdminPanel>
              <AdminPanel label="Branch distribution" title="Students per branch">
                <BarList caption="Students per branch" items={data.users.branches.map((item) => ({ id: item.id ?? 'none', label: item.label, value: item.count }))} color="var(--ax-series-2)" />
              </AdminPanel>
            </div>
          </Section>

          <Section label="Content analytics" title="What students create">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Figure label="Campus posts" value={data.content.inRange.posts} note={`${data.content.totals.posts.toLocaleString()} live in total`} />
              <Figure label="Projects" value={data.content.inRange.projects} note={`${data.content.totals.projects.toLocaleString()} in total`} />
              <Figure label="Achievements" value={data.content.inRange.achievements} note={`${data.content.totals.verifiedAchievements.toLocaleString()} verified in total`} />
              <Figure label="Communities" value={data.content.inRange.communities} note={`${data.content.totals.communities.toLocaleString()} in total`} />
            </div>
            <AdminPanel label="Content creation" title="Created per day">
              <LineChart
                caption="Content created per day"
                days={data.days}
                series={[
                  { id: 'posts', label: 'Posts', values: data.content.series.posts, color: SERIES[0] },
                  { id: 'projects', label: 'Projects', values: data.content.series.projects, color: SERIES[1] },
                  { id: 'achievements', label: 'Achievements', values: data.content.series.achievements, color: SERIES[2] },
                  { id: 'communities', label: 'Communities', values: data.content.series.communities, color: SERIES[3] },
                ]}
              />
            </AdminPanel>
          </Section>

          <Section label="Engagement" title="How students interact">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Figure label="Comments" value={data.engagement.inRange.comments} note={`+ ${data.engagement.inRange.anonymousComments.toLocaleString()} in the Anonymous Zone`} />
              <Figure label="Post likes (all time)" value={data.engagement.totals.postLikes} note={`${data.engagement.inRange.likesOnNewPosts.toLocaleString()} on posts from ${days}`} />
              <Figure label="Post saves (all time)" value={data.engagement.totals.postSaves} />
              <Figure label="Project likes (all time)" value={data.engagement.totals.projectLikes} />
            </div>
            <AdminPanel label="Community activity" title="Per day">
              <LineChart
                caption="Engagement per day"
                days={data.days}
                series={[
                  { id: 'comments', label: 'Comments', values: data.engagement.series.comments, color: SERIES[0] },
                  { id: 'communityPosts', label: 'Community posts', values: data.engagement.series.communityPosts, color: SERIES[1] },
                  { id: 'communityJoins', label: 'Community joins', values: data.engagement.series.communityJoins, color: SERIES[2] },
                ]}
              />
            </AdminPanel>
            <p className="flex items-start gap-2 text-xs text-ax-subtle">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              CampusX stores likes and saves without dates, so they are totals rather than daily trends.
            </p>
          </Section>

          <Section label="Moderation" title="Trust & Safety">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Figure label="Reports" value={data.moderation.inRange.reports} note={days} />
              <Figure label="Cases opened" value={data.moderation.inRange.cases} note={days} />
              <Figure label="Flagged now" value={data.moderation.contentStatus.flagged} />
              <Figure label="Removed now" value={data.moderation.contentStatus.removed} note={`${data.moderation.inRange.removals.toLocaleString()} removals ${days}`} />
            </div>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <AdminPanel label="Moderation trend" title="Per day">
                <LineChart
                  caption="Moderation per day"
                  days={data.days}
                  series={[
                    { id: 'reports', label: 'Reports', values: data.moderation.series.reports, color: SERIES[2] },
                    { id: 'cases', label: 'Cases opened', values: data.moderation.series.cases, color: SERIES[0] },
                    { id: 'removals', label: 'Removals', values: data.moderation.series.removals, color: SERIES[1] },
                  ]}
                />
              </AdminPanel>
              <AdminPanel label="Risk distribution" title="Active cases">
                <RiskRadar levels={data.moderation.risk} />
              </AdminPanel>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <AdminPanel label="Report reasons" title={`Reasons, ${days}`}>
                <BarList caption="Reports by reason" items={data.moderation.reasons.map((item) => ({ id: item.id, label: item.label, value: item.count }))} color="var(--ax-series-3)" emptyText="No reports in this range." />
              </AdminPanel>
              <AdminPanel label="Case status" title="All cases">
                <DonutChart
                  caption="Cases by status"
                  totalLabel="cases"
                  items={[
                    { id: 'open', label: 'Open', value: data.moderation.caseStatus.open, color: SERIES[0] },
                    { id: 'reviewing', label: 'Reviewing', value: data.moderation.caseStatus.reviewing, color: SERIES[2] },
                    { id: 'resolved', label: 'Resolved', value: data.moderation.caseStatus.resolved, color: SERIES[1] },
                    { id: 'dismissed', label: 'Dismissed', value: data.moderation.caseStatus.dismissed, color: SERIES_NEUTRAL },
                  ]}
                />
              </AdminPanel>
            </div>
          </Section>

          <Section label="Opportunities" title="Opportunities">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Figure label="Published now" value={data.opportunities.byStatus.published} />
              <Figure label="Published" value={data.opportunities.inRange.published} note={days} />
              <Figure label="Total views" value={data.opportunities.totalViews} note="counted once per student every few hours" />
              <Figure label="Tracked by students" value={data.opportunities.inRange.tracked} note={`${days} · self-reported`} />
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <AdminPanel label="Student tracking" title="Saved, applied and outcomes (self-reported)">
                <BarList caption="Opportunity tracking by status" items={Object.entries(data.opportunities.tracking).map(([id, value]) => ({ id, label: TRACKING_LABELS[id] ?? id, value }))} color="var(--ax-series-4)" emptyText="No student has tracked an opportunity yet." />
              </AdminPanel>
              <AdminPanel label="Most viewed" title="Top listed opportunities">
                {data.opportunities.top.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ax-subtle">No listed opportunities yet.</p>
                ) : (
                  <ol className="space-y-2.5">
                    {data.opportunities.top.map((item, index) => (
                      <li key={item.id} className="flex items-center gap-3 text-sm">
                        <span className="w-5 font-mono text-xs text-ax-subtle">{index + 1}.</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-ax-text">{item.title}</span>
                          <span className="block truncate text-xs text-ax-subtle">{item.organizer}</span>
                        </span>
                        <span className="font-mono text-xs text-ax-text tabular-nums">{item.views.toLocaleString()} views</span>
                      </li>
                    ))}
                  </ol>
                )}
              </AdminPanel>
            </div>
          </Section>
        </Refetching>
      )}
    </div>
  );
}
