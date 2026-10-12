import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button, Card, ErrorState } from '@/components/ui';
import { ROUTES } from '@/constants/routes';

/** Router-level error boundary, so a crashing page never blanks the whole app. */
export function RouteError() {
  const error = useRouteError();

  const description = isRouteErrorResponse(error)
    ? `${error.status} · ${error.statusText}`
    : 'An unexpected error interrupted this page. Reloading usually fixes it.';

  if (import.meta.env.DEV && error) {
    console.error(error);
  }

  return (
    <PageContainer width="narrow" className="flex min-h-[70vh] items-center">
      <Card className="w-full">
        <ErrorState
          titleAs="h1"
          description={description}
          action={
            <>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Reload page
              </Button>
              <Button as={Link} to={ROUTES.LANDING}>
                Go to CampusX home
              </Button>
            </>
          }
        />
      </Card>
    </PageContainer>
  );
}
