import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { PageContainer } from '@/components/layout/PageContainer';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { projectPath } from '@/constants/showcase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useProjectStore } from '@/store/projectStore';
import { toast } from '@/store/toastStore';

/** /projects/create */
export default function CreateProjectPage() {
  useDocumentTitle('Add a project');
  const navigate = useNavigate();
  const options = useProjectStore((state) => state.options);
  const loadOptions = useProjectStore((state) => state.loadOptions);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  return (
    <PageContainer width="narrow">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Share something you built</h1>
        <p className="mt-1 text-sm text-ink-muted">Apps, bots, robots, research, college assignments: if you built it, it belongs here.</p>
      </header>
      {options ? (
        <ProjectForm
          onCancel={() => navigate(ROUTES.PROJECTS)}
          onSaved={(project, { imageError }) => {
            toast.success('Project saved!');
            if (imageError) toast.error(`The project was saved, but the images weren't: ${imageError} You can add them from Edit.`);
            navigate(projectPath(project.id), { state: { justCreated: true } });
          }}
        />
      ) : (
        <Loader centered label="Loading" />
      )}
    </PageContainer>
  );
}
