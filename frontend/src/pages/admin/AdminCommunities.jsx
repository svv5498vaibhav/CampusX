import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Flag, ShieldAlert, UsersRound } from 'lucide-react';
import { Link } from 'react-router';
import { Refetching } from '@/components/admin/AdminChart';
import { AdminButton, AdminEmpty, AdminError, AdminLoading, AdminPageHeader, AdminPagination, AdminPanel, AdminTabs, FilterBar, FilterSelect, PersonChip, SearchField, StatusPill, Tag, TimeAgo } from '@/components/admin/AdminUi';
import { ConfirmActionModal } from '@/components/admin/ConfirmActionModal';
import { COMMUNITY_ACTIONS, CONTENT_STATUS_LABELS, casePath } from '@/constants/admin';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { adminApi } from '@/services/adminApi';
import { toast } from '@/store/toastStore';

const TYPES = [
  { value: '', label: 'Any type' },
  { value: 'college', label: 'College' },
  { value: 'branch', label: 'Branch' },
  { value: 'interest', label: 'Interest' },
  { value: 'project', label: 'Project' },
  { value: 'student-created', label: 'Club' },
];
const TYPE_LABEL = Object.fromEntries(TYPES.map((type) => [type.value, type.label]));
const TONES = { suspend: 'warning', restore: 'success', remove: 'danger' };

function Scope({ community }) {
  const parts = [community.college?.shortName, community.branch?.shortName, community.semester && `Sem ${community.semester}`].filter(Boolean);
  return <span className="text-xs text-ax-muted">{parts.length ? parts.join(' · ') : 'All of CampusX'}</span>;
}

function Actions({ community, onAction, busy }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {community.actions.map((action) => (
        <AdminButton key={action} size="sm" tone={TONES[action]} disabled={busy} onClick={() => onAction(community, action)}>
          {COMMUNITY_ACTIONS[action].label}
        </AdminButton>
      ))}
      {community.activeCase && (
        <AdminButton as={Link} to={casePath(community.activeCase.id)} size="sm" icon={ShieldAlert}>
          Review reports
        </AdminButton>
      )}
    </span>
  );
}

