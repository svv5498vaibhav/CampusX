import { useCallback, useEffect, useState } from 'react';
import { UserRoundSearch } from 'lucide-react';
import { Refetching } from '@/components/admin/AdminChart';
import { AdminEmpty, AdminError, AdminLoading, AdminPageHeader, AdminPagination, AdminPanel, AdminTabs, FilterBar, FilterSelect, SearchField } from '@/components/admin/AdminUi';
import { UserTable } from '@/components/admin/UserTable';
import { ACCOUNT_STATUS_LABELS } from '@/constants/admin';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { adminApi } from '@/services/adminApi';

const STATUS_TABS = [{ id: '', label: 'All' }, ...['active', 'pending', 'suspended', 'blocked', 'deactivated'].map((id) => ({ id, label: ACCOUNT_STATUS_LABELS[id] }))];

/** /admin/users: every CampusX account (admins only). Never shows passwords, login data or IP addresses. */
export default function AdminUsers() {
  useDocumentTitle('Admin · Students');
  const [filters, update] = useUrlFilters({ search: '', status: '', role: '', sort: 'newest', page: '1' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify(filters);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await adminApi.users({ ...filters, page: Number(filters.page) || 1, limit: 20 }));
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
  const tabs = STATUS_TABS.map((tab) => ({ ...tab, count: data?.counts ? data.counts[tab.id || 'all'] : undefined }));

  return (
    <div className="space-y-6">
      <AdminPageHeader eyebrow="Campus management · Students" title="Student management" description="Find any account by name, email, college or branch, review its record, and change its status. Every change is audited." />
      <AdminPanel label="Accounts" bodyClassName="space-y-4">
        <AdminTabs label="Account status" tabs={tabs} value={filters.status} onChange={(status) => set({ status })} />
        <FilterBar>
          <SearchField className="col-span-2 sm:w-80" label="Search" placeholder="Name, email, college or branch" value={filters.search} onSearch={(search) => set({ search })} />
          <FilterSelect label="Role" value={filters.role} onChange={(role) => set({ role })} options={[{ value: '', label: 'Any role' }, { value: 'student', label: 'Students' }, { value: 'moderator', label: 'Moderators' }, { value: 'admin', label: 'Admins' }]} />
          <FilterSelect label="Sort" value={filters.sort} onChange={(sort) => set({ sort })} options={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'name', label: 'Name A–Z' }, { value: 'lastLogin', label: 'Last sign-in' }]} />
        </FilterBar>
        {!data && error && <AdminError error={error} onRetry={load} />}
        {!data && !error && <AdminLoading label="Loading accounts" />}
        {data && (
          <Refetching busy={busy}>
            {data.users.length === 0 ? <AdminEmpty icon={UserRoundSearch} title="No accounts match" description="Try a different name, email, college or branch." /> : <UserTable users={data.users} />}
            <AdminPagination pagination={data.pagination} onPage={(page) => update({ page: String(page) })} />
          </Refetching>
        )}
      </AdminPanel>
    </div>
  );
}
