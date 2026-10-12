import { useEffect } from 'react';
import { Clock, Flag, ShieldCheck, Undo2 } from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { ContentWarning } from '@/components/safety/ContentWarning';
import { SafetyGuidelines } from '@/components/safety/SafetyGuidelines';
import { Badge, Button } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuthStore } from '@/store/authStore';
import { useReportStore } from '@/store/reportStore';
import { toast } from '@/store/toastStore';
import { formatRelativeTime } from '@/utils/time';

const STATUS_BADGES = {
  pending: { label: 'Waiting for review', variant: 'accent' },
  reviewing: { label: 'Being reviewed', variant: 'accent' },
  resolved: { label: 'Action taken', variant: 'primary' },
  dismissed: { label: 'No action needed', variant: 'neutral' },
  withdrawn: { label: 'Withdrawn', variant: 'outline' },
};
const TARGET_NAMES = { post: 'Post', comment: 'Comment', project: 'Project', community: 'Community', opportunity: 'Opportunity', achievement: 'Achievement', user: 'Student', anonymousPost: 'Anonymous post', anonymousComment: 'Anonymous comment' };

const HOW_IT_WORKS = [
  'Most posts go live straight away. Content that looks like spam, a threat or a harmful link may be held for a quick review; you’ll be told, and only you can see it meanwhile.',
  'Reports are private. Several reports flag something for the CampusX team, but reports alone never take a post down.',
  'Repeated problems lead to a friendly warning first, then a short pause on posting. Nothing permanent happens automatically: a person always reviews serious cases.',
  'Anonymous posts stay anonymous. CampusX can act on them without telling anyone who wrote them.',
];

/** The student's own reports, with a way to take back a pending one. */
function MyReports() {
  const reports = useReportStore((state) => state.myReports);
  const status = useReportStore((state) => state.myStatus);
  const pagination = useReportStore((state) => state.myPagination);
  const busy = useReportStore((state) => state.busy);
  const { fetchMyReports, withdrawReport } = useReportStore.getState();

  useEffect(() => {
    fetchMyReports();
  }, []);

  const withdraw = async (report) => {
    try {
      await withdrawReport(report.id);
      toast.success('Report withdrawn.');
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <section aria-labelledby="my-reports-title" className="mt-10">
      <h2 id="my-reports-title" className="flex items-center gap-2 font-display text-xl font-bold text-ink">
        <Flag className="size-5 text-primary" aria-hidden="true" /> Your reports
      </h2>
      <p className="mt-1 text-sm text-ink-muted">Only you can see these. Nobody is told who reported them.</p>
      {status === 'loading' && reports.length === 0 && <p className="mt-4 text-sm text-ink-muted" role="status">Loading your reports…</p>}
      {status === 'error' && <p className="mt-4 text-sm text-ink-muted">We couldn’t load your reports right now.</p>}
      {status === 'ready' && reports.length === 0 && <p className="mt-4 rounded-2xl bg-surface-muted px-4 py-3 text-sm text-ink-muted">You haven’t reported anything. If something feels wrong, use “Report” in its ⋮ menu.</p>}
      {reports.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {reports.map((report) => {
            const badge = STATUS_BADGES[report.status] ?? STATUS_BADGES.pending;
            return (
              <li key={report.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3" data-report-id={report.id}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{TARGET_NAMES[report.targetType] ?? 'Item'} · {report.reasonLabel}</p>
                  <p className="flex items-center gap-1 text-xs text-ink-subtle"><Clock className="size-3" aria-hidden="true" /> Sent {formatRelativeTime(report.createdAt)}</p>
                </div>
                <Badge variant={badge.variant} className="px-2 py-0.5 text-[11px]">{badge.label}</Badge>
                {report.status === 'pending' && (
                  <Button variant="ghost" size="sm" leftIcon={Undo2} loading={Boolean(busy[report.id])} onClick={() => withdraw(report)} aria-label={`Withdraw your report about this ${(TARGET_NAMES[report.targetType] ?? 'item').toLowerCase()}`}>
                    Withdraw
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {pagination?.hasMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" onClick={() => fetchMyReports({ more: true })}>Show older reports</Button>
        </div>
      )}
    </section>
  );
}

/** /safety (also /community-guidelines): the guidelines, how moderation works, and your own reports. */
export default function SafetyPage() {
  useDocumentTitle('Community guidelines');
  const userId = useAuthStore((state) => state.user?.id);
  useEffect(() => {
    useReportStore.getState().forViewer(userId);
  }, [userId]);

  return (
    <PageContainer width="default">
      <header className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary-soft-fg" aria-hidden="true">
          <ShieldCheck className="size-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Community guidelines</h1>
          <p className="mt-1 text-ink-muted">How we keep CampusX friendly, safe and useful for every student.</p>
        </div>
      </header>

      <section aria-labelledby="guidelines-title" className="mt-8">
        <h2 id="guidelines-title" className="sr-only">The guidelines</h2>
        <SafetyGuidelines />
      </section>

      <section aria-labelledby="how-title" className="mt-10">
        <h2 id="how-title" className="font-display text-xl font-bold text-ink">How moderation works</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {HOW_IT_WORKS.map((text) => (
            <li key={text}><ContentWarning tone="info">{text}</ContentWarning></li>
          ))}
        </ul>
      </section>

      <MyReports />
    </PageContainer>
  );
}
