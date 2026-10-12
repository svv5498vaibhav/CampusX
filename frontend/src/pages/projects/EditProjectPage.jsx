import { useEffect } from 'react';
import { Lock, SearchX } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { PageContainer } from '@/components/layout/PageContainer';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { Button, EmptyState, ErrorState, Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { projectPath } from '@/constants/showcase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { toast } from '@/store/toastStore';

/** /projects/:projectId/edit (owners only; the server checks again on save). */
export default function EditProjectPage() {
  useDocumentTitle('Edit project');
  const { projectId } = useParams();
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id);
  const project = useProjectStore((state) => state.selectedProject);
  const status = useProjectStore((state) => state.selectedStatus);
  const options = useProjectStore((state) => state.options);
  const { forViewer, loadOptions, fetchProject } = useProjectStore.getState();
  const current = project?.id === projectId ? project : null;

  useEffect(() => {
    forViewer(userId);
    loadOptions();
    fetchProject(projectId);
  }, [projectId, userId]);

  if (!current || !options) {
    return (
      <PageContainer width="narrow">
        {status === 'not-found' ? (
          <EmptyState icon={SearchX} titleAs="h1" title="Project not found." action={<Button as={Link} to={ROUTES.PROJECTS}>Browse projects</Button>} />
        ) : status === 'error' ? (
          <ErrorState title="We couldn't load this project" onRetry={() => fetchProject(projectId)} />
        ) : (
          <Loader centered label="Loading project" />
        )}
      </PageContainer>
    );
  }
  if (!current.isOwner) {
    return (
      <PageContainer width="narrow">
        <EmptyState icon={Lock} titleAs="h1" title="You can only edit your own projects" action={<Button as={Link} to={projectPath(current.id)}>Back to the project</Button>} />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Edit project</h1>
        <p className="mt-1 text-sm text-ink-muted">{current.title}</p>
      </header>
      <ProjectForm
        key={current.id}
        project={current}
        onCancel={() => navigate(projectPath(current.id))}
        onSaved={(saved, { imageError }) => {
          toast.success('Project updated.');
          if (imageError) toast.error(`New images weren't added: ${imageError}`);
          navigate(projectPath(saved.id));
        }}
      />
    </PageContainer>
  );
}
