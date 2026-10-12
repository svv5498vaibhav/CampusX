import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, Eye, FolderGit2, Globe, Heart, MonitorPlay, Pencil, SearchX, Share2, Sparkles } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { PageContainer } from '@/components/layout/PageContainer';
import { ProjectMedia } from '@/components/projects/ProjectMedia';
import { ProjectMenu } from '@/components/projects/ProjectMenu';
import { ModerationNotice } from '@/components/safety/ModerationNotice';
import { ShareToFeedDialog } from '@/components/showcase/ShareToFeedDialog';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Loader } from '@/components/ui';
import { profilePath, ROUTES } from '@/constants/routes';
import { PROJECT_CATEGORY_ICONS, PROJECT_STATUS_BADGES, categoryLabel, formatDate, projectPath, projectUrl, statusLabel, visibilityLabel } from '@/constants/showcase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';
import { getFullName } from '@/utils/string';
import { safeExternalUrl } from '@/utils/url';

const LINKS = [
  { field: 'githubUrl', label: 'GitHub', icon: FolderGit2 },
  { field: 'liveUrl', label: 'Live demo', icon: Globe },
  { field: 'demoUrl', label: 'Demo', icon: MonitorPlay },
];

/** One project: large visual, builder, status, tech, story, links, team; like and share. */
export default function ProjectDetailsPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id);
  const project = useProjectStore((state) => state.selectedProject);
  const status = useProjectStore((state) => state.selectedStatus);
  const error = useProjectStore((state) => state.selectedError);
  const options = useProjectStore((state) => state.options);
  const likeBusy = useProjectStore((state) => Boolean(state.busy[`${projectId}:like`]));
  const { forViewer, loadOptions, fetchProject, likeProject, unlikeProject, shareProject } = useProjectStore.getState();
  // Offered once right after saving a new project.
  const [offerShare, setOfferShare] = useState(Boolean(location.state?.justCreated));
  const [sharing, setSharing] = useState(false);
  const current = project?.id === projectId ? project : null;
  useDocumentTitle(current?.title ?? 'Project');

  useEffect(() => {
    forViewer(userId);
    loadOptions();
  }, [userId]);
  useEffect(() => {
    fetchProject(projectId);
    if (location.state?.justCreated) navigate(location.pathname, { replace: true, state: null });
  }, [projectId, userId]);

  if (!current) {
    return (
      <PageContainer width="default">
        {status === 'not-found' ? (
          <EmptyState icon={SearchX} titleAs="h1" title="Project not found." description="It may have been deleted, or it isn't shared with you." action={<Button as={Link} to={ROUTES.PROJECTS}>Browse projects</Button>} />
        ) : status === 'error' ? (
          <ErrorState title="We couldn't load this project" description={error} onRetry={() => fetchProject(projectId)} />
        ) : (
          <Loader centered label="Loading project" />
        )}
      </PageContainer>
    );
  }

  const owner = current.owner;
  const CategoryIcon = PROJECT_CATEGORY_ICONS[current.category] ?? PROJECT_CATEGORY_ICONS.other;
  const like = async () => {
    try {
      await (current.likedByCurrentUser ? unlikeProject : likeProject)(current.id);
    } catch (requestError) {
      toast.error(requestError.message);
    }
  };
  const share = async () => {
    if (await shareProject(current.id)) toast.success('Project link copied!');
    else toast.error(`Couldn't copy automatically. The link is ${projectUrl(current.id)}`);
  };
  // Only http(s) links are ever rendered (the server refuses anything else too).
  const links = LINKS.map((link) => ({ ...link, href: safeExternalUrl(current[link.field]) })).filter((link) => link.href);

  return (
    <PageContainer width="default">
      <Button as={Link} to={ROUTES.PROJECTS} variant="ghost" size="sm" leftIcon={ArrowLeft} className="-ml-2 mb-3">All projects</Button>

      {offerShare && current.isOwner && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/40 bg-primary-soft px-4 py-3">
          <Sparkles className="size-5 text-primary" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm font-semibold text-ink">Project saved! Share it with CampusX?</p>
          <Button size="sm" variant="outline" onClick={() => setOfferShare(false)}>Not now</Button>
          <Button size="sm" onClick={() => { setOfferShare(false); setSharing(true); }}>Share</Button>
        </div>
      )}

      <article className="flex flex-col gap-5" aria-labelledby="project-title">
        {current.images.length > 0 ? (
          <ProjectMedia images={current.images} title={current.title} />
        ) : (
          <div className="campus-grid grid aspect-[16/6] place-items-center rounded-3xl border border-line bg-primary-soft text-primary-soft-fg">
            <CategoryIcon className="size-14 opacity-80" aria-hidden="true" />
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={PROJECT_STATUS_BADGES[current.status]}>{statusLabel(options, current.status)}</Badge>
              <Badge variant="neutral" icon={CategoryIcon}>{categoryLabel(options, current.category)}</Badge>
              {current.isOwner && <Badge variant="outline">{visibilityLabel(options, current.visibility)}</Badge>}
            </div>
            <h1 id="project-title" className="mt-2 font-display text-2xl leading-tight font-bold text-ink sm:text-3xl">{current.title}</h1>
            <p className="mt-1 text-ink-muted">{current.shortDescription}</p>
            {current.moderation && <ModerationNotice status={current.moderation.status} noun="project" className="mt-3" />}
          </div>
          <div className="flex items-center gap-2">
            {current.isOwner && (
              <>
                <Button as={Link} to={`${projectPath(current.id)}/edit`} variant="outline" size="sm" leftIcon={Pencil}>Edit</Button>
              </>
            )}
            <ProjectMenu project={current} onDeleted={() => navigate(ROUTES.PROJECTS, { replace: true })} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant={current.likedByCurrentUser ? 'secondary' : 'outline'} size="sm" leftIcon={Heart} onClick={like} disabled={likeBusy} aria-pressed={current.likedByCurrentUser} className={cn(current.likedByCurrentUser && '[&_svg]:fill-current')}>
            {current.likedByCurrentUser ? 'Liked' : 'Like'} · {current.likeCount}
          </Button>
          <Button variant="outline" size="sm" leftIcon={Share2} onClick={share}>Share</Button>
          <span className="ml-auto inline-flex items-center gap-3 text-sm text-ink-muted">
            <span className="inline-flex items-center gap-1"><Eye className="size-4" aria-hidden="true" /> {current.views} {current.views === 1 ? 'view' : 'views'}</span>
            <span className="inline-flex items-center gap-1"><CalendarDays className="size-4" aria-hidden="true" /> {formatDate(current.createdAt)}</span>
          </span>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-w-0 flex-col gap-5">
            <Card>
              <h2 className="font-display text-lg font-bold text-ink">About this project</h2>
              <p className="mt-2 text-[15px] leading-relaxed break-words whitespace-pre-line text-ink">{current.description}</p>
            </Card>
            {current.techStack.length > 0 && (
              <Card>
                <h2 className="font-display text-lg font-bold text-ink">Built with</h2>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {current.techStack.map((tech) => <li key={tech} className="rounded-lg bg-primary-soft px-2.5 py-1 text-sm font-semibold text-primary-soft-fg">{tech}</li>)}
                </ul>
              </Card>
            )}
          </div>

          <aside className="flex flex-col gap-4" aria-label="Project details">
            {owner && (
              <Card padding="sm">
                <h2 className="text-sm font-semibold text-ink-muted">Built by</h2>
                <Link to={profilePath(owner.id)} className="mt-2 flex items-center gap-3 rounded-xl hover:bg-surface-muted">
                  <Avatar src={owner.avatarUrl} name={getFullName(owner)} size="md" />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-ink">{getFullName(owner)}</p>
                    <p className="truncate text-xs text-ink-muted">{[owner.branch?.shortName, owner.semester?.label].filter(Boolean).join(' • ')}</p>
                    <p className="truncate text-xs text-ink-subtle">{owner.college?.name}</p>
                  </div>
                </Link>
              </Card>
            )}
            {links.length > 0 && (
              <Card padding="sm">
                <h2 className="text-sm font-semibold text-ink-muted">Links</h2>
                <ul className="mt-2 flex flex-col gap-1">
                  {links.map(({ field, label, href, icon: Icon }) => (
                    <li key={field}>
                      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-primary hover:bg-primary-soft">
                        <Icon className="size-4" aria-hidden="true" /> {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {current.team.length > 0 && (
              <Card padding="sm">
                <h2 className="text-sm font-semibold text-ink-muted">Team</h2>
                <ul className="mt-2 flex flex-col gap-2">
                  {current.team.map((member) => (
                    <li key={member.student.id} className="flex items-center gap-2">
                      <Avatar src={member.student.avatarUrl} name={getFullName(member.student)} size="sm" />
                      <div className="min-w-0 flex-1">
                        <Link to={profilePath(member.student.id)} className="block truncate text-sm font-semibold text-ink hover:underline">{getFullName(member.student)}</Link>
                        <p className="text-xs text-ink-subtle">{options?.teamRoles.find((role) => role.id === member.role)?.label ?? member.role}{member.status === 'invited' && ' · invited'}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </aside>
        </div>
      </article>

      {current.isOwner && (
        <ShareToFeedDialog open={sharing} onClose={() => setSharing(false)} item={{ kind: 'project', title: current.title, url: projectUrl(current.id), visibility: current.visibility }} />
      )}
    </PageContainer>
  );
}
