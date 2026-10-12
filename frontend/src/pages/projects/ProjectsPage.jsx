import { useEffect, useRef, useState } from 'react';
import { FolderKanban, Plus, Search } from 'lucide-react';
import { Link } from 'react-router';
import { FeedFilters } from '@/components/feed/FeedFilters';
import { PageContainer } from '@/components/layout/PageContainer';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { Button, EmptyState, ErrorState, Input, Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { projectPath } from '@/constants/showcase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { toast } from '@/store/toastStore';

/** Student projects (/projects): browse by category, search by title, description or technology. */
export default function ProjectsPage() {
  useDocumentTitle('Student Projects');
  const userId = useAuthStore((state) => state.user?.id);
  const [{ category, sort, search }, update] = useUrlFilters({ category: 'all', sort: 'new', search: '' });
  const [draft, setDraft] = useState(search);
  const projects = useProjectStore((state) => state.projects);
  const loading = useProjectStore((state) => state.loading);
  const loadingMore = useProjectStore((state) => state.loadingMore);
  const error = useProjectStore((state) => state.error);
  const pagination = useProjectStore((state) => state.pagination);
  const options = useProjectStore((state) => state.options);
  const mine = useProjectStore((state) => state.mine);
  const { forViewer, loadOptions, fetchProjects, fetchMine, loadMore, acceptInvitation, leaveTeam } = useProjectStore.getState();

  useEffect(() => {
    forViewer(userId);
    loadOptions();
    fetchMine();
  }, [userId]);
  useEffect(() => {
    fetchProjects({ category, sort, search });
  }, [category, sort, search, userId]);

  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onSearch = (value) => {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => update({ search: value.trim() }), 300);
  };

  const respond = async (projectId, accept) => {
    try {
      if (accept) await acceptInvitation(projectId);
      else await leaveTeam(projectId);
      toast.success(accept ? 'You joined the project team.' : 'Invitation declined.');
    } catch (requestError) {
      toast.error(requestError.message);
    }
  };

  return (
    <PageContainer width="wide">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Student Projects</h1>
          <p className="mt-1 text-sm text-ink-muted">Things students on CampusX have built: apps, bots, robots and research.</p>
        </div>
        <Button as={Link} to={ROUTES.PROJECT_CREATE} leftIcon={Plus}>Add a project</Button>
      </header>

      {mine?.invitations?.length > 0 && (
        <section aria-label="Team invitations" className="mt-6 flex flex-col gap-2">
          {mine.invitations.map((project) => (
            <div key={project.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/40 bg-primary-soft px-4 py-3">
              <p className="min-w-0 flex-1 text-sm text-ink">
                <strong>{project.owner?.firstName}</strong> added you to <Link to={projectPath(project.id)} className="font-semibold text-primary hover:underline">{project.title}</Link>
              </p>
              <Button size="sm" variant="outline" onClick={() => respond(project.id, false)}>Decline</Button>
              <Button size="sm" onClick={() => respond(project.id, true)}>Join team</Button>
            </div>
          ))}
        </section>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input type="search" aria-label="Search projects" placeholder="Search by title, description or tech (e.g. React)" leftIcon={Search} value={draft} onChange={(event) => onSearch(event.target.value)} containerClassName="flex-1" />
        <label className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
          Sort
          <select value={sort} onChange={(event) => update({ sort: event.target.value })} className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold text-ink focus:border-primary focus:ring-4 focus:ring-focus focus:outline-none">
            <option value="new">Newest</option>
            <option value="popular">Most liked</option>
          </select>
        </label>
      </div>
      <div className="mt-4">
        <FeedFilters filters={options?.filters} value={category} onChange={(next) => update({ category: next })} label="Filter projects" />
      </div>

      <section className="mt-6" aria-label="Projects">
        {projects.length === 0 && loading && <Loader centered label="Loading projects" className="min-h-40" />}
        {projects.length === 0 && !loading && error && <ErrorState title="We couldn't load projects" description={error} onRetry={() => fetchProjects({ category, sort, search })} />}
        {projects.length === 0 && !loading && !error && (
          <EmptyState icon={FolderKanban} title={search ? 'No projects match that search' : 'No projects here yet'} description="Built something? A college assignment counts too." action={<Button as={Link} to={ROUTES.PROJECT_CREATE} leftIcon={Plus} variant="outline">Add a project</Button>} className="rounded-3xl border border-dashed border-line-strong" />
        )}
        {projects.length > 0 && (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => <li key={project.id}><ProjectCard project={project} /></li>)}
          </ul>
        )}
        {pagination?.hasMore && (
          <div className="mt-6 flex justify-center"><Button variant="outline" loading={loadingMore} onClick={loadMore}>Load more projects</Button></div>
        )}
      </section>
    </PageContainer>
  );
}