function NameCell({ community }) {
  return (
    <span className="block min-w-0">
      <span className="flex items-center gap-2">
        <span className="truncate font-semibold text-ax-text">{community.name}</span>
        {community.official && <Tag tone="violet">Official</Tag>}
      </span>
      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ax-subtle">
        {TYPE_LABEL[community.type] ?? community.type}
        {community.moderationStatus !== 'removed' && (
          <a href={community.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ax-text">
            <ExternalLink className="size-3" aria-hidden="true" /> View
          </a>
        )}
      </span>
    </span>
  );
}

/** /admin/communities (admins): every community with its owner, scope, members and standing. */
export default function AdminCommunities() {
  useDocumentTitle('Admin · Communities');
  const [filters, update] = useUrlFilters({ search: '', type: '', status: '', moderation: '', page: '1' });
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
      setData(await adminApi.communities({ ...filters, page: Number(filters.page) || 1, limit: 20 }));
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
  const run = async (community, action, reason) => {
    setBusyId(community.id);
    try {
      const { community: next } = await adminApi.actOnCommunity(community.id, { action, ...(reason && { reason }), confirm: true });
      setData((current) => current && { ...current, communities: current.communities.map((entry) => (entry.id === community.id && next ? next : entry)) });
      toast.success(`${COMMUNITY_ACTIONS[action].label}: done.`);
    } catch (failure) {
      if (failure.status === 409) load();
      throw failure;
    } finally {
      setBusyId(null);
    }
  };
  const action = pending ? COMMUNITY_ACTIONS[pending.action] : null;
  const moderationTabs = [{ id: '', label: 'All' }, ...['approved', 'flagged', 'restricted', 'removed'].map((id) => ({ id, label: id === 'restricted' ? 'Suspended' : CONTENT_STATUS_LABELS[id] }))].map((tab) => ({ ...tab, count: data?.counts?.[tab.id || 'all'] }));

  return (
    <div className="space-y-6">
      <AdminPageHeader eyebrow="Campus management // Communities" title="Community management" description="Official and student-created communities. Suspending hides a community from search and from students who aren’t members." />
      <AdminPanel label="Communities" bodyClassName="space-y-4">
        <AdminTabs label="Standing" tabs={moderationTabs} value={filters.moderation} onChange={(moderation) => set({ moderation })} />
        <FilterBar>
          <SearchField className="col-span-2 sm:w-72" label="Search" placeholder="Name, description or tag" value={filters.search} onSearch={(search) => set({ search })} />
          <FilterSelect label="Type" value={filters.type} onChange={(type) => set({ type })} options={TYPES} />
          <FilterSelect label="Status" value={filters.status} onChange={(status) => set({ status })} options={[{ value: '', label: 'Active + archived' }, { value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]} />
        </FilterBar>
        {!data && error && <AdminError error={error} onRetry={load} />}
        {!data && !error && <AdminLoading label="Loading communities" />}
        {data && (
          <Refetching busy={busy}>
            {data.communities.length === 0 ? (
              <AdminEmpty icon={UsersRound} title="No communities match" />
            ) : (
              <>
                <div className="relative hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[1000px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-ax-border font-mono text-[10px] tracking-[0.16em] text-ax-subtle uppercase">
                        <th scope="col" className="py-2.5 pr-3 font-semibold">Community</th>
                        <th scope="col" className="py-2.5 pr-3 font-semibold">Scope</th>
                        <th scope="col" className="py-2.5 pr-3 font-semibold">Owner</th>
                        <th scope="col" className="py-2.5 pr-3 text-right font-semibold">Members</th>
                        <th scope="col" className="py-2.5 pr-3 font-semibold">Status</th>
                        <th scope="col" className="py-2.5 pr-3 text-right font-semibold">Reports</th>
                        <th scope="col" className="py-2.5 pr-3 font-semibold">Created</th>
                        <th scope="col" className="py-2.5 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ax-border/50">
                      {data.communities.map((community) => (
                        <tr key={community.id} className="hover:bg-ax-card-hover/70">
                          <td className="max-w-[16rem] py-3 pr-3 align-top">
                            <NameCell community={community} />
                          </td>
                          <td className="py-3 pr-3 align-top">
                            <Scope community={community} />
                          </td>
                          <td className="py-3 pr-3 align-top">{community.official ? <span className="text-xs text-ax-subtle">CampusX</span> : <PersonChip person={community.owner} />}</td>
                          <td className="py-3 pr-3 text-right align-top font-mono tabular-nums">{community.memberCount.toLocaleString()}</td>
                          <td className="py-3 pr-3 align-top">
                            <span className="flex flex-col items-start gap-1">
                              <StatusPill kind="content" value={community.moderationStatus} />
                              {community.status === 'archived' && <Tag>Archived</Tag>}
                            </span>
                          </td>
                          <td className="py-3 pr-3 text-right align-top">
                            <span className={community.openReports ? 'inline-flex items-center gap-1 font-mono text-ax-warning' : 'font-mono text-ax-subtle'}>
                              {community.openReports > 0 && <Flag className="size-3" aria-hidden="true" />}
                              {community.openReports}
                            </span>
                          </td>
                          <td className="py-3 pr-3 align-top text-xs text-ax-muted">
                            <TimeAgo value={community.createdAt} />
                          </td>
                          <td className="py-3 align-top">
                            <Actions community={community} onAction={(item, act) => setPending({ community: item, action: act })} busy={busyId === community.id} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="space-y-2.5 lg:hidden">
                  {data.communities.map((community) => (
                    <li key={community.id} className="rounded-xl border border-ax-border bg-ax-bg-2/70 p-3">
                      <NameCell community={community} />
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusPill kind="content" value={community.moderationStatus} />
                        <Scope community={community} />
                        <span className="text-xs text-ax-muted">{community.memberCount} members</span>
                        {community.openReports > 0 && <span className="text-xs text-ax-warning">{community.openReports} open reports</span>}
                      </span>
                      <span className="mt-3 block">
                        <Actions community={community} onAction={(item, act) => setPending({ community: item, action: act })} busy={busyId === community.id} />
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <AdminPagination pagination={data.pagination} onPage={(page) => update({ page: String(page) })} />
          </Refetching>
        )}
      </AdminPanel>
      <ConfirmActionModal
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title={action && pending ? `${action.label} “${pending.community.name}”?` : ''}
        description={action?.description}
        confirmLabel={action?.label}
        danger={Boolean(action?.danger)}
        requireReason={Boolean(action?.danger)}
        onConfirm={(reason) => run(pending.community, pending.action, reason)}
      />
    </div>
  );
}
