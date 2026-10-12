import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button, Card, EmptyState } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

/** Shown when a signed-in user opens an area their role can't use. The API enforces the same rule. */
export function AccessDenied() {
  useDocumentTitle('Access restricted');

  return (
    <PageContainer width="narrow">
      <Card className="campus-grid">
        <EmptyState
          titleAs="h1"
          icon={ShieldAlert}
          title="This area is for campus staff"
          description="Your account doesn't have access to this page. If you think that's a mistake, contact a CampusX admin."
          action={
            <Button as={Link} to={ROUTES.HOME}>
              Back to campus home
            </Button>
          }
        />
      </Card>
    </PageContainer>
  );
}
