import { MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button, Card, EmptyState } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');

  return (
    <PageContainer width="narrow" className="flex min-h-dvh items-center">
      <Card className="campus-grid w-full">
        <EmptyState
          titleAs="h1"
          icon={MapPin}
          title="This spot isn't on the campus map"
          description="The page you are looking for doesn't exist or has moved."
          action={
            <Button as={Link} to={ROUTES.LANDING}>
              Back to CampusX
            </Button>
          }
        />
      </Card>
    </PageContainer>
  );
}
