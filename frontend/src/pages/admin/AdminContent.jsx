import { useCallback, useEffect, useState } from 'react';
import { FileStack, Lock } from 'lucide-react';
import { Refetching } from '@/components/admin/AdminChart';
import { AdminEmpty, AdminError, AdminLoading, AdminPageHeader, AdminPagination, AdminPanel, AdminTabs, FilterBar, FilterSelect, SearchField } from '@/components/admin/AdminUi';
import { ConfirmActionModal } from '@/components/admin/ConfirmActionModal';
import { ContentTable } from '@/components/admin/ContentTable';
import { CONTENT_ACTIONS, CONTENT_STATUS_LABELS } from '@/constants/admin';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { adminApi } from '@/services/adminApi';
import { toast } from '@/store/toastStore';

const TYPE_TABS = [
  { id: 'post', label: 'Posts' },
  { id: 'comment', label: 'Comments' },
  { id: 'project', label: 'Projects' },
  { id: 'achievement', label: 'Achievements' },
  { id: 'anonymousPost', label: 'Anonymous posts' },
];
const STATUSES = ['approved', 'flagged', 'pending', 'restricted', 'removed'];

/**
 * /admin/content: posts, comments, projects, achievements and Anonymous Zone posts, with moderation
 * actions. Changes go through each item's open case when it has one, so reporters hear back.
 */
export default function AdminContent() {
  useDocumentTitle('Admin · Content');
  const [filters, update] = useUrlFilters({ type: 'post', status: 'all', verification: '', search: '', page: '1' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const key = JSON.stringify(filters);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await adminApi.content({ ...filters, verification: filters.type === 'achievement' ? filters.verification : '', page: Number(filters.page) || 1, limit: 20 }));
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
  const run = async (item, action, reason) => {
    setBusyId(item.id);
    try {
      const { item: next } = await adminApi.actOnContent(item.type, item.id, { action, ...(reason && { reason }), confirm: true });
      setData((current) => current && { ...current, items: current.items.map((entry) => (entry.id === item.id && next ? next : entry)) });
      toast.success(`${CONTENT_ACTIONS[action].label}: done.`);
    } catch (failure) {
      if (failure.status === 409) load();
      throw failure;
    } finally {
      setBusyId(null);
    }
  };
  const start = (item, action) => setPending({ item, action });
  const action = pending ? CONTENT_ACTIONS[pending.action] : null;
  const statusTabs = [{ id: 'all', label: 'All' }, ...STATUSES.map((id) => ({ id, label: CONTENT_STATUS_LABELS[id] }))].map((tab) => ({ ...tab, count: data?.type === filters.type ? data.counts?.[tab.id] : undefined }));

  return (
    <div className="space-y-6">
      <AdminPageHeader eyebrow="Campus management · Content" title="Content management" description="Review what students publish and act on it through Trust & Safety. Anonymous posts never show who wrote them." />
      <AdminPanel label="Content" bodyClassName="space-y-4">
        <AdminTabs label="Content type" tabs={TYPE_TABS} value={filters.type} onChange={(type) => update({ type, status: 'all', verification: '', search: '', page: '1' })} />
        <AdminTabs label="Moderation status" tabs={statusTabs} value={filters.status} onChange={(status) => set({ status })} />
        <FilterBar>
          <SearchField className="col-span-2 sm:w-80" label="Search text" placeholder={filters.type === 'anonymousPost' ? 'Title or text (never the author)' : 'Search the text'} value={filters.search} onSearch={(search) => set({ search })} />
          {filters.type === 'achievement' && (
            <FilterSelect label="Proof" value={filters.verification} onChange={(verification) => set({ verification })} options={[{ value: '', label: 'Any' }, { value: 'pending', label: 'Waiting for review' }, { value: 'verified', label: 'Verified' }, { value: 'rejected', label: 'Rejected' }, { value: 'unverified', label: 'No proof' }]} />
          )}
        </FilterBar>
        {filters.type === 'anonymousPost' && (
          <p className="flex items-center gap-2 rounded-lg border border-ax-border bg-ax-bg-2 px-3 py-2 text-xs text-ax-muted">
            <Lock className="size-3.5 shrink-0 text-ax-neon" aria-hidden="true" />
            Authors stay anonymous here. If a post needs investigating, open its moderation case: revealing an author needs a reason and is audited.
          </p>
        )}
        {!data && error && <AdminError error={error} onRetry={load} />}
        {!data && !error && <AdminLoading label="Loading content" />}
        {data && (
          <Refetching busy={busy}>
            {error && <AdminError error={error} onRetry={load} className="mb-4" />}
            {data.items.length === 0 ? <AdminEmpty icon={FileStack} title="Nothing here" description="No content matches these filters." /> : <ContentTable items={data.items} onAction={start} busyId={busyId} />}
            <AdminPagination pagination={data.pagination} onPage={(page) => update({ page: String(page) })} />
          </Refetching>
        )}
      </AdminPanel>
      <ConfirmActionModal
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title={action ? `${action.label}?` : ''}
        description={action?.description}
        confirmLabel={action?.label}
        danger={Boolean(action?.danger)}
        requireReason={Boolean(action?.danger || action?.needsReason)}
        onConfirm={(reason) => run(pending.item, pending.action, reason)}
      />
    </div>
  );
}
