import { Lock } from 'lucide-react';
import { Link } from 'react-router';
import { AdminButton, AdminPanel } from '@/components/admin/AdminUi';
import { ADMIN_ROUTES } from '@/constants/admin';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAdminStore } from '@/store/adminStore';

/** Shown when a staff member opens an admin area their role doesn't include. The API answers 403 too. */
export function AdminAccessDenied() {
  useDocumentTitle('Access restricted');
  return (
    <AdminPanel label="Access control" className="mx-auto mt-6 max-w-lg">
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="grid size-12 place-items-center rounded-xl border border-ax-danger/40 bg-ax-danger/10 text-ax-danger">
          <Lock className="size-5" aria-hidden="true" />
        </span>
        <p className="font-mono text-xs font-bold tracking-[0.2em] text-ax-danger uppercase">403 · Permission required</p>
        <h1 className="font-display text-xl font-bold text-ax-text">Your role doesn’t include this area</h1>
        <p className="max-w-sm text-sm text-ax-muted">Ask a CampusX admin if you need access. Everything else in the control center stays available to you.</p>
        <AdminButton as={Link} to={ADMIN_ROUTES.DASHBOARD} tone="primary">
          Back to the dashboard
        </AdminButton>
      </div>
    </AdminPanel>
  );
}

/**
 * UX-only guard for one admin page: the signed-in staff member's role must grant `permission` (from GET
 * /admin/session). The API enforces the same permission on every request.
 */
export function AdminRoute({ permission, children }) {
  const allowed = useAdminStore((state) => state.session?.permissions?.includes(permission));
  return allowed ? children : <AdminAccessDenied />;
}
