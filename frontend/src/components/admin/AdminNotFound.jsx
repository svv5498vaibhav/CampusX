import { SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { ADMIN_ROUTES } from '@/constants/admin';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { AdminButton, AdminEmpty } from './AdminUi';

/** Unknown /admin/... paths stay inside the control center. */
export function AdminNotFound() {
  useDocumentTitle('Admin · Not found');
  return (
    <AdminEmpty
      icon={SearchX}
      title="No such page in the control center"
      description="The link may be old or mistyped."
      action={
        <AdminButton as={Link} to={ADMIN_ROUTES.DASHBOARD} tone="primary" size="sm" className="mt-2">
          Back to the dashboard
        </AdminButton>
      }
      className="mt-10"
    />
  );
}
