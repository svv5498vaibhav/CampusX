import { useCallback, useEffect, useState } from 'react';
import { Archive, Eye, Flag, Lock, Pencil, Plus, Rocket, Telescope, Trash2, UsersRound } from 'lucide-react';
import { Link } from 'react-router';
import { Refetching } from '@/components/admin/AdminChart';
import { AdminButton, AdminEmpty, AdminError, AdminLoading, AdminPageHeader, AdminPagination, AdminPanel, AdminTabs, FilterBar, SearchField, Tag, TimeAgo } from '@/components/admin/AdminUi';
import { ConfirmActionModal } from '@/components/admin/ConfirmActionModal';
import { ADMIN_ROUTES } from '@/constants/admin';
import { editOpportunityPath, formatShortDay, modeLabel, opportunityPath, typeLabel } from '@/constants/opportunities';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { adminApi } from '@/services/adminApi';
import { opportunityApi } from '@/services/opportunityApi';
import { toast } from '@/store/toastStore';

// Status changes each status offers (Phase 8's lifecycle: draft → published → closed → archived).
const ACTIONS = {
  draft: [{ status: 'published', label: 'Publish', icon: Rocket, tone: 'success' }],
  published: [{ status: 'closed', label: 'Close', icon: Lock, tone: 'warning' }, { status: 'archived', label: 'Archive', icon: Archive, tone: 'neutral' }],
  closed: [{ status: 'published', label: 'Reopen', icon: Rocket, tone: 'success' }, { status: 'archived', label: 'Archive', icon: Archive, tone: 'neutral' }],
  archived: [{ status: 'published', label: 'Publish', icon: Rocket, tone: 'success' }, { status: 'draft', label: 'Back to draft', icon: Pencil, tone: 'neutral' }],
};
const DONE = { published: 'Opportunity published.', closed: 'Opportunity closed.', archived: 'Opportunity archived.', draft: 'Moved back to drafts.' };
const STATUS_TONES = { draft: 'neutral', published: 'violet', closed: 'warning', archived: 'neutral' };
const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'published', label: 'Published' },
  { id: 'closed', label: 'Closed' },
  { id: 'archived', label: 'Archived' },
];

function Row({ opportunity, options, onStatus, onDelete, busy }) {
  const deadlinePassed = opportunity.status === 'published' && opportunity.displayStatus === 'closed';
  return (
    <li className="flex flex-col gap-3 py-4 xl:flex-row xl:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag tone={STATUS_TONES[opportunity.status]}>{opportunity.status}</Tag>
          {deadlinePassed && <Tag tone="warning">Deadline passed</Tag>}
          <Tag>{typeLabel(options, opportunity.type)}</Tag>
          <Tag>{modeLabel(options, opportunity.mode)}</Tag>
        </div>
        <a href={opportunityPath(opportunity.id)} target="_blank" rel="noreferrer" className="mt-1.5 block truncate font-display text-base font-bold text-ax-text hover:text-ax-neon">
          {opportunity.title}
        </a>
        <p className="truncate text-sm text-ax-muted">{opportunity.organizer}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ax-subtle tabular-nums">
          <span>{opportunity.applicationDeadline ? `Deadline ${formatShortDay(opportunity.applicationDeadline)}` : 'No deadline'}</span>
          <span className="inline-flex items-center gap-1">
            <Eye className="size-3.5" aria-hidden="true" /> {opportunity.views} views
          </span>
          <span className="inline-flex items-center gap-1" title="Students tracking it (self-reported)">
            <UsersRound className="size-3.5" aria-hidden="true" /> {opportunity.trackedBy} tracking
          </span>
          {opportunity.openReports > 0 && (
            <span className="inline-flex items-center gap-1 text-ax-warning">
              <Flag className="size-3.5" aria-hidden="true" /> {opportunity.openReports} open reports
            </span>
          )}
          <span>
            updated <TimeAgo value={opportunity.updatedAt} />
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 xl:shrink-0 xl:justify-end">
        <AdminButton as={Link} to={editOpportunityPath(opportunity.id)} size="sm" icon={Pencil} aria-label={`Edit ${opportunity.title}`}>
          Edit
        </AdminButton>
        {(ACTIONS[opportunity.status] ?? []).map((action) => (
          <AdminButton key={action.status} size="sm" tone={action.tone} icon={action.icon} disabled={busy} onClick={() => onStatus(opportunity, action.status)} aria-label={`${action.label}: ${opportunity.title}`}>
            {action.label}
          </AdminButton>
        ))}
        <AdminButton size="sm" tone="danger" icon={Trash2} disabled={busy} onClick={() => onDelete(opportunity)} aria-label={`Delete ${opportunity.title}`}>
          Delete
        </AdminButton>
      </div>
    </li>
  );
}

