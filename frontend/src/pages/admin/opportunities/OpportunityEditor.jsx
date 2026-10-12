import { useEffect } from 'react';
import { ArrowLeft, SearchX } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { PageContainer } from '@/components/layout/PageContainer';
import { OpportunityForm } from '@/components/opportunities/OpportunityForm';
import { Button, EmptyState, ErrorState, Loader } from '@/components/ui';
import { opportunityPath } from '@/constants/opportunities';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuthStore } from '@/store/authStore';
import { useOpportunityStore } from '@/store/opportunityStore';
import { toast } from '@/store/toastStore';

/** /admin/opportunities/new and /admin/opportunities/:opportunityId/edit (moderators and admins). */
export default function OpportunityEditor() {
  const { opportunityId } = useParams();
  const editing = Boolean(opportunityId);
  useDocumentTitle(editing ? 'Edit opportunity' : 'Create opportunity');
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id);
  const options = useOpportunityStore((state) => state.options);
  const optionsStatus = useOpportunityStore((state) => state.optionsStatus);
  const opportunity = useOpportunityStore((state) => state.selectedOpportunity);
  const status = useOpportunityStore((state) => state.selectedStatus);
  const error = useOpportunityStore((state) => state.selectedError);
  const { forViewer, loadOptions, fetchOpportunity } = useOpportunityStore.getState();
  // Wait for the full record: a card cached from a list has no description, so it can't fill the form.
  const current = editing && opportunity?.id === opportunityId && status === 'ready' && opportunity.description !== undefined ? opportunity : null;

  useEffect(() => {
    forViewer(userId);
    loadOptions();
  }, [userId]);
  useEffect(() => {
    if (editing) fetchOpportunity(opportunityId);
  }, [opportunityId, userId]);

  const saved = (result, { imageError }) => {
    if (imageError) toast.error(`Saved, but the image didn’t upload: ${imageError}`);
    else toast.success(editing ? 'Opportunity updated.' : result.status === 'published' ? 'Opportunity published.' : 'Draft saved.');
    navigate(ROUTES.ADMIN_OPPORTUNITIES, { replace: true });
  };

  let body;
  if (optionsStatus === 'error') body = <ErrorState title="We couldn't load the form" onRetry={loadOptions} />;
  else if (!options || (editing && !current && !['not-found', 'error'].includes(status))) body = <Loader centered label="Loading" />;
  else if (editing && status === 'not-found') body = <EmptyState icon={SearchX} title="Opportunity not found." action={<Button as={Link} to={ROUTES.ADMIN_OPPORTUNITIES}>Back to the list</Button>} />;
  else if (editing && status === 'error') body = <ErrorState title="We couldn't load this opportunity" description={error} onRetry={() => fetchOpportunity(opportunityId)} />;
  else body = <OpportunityForm key={current?.id ?? 'new'} opportunity={current} onSaved={saved} onCancel={() => navigate(editing ? opportunityPath(opportunityId) : ROUTES.ADMIN_OPPORTUNITIES)} />;

  return (
    <PageContainer width="narrow">
      <Button as={Link} to={ROUTES.ADMIN_OPPORTUNITIES} variant="ghost" size="sm" leftIcon={ArrowLeft} className="-ml-2 mb-3">Manage opportunities</Button>
      <h1 className="mb-1 font-display text-2xl font-bold text-ink sm:text-3xl">{editing ? 'Edit opportunity' : 'Create opportunity'}</h1>
      <p className="mb-6 text-sm text-ink-muted">{editing ? 'Changes show up for students straight away.' : 'Save it as a draft to finish later, or publish it for students now.'}</p>
      {body}
    </PageContainer>
  );
}
