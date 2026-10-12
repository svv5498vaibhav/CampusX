import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Ban, Clock, Flag, OctagonAlert, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Refetching } from '@/components/admin/AdminChart';
import { AdminStatCard } from '@/components/admin/AdminStatCard';
import { AdminButton, AdminEmpty, AdminError, AdminLoading, AdminPageHeader, AdminPagination, AdminPanel, AdminTabs, FilterBar, FilterDate, FilterSelect } from '@/components/admin/AdminUi';
import { CaseDetail } from '@/components/admin/CaseDetail';
import { ModerationTable } from '@/components/admin/ModerationTable';
import { ADMIN_ROUTES, RISK_LEVELS, TARGET_LABELS } from '@/constants/admin';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { adminApi } from '@/services/adminApi';
import { toast } from '@/store/toastStore';

const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const STATUS_TABS = [
  { id: 'active', label: 'Active' },
  { id: 'open', label: 'Open' },
  { id: 'reviewing', label: 'Reviewing' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'all', label: 'All' },
];

function ModerationQueue() {
  useDocumentTitle('Admin · Moderation');
  const [filters, update] = useUrlFilters({ status: 'active', riskLevel: '', targetType: '', priority: '', sort: 'priority', from: '', to: '', page: '1' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify(filters);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await adminApi.moderation({ ...filters, page: Number(filters.page) || 1, limit: 20 }));
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
  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <AdminPageHeader eyebrow="Moderation // Queue" title="Moderation queue" description="Cases from the automated checks and student reports (Trust & Safety), most urgent first." />

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <AdminStatCard icon={Clock} title="Pending content" value={summary.content.pending} detail="Waiting for review before it goes live" />
          <AdminStatCard icon={Flag} title="Flagged content" value={summary.content.flagged} tone={summary.content.flagged ? 'warning' : 'violet'} detail="Live, out of search and rankings" />
          <AdminStatCard icon={OctagonAlert} title="High-risk cases" value={summary.highRisk} tone={summary.highRisk ? 'danger' : 'violet'} detail="Active, high or critical" />
          <AdminStatCard icon={ShieldAlert} title="Restricted" value={summary.content.restricted} detail="Visible to the owner only" />
          <AdminStatCard icon={Ban} title="Removed" value={summary.content.removed} detail="Soft-deleted, kept for audits" />
          <AdminStatCard icon={ShieldCheck} title="Open cases" value={summary.cases.active} detail={`${summary.cases.open} open · ${summary.cases.reviewing} reviewing`} />
        </div>
      )}

      <AdminPanel label="Moderation queue" bodyClassName="space-y-4">
        <AdminTabs label="Case status" tabs={STATUS_TABS} value={filters.status} onChange={(status) => set({ status })} />
        <FilterBar>
          <FilterSelect label="Risk level" value={filters.riskLevel} onChange={(riskLevel) => set({ riskLevel })} options={[{ value: '', label: 'Any risk' }, ...RISK_LEVELS.map((level) => ({ value: level, label: capital(level) }))]} />
          <FilterSelect label="Content type" value={filters.targetType} onChange={(targetType) => set({ targetType })} options={[{ value: '', label: 'Any type' }, ...Object.entries(TARGET_LABELS).map(([value, label]) => ({ value, label }))]} />
          <FilterSelect label="Priority" value={filters.priority} onChange={(priority) => set({ priority })} options={[{ value: '', label: 'Any priority' }, { value: 'urgent', label: 'High + critical' }, ...RISK_LEVELS.map((level) => ({ value: level, label: capital(level) }))]} />
          <FilterSelect label="Sort" value={filters.sort} onChange={(sort) => set({ sort })} options={[{ value: 'priority', label: 'Most urgent' }, { value: 'newest', label: 'Newest' }]} />
          <FilterDate label="Opened from" value={filters.from} onChange={(from) => set({ from })} />
          <FilterDate label="Opened to" value={filters.to} onChange={(to) => set({ to })} />
        </FilterBar>

        {!data && error && <AdminError error={error} onRetry={load} />}
        {!data && !error && <AdminLoading label="Loading cases" />}
        {data && (
          <Refetching busy={busy}>
            {error && <AdminError error={error} onRetry={load} className="mb-4" />}
            {data.cases.length === 0 ? (
              <AdminEmpty icon={ShieldCheck} title="No cases match" description="Nothing in this view. Try another status or clear the filters." />
            ) : (
              <ModerationTable cases={data.cases} />
            )}
            <AdminPagination pagination={data.pagination} onPage={(page) => update({ page: String(page) })} />
          </Refetching>
        )}
      </AdminPanel>
    </div>
  );
}

function CaseView({ caseId }) {
  useDocumentTitle('Admin · Case');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminApi.moderationCase(caseId));
    } catch (failure) {
      setError(failure);
    }
  }, [caseId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const decide = async (decision, note) => {
    try {
      const next = await adminApi.decideCase(caseId, { decision, ...(note && { note }), confirm: true });
      setData(next);
      toast.success('Case updated.');
    } catch (failure) {
      // 409: someone else acted first; show the current state.
      if (failure.status === 409) load();
      throw failure;
    }
  };
  const reveal = async (reason) => (await adminApi.revealAuthor(caseId, { reason })).author;

  return (
    <div className="space-y-5">
      <AdminButton as={Link} to={ADMIN_ROUTES.MODERATION} size="sm" tone="neutral" icon={ArrowLeft}>
        Moderation queue
      </AdminButton>
      {error && !data && <AdminError title={error.status === 404 ? 'Case not found' : 'Couldn’t load this case'} error={error} onRetry={error.status === 404 ? undefined : load} />}
      {!data && !error && <AdminLoading label="Loading case" />}
      {data && <CaseDetail data={data} onDecide={decide} onReveal={reveal} />}
    </div>
  );
}

/** /admin/moderation (the queue) and /admin/moderation/:caseId (one case). */
export default function AdminModeration() {
  const { caseId } = useParams();
  return caseId ? <CaseView key={caseId} caseId={caseId} /> : <ModerationQueue />;
}