/** /admin/opportunities: create, edit, publish, close, archive and delete (Phase 8 rules; every change audited). */
export default function AdminOpportunities() {
  useDocumentTitle('Admin · Opportunities');
  const [filters, update] = useUrlFilters({ status: 'all', search: '', page: '1' });
  const [data, setData] = useState(null);
  const [options, setOptions] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const key = JSON.stringify(filters);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await adminApi.opportunities({ ...filters, page: Number(filters.page) || 1, limit: 20 }));
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
    opportunityApi.getOptions().then(setOptions).catch(() => setOptions(null));
  }, []);

  const set = (changes) => update({ ...changes, page: '1' });
  const changeStatus = async (opportunity, status) => {
    setBusyId(opportunity.id);
    try {
      await adminApi.updateOpportunity(opportunity.id, { status });
      toast.success(DONE[status]);
      await load();
    } catch (failure) {
      toast.error(failure.message);
    } finally {
      setBusyId(null);
    }
  };
  const tabs = STATUS_TABS.map((tab) => ({ ...tab, count: data?.counts?.[tab.id] }));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Campus management · Opportunities"
        title="Opportunity management"
        description="Internships, hackathons, scholarships, workshops and campus events, from draft to archive."
        actions={
          <AdminButton as={Link} to={ADMIN_ROUTES.OPPORTUNITY_CREATE} tone="primary" icon={Plus}>
            Create opportunity
          </AdminButton>
        }
      />
      <AdminPanel label="Opportunities" bodyClassName="space-y-4">
        <AdminTabs label="Status" tabs={tabs} value={filters.status} onChange={(status) => set({ status })} />
        <FilterBar>
          <SearchField className="col-span-2 sm:w-96" label="Search" placeholder="Title, organizer, skills or tags" value={filters.search} onSearch={(search) => set({ search })} />
        </FilterBar>
        {!data && error && <AdminError error={error} onRetry={load} />}
        {!data && !error && <AdminLoading label="Loading opportunities" />}
        {data && (
          <Refetching busy={busy}>
            {data.opportunities.length === 0 ? (
              <AdminEmpty
                icon={Telescope}
                title={filters.search || filters.status !== 'all' ? 'Nothing here' : 'No opportunities yet'}
                description="Create the first one: a hackathon, workshop, scholarship or campus event."
                action={
                  <AdminButton as={Link} to={ADMIN_ROUTES.OPPORTUNITY_CREATE} tone="primary" size="sm" icon={Plus} className="mt-2">
                    Create opportunity
                  </AdminButton>
                }
              />
            ) : (
              <ul className="divide-y divide-ax-border/60">
                {data.opportunities.map((opportunity) => (
                  <Row key={opportunity.id} opportunity={opportunity} options={options} busy={busyId === opportunity.id} onStatus={changeStatus} onDelete={setDeleting} />
                ))}
              </ul>
            )}
            <AdminPagination pagination={data.pagination} onPage={(page) => update({ page: String(page) })} />
          </Refetching>
        )}
      </AdminPanel>
      <ConfirmActionModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this opportunity?"
        description={deleting ? `“${deleting.title}” and every student's saved/applied tracking of it will be removed for good. Archiving hides it but keeps that history.` : ''}
        confirmLabel="Delete"
        danger
        allowReason={false}
        onConfirm={async () => {
          await adminApi.deleteOpportunity(deleting.id);
          toast.success('Opportunity deleted.');
          await load();
        }}
      />
    </div>
  );
}
