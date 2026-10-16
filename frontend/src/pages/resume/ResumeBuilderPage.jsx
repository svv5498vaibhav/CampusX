import { useEffect, useState } from 'react';
import { Copy, Download, FilePlus2, FileText, Lock, PenLine, Pencil, Star, Trash2 } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { PageContainer } from '@/components/layout/PageContainer';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { CreateResumeDialog, DeleteResumeDialog, NameResumeDialog } from '@/components/resume/ResumeDialogs';
import { Badge, Button, Card, EmptyState, ErrorState, Loader } from '@/components/ui';
import { ROUTES, resumeEditorPath } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useResumeDownload } from '@/hooks/useResumeDownload';
import { resumeApi } from '@/services/resumeApi';
import { useAuthStore } from '@/store/authStore';
import { useResumeStore } from '@/store/resumeStore';
import { toast } from '@/store/toastStore';
import { formatDateTime, formatRelativeTime } from '@/utils/time';

/**
 * /resume-builder: the student's saved resumes. Create (target role first), open in the editor, download,
 * duplicate, rename, make default, delete. Resumes are private: they never appear on the profile.
 */
export default function ResumeBuilderPage() {
  useDocumentTitle('Resume Builder');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = useAuthStore((state) => state.user?.id);
  const { options, optionsError, resumes, summary, status, error } = useResumeStore();
  const [dialog, setDialog] = useState(null); // { kind: 'rename' | 'duplicate' | 'delete', resume }
  const { download, preparing } = useResumeDownload();
  const [downloadingId, setDownloadingId] = useState(null);
  const createOpen = searchParams.get('new') === '1';
  const setCreateOpen = (open) => setSearchParams(open ? { new: '1' } : {}, { replace: true });

  useEffect(() => {
    useResumeStore.getState().forViewer(userId);
    useResumeStore.getState().loadOptions();
    useResumeStore.getState().fetchResumes();
  }, [userId]);

  const create = async (body) => {
    const resume = await resumeApi.create(body);
    useResumeStore.getState().upsert(resume);
    toast.success(`Created “${resume.name}”`);
    navigate(resumeEditorPath(resume.id, 'import'));
    return true;
  };

  const run = async (work, success) => {
    try {
      const result = await work();
      if (success) toast.success(success(result));
      return result;
    } catch (failure) {
      toast.error(failure.message);
      throw failure;
    }
  };

  const atLimit = summary && summary.count >= summary.max;

  return (
    <PageContainer width="wide">
      <SectionHeader
        as="h1"
        eyebrow="Profile"
        title="Resume Builder"
        description="Build a professional resume from your CampusX profile. Keep separate versions for internships, fresher roles and different job descriptions."
        action={
          <Button leftIcon={FilePlus2} onClick={() => setCreateOpen(true)} disabled={!options || atLimit}>
            Create My Resume
          </Button>
        }
      />
      <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
        <Lock className="size-4 shrink-0" aria-hidden="true" /> Your resumes are private. They never appear on your profile or anywhere else on CampusX.
      </p>

      <div className="mt-8">
        {status === 'error' && !resumes.length ? (
          <ErrorState title="We couldn’t load your resumes" description={error} onRetry={() => useResumeStore.getState().fetchResumes()} />
        ) : status !== 'ready' && !resumes.length ? (
          <Loader centered label="Loading your resumes" />
        ) : !resumes.length ? (
          <Card>
            <EmptyState
              icon={FileText}
              title="No resumes yet"
              description="Start with a target role, import your CampusX profile, choose a fresher or internship template and download a PDF."
              action={
                <Button leftIcon={FilePlus2} onClick={() => setCreateOpen(true)} disabled={!options}>
                  Create My Resume
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-muted">
              {summary.count} of {summary.max} resumes{atLimit && ' · delete one to create another'}
            </p>
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="resume-list">
              {resumes.map((resume) => (
                <li key={resume.id}>
                  <Card padding="none" className="flex h-full flex-col" data-resume-id={resume.id}>
                    <div className="flex flex-1 flex-col gap-2 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <Link to={resumeEditorPath(resume.id)} className="min-w-0 font-display text-lg font-bold text-ink hover:text-primary hover:underline">
                          <span className="line-clamp-2">{resume.name}</span>
                        </Link>
                        {resume.isDefault && (
                          <Badge variant="primary" icon={Star}>
                            Default
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-ink-muted">
                        {resume.targetRoleLabel} · {resume.templateName}
                      </p>
                      <p className="text-xs text-ink-subtle">
                        <time dateTime={resume.updatedAt} title={formatDateTime(resume.updatedAt)}>
                          Updated {formatRelativeTime(resume.updatedAt)}
                        </time>
                        {resume.lastExportedAt && ` · downloaded ${formatRelativeTime(resume.lastExportedAt)}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 border-t border-line p-3">
                      <Button as={Link} to={resumeEditorPath(resume.id)} size="sm" leftIcon={Pencil}>
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={Download}
                        loading={preparing && downloadingId === resume.id}
                        onClick={async () => {
                          setDownloadingId(resume.id);
                          await download(resume.id);
                          setDownloadingId(null);
                        }}
                      >
                        Download PDF
                      </Button>
                      <ResumeMenu
                        resume={resume}
                        disabled={atLimit}
                        onDuplicate={() => setDialog({ kind: 'duplicate', resume })}
                        onRename={() => setDialog({ kind: 'rename', resume })}
                        onDefault={() => run(() => resumeApi.setDefault(resume.id).then((updated) => useResumeStore.getState().upsert(updated)), () => `“${resume.name}” is now your default resume`).catch(() => {})}
                        onDelete={() => setDialog({ kind: 'delete', resume })}
                      />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {optionsError && !options && <p className="mt-4 text-sm text-danger-fg">Couldn’t load the Resume Builder options: {optionsError}</p>}

      <CreateResumeDialog open={createOpen && Boolean(options)} onClose={() => setCreateOpen(false)} options={options} onCreate={create} />
      {dialog?.kind === 'rename' && (
        <NameResumeDialog
          open
          onClose={() => setDialog(null)}
          initialName={dialog.resume.name}
          onSave={(name) => run(() => resumeApi.update(dialog.resume.id, { name, revision: dialog.resume.revision }).then((updated) => useResumeStore.getState().upsert(updated)), () => 'Resume renamed')}
        />
      )}
      {dialog?.kind === 'duplicate' && (
        <NameResumeDialog
          open
          title="Duplicate Resume"
          confirmLabel="Duplicate"
          onClose={() => setDialog(null)}
          initialName={`Copy of ${dialog.resume.name}`.slice(0, 80)}
          onSave={(name) => run(() => resumeApi.duplicate(dialog.resume.id, { name }).then((copy) => useResumeStore.getState().upsert(copy)), () => 'Resume duplicated')}
        />
      )}
      <DeleteResumeDialog
        open={dialog?.kind === 'delete'}
        resume={dialog?.resume}
        onClose={() => setDialog(null)}
        onDelete={() => run(() => resumeApi.remove(dialog.resume.id).then(({ newDefaultId }) => useResumeStore.getState().removeLocal(dialog.resume.id, newDefaultId)), () => 'Resume deleted')}
      />
    </PageContainer>
  );
}

function ResumeMenu({ resume, disabled, onDuplicate, onRename, onDefault, onDelete }) {
  return (
    <div className="ml-auto flex items-center gap-1">
      <IconAction label={`Duplicate Resume ${resume.name}`} icon={Copy} onClick={onDuplicate} disabled={disabled} />
      <IconAction label={`Rename ${resume.name}`} icon={PenLine} onClick={onRename} />
      {!resume.isDefault && <IconAction label={`Make ${resume.name} your default resume`} icon={Star} onClick={onDefault} />}
      <IconAction label={`Delete ${resume.name}`} icon={Trash2} onClick={onDelete} danger />
    </div>
  );
}

function IconAction({ label, icon: Icon, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid size-9 place-items-center rounded-xl text-ink-subtle transition-colors disabled:pointer-events-none disabled:opacity-40 ${danger ? 'hover:bg-danger-soft hover:text-danger-fg' : 'hover:bg-surface-muted hover:text-ink'}`}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}
