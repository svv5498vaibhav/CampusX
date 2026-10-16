import { useEffect } from 'react';
import { FilePlus2, FileText, Pencil } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui';
import { ROUTES, resumeEditorPath } from '@/constants/routes';
import { useAuthStore } from '@/store/authStore';
import { useResumeStore } from '@/store/resumeStore';
import { formatDateTime, formatRelativeTime } from '@/utils/time';

/**
 * The Resume Builder entry on the student's own profile: what it is, how many resumes they have, the
 * default one and when they last changed one, with Create Resume / Edit Resume. Only the owner sees it;
 * resumes are never shown on a public profile.
 */
export function ResumeProfileCard() {
  const userId = useAuthStore((state) => state.user?.id);
  const summary = useResumeStore((state) => state.summary);
  const status = useResumeStore((state) => state.status);

  useEffect(() => {
    useResumeStore.getState().forViewer(userId);
    useResumeStore.getState().fetchResumes();
  }, [userId]);

  const defaultResume = summary?.defaultResume;
  return (
    <section className="relative flex h-full flex-col gap-4 overflow-hidden rounded-3xl border border-line bg-surface p-4 shadow-soft sm:p-5" aria-labelledby="resume-builder-card-title" data-testid="resume-builder-card">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary-soft-fg sm:size-14">
          <FileText className="size-6 sm:size-7" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="resume-builder-card-title" className="font-display text-lg font-bold text-ink sm:text-xl">
            <Link to={ROUTES.RESUME_BUILDER} className="hover:text-primary hover:underline">
              Resume Builder
            </Link>
          </h2>
          <p className="text-sm text-ink-muted">Build a professional resume from your CampusX profile.</p>
          {summary && (
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-primary-soft-fg">
              <span>
                {summary.count} saved {summary.count === 1 ? 'resume' : 'resumes'}
              </span>
              {defaultResume && <span className="max-w-full truncate">Default: {defaultResume.name}</span>}
              {summary.lastUpdatedAt && (
                <time dateTime={summary.lastUpdatedAt} title={formatDateTime(summary.lastUpdatedAt)}>
                  Updated {formatRelativeTime(summary.lastUpdatedAt)}
                </time>
              )}
            </p>
          )}
          {status === 'error' && !summary && <p className="mt-2 text-xs text-ink-subtle">Couldn’t load your resumes just now.</p>}
        </div>
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <Button as={Link} to={`${ROUTES.RESUME_BUILDER}?new=1`} size="sm" leftIcon={FilePlus2}>
          Create Resume
        </Button>
        {defaultResume && (
          <Button as={Link} to={resumeEditorPath(defaultResume.id)} size="sm" variant="outline" leftIcon={Pencil}>
            Edit Resume
          </Button>
        )}
        {summary?.count > 1 && (
          <Button as={Link} to={ROUTES.RESUME_BUILDER} size="sm" variant="ghost">
            All resumes
          </Button>
        )}
      </div>
    </section>
  );
}
