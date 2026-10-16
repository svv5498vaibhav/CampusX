import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, CloudAlert, CloudCheck, Download, Eye, FileX, LoaderCircle, Printer, Save, X } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { PageContainer } from '@/components/layout/PageContainer';
import { ResumePreview } from '@/components/resume/ResumePreview';
import { useResumePrint } from '@/components/resume/ResumePrint';
import { StepNav } from '@/components/resume/StepNav';
import { DesignStep } from '@/components/resume/steps/DesignStep';
import { EducationStep } from '@/components/resume/steps/EducationStep';
import { ExperienceStep } from '@/components/resume/steps/ExperienceStep';
import { ImportStep } from '@/components/resume/steps/ImportStep';
import { PersonalStep } from '@/components/resume/steps/PersonalStep';
import { ProjectsStep } from '@/components/resume/steps/ProjectsStep';
import { ReviewStep } from '@/components/resume/steps/ReviewStep';
import { SkillsStep } from '@/components/resume/steps/SkillsStep';
import { SummaryStep } from '@/components/resume/steps/SummaryStep';
import { TargetRoleStep } from '@/components/resume/steps/TargetRoleStep';
import { Alert, Button, Card, EmptyState, ErrorState, Loader } from '@/components/ui';
import { RESUME_STEPS, RESUME_STEP_IDS } from '@/constants/resume';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { accentMap, useResumeDownload } from '@/hooks/useResumeDownload';
import { useResumeEditor } from '@/hooks/useResumeEditor';
import { useAuthStore } from '@/store/authStore';
import { useResumeStore } from '@/store/resumeStore';
import { filledCount } from '@/utils/resume/content';
import { layoutResume } from '@/utils/resume/document';

const STEP_VIEWS = {
  role: TargetRoleStep,
  import: ImportStep,
  personal: PersonalStep,
  education: EducationStep,
  skills: SkillsStep,
  projects: ProjectsStep,
  experience: ExperienceStep,
  summary: SummaryStep,
  design: DesignStep,
  review: ReviewStep,
};

/**
 * /resume-builder/:resumeId — the guided editor. Steps on the left (or above, on phones), the live A4
 * preview on the right; every change is saved automatically. "Download PDF" saves first, then builds the
 * PDF from the saved copy, laid out exactly like the preview.
 */
export default function ResumeEditorPage() {
  const { resumeId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = useAuthStore((state) => state.user?.id);
  const options = useResumeStore((state) => state.options);
  const optionsError = useResumeStore((state) => state.optionsError);
  const editor = useResumeEditor(resumeId);
  const { download, preparing } = useResumeDownload();
  const { print, portal } = useResumePrint();
  const [previewOpen, setPreviewOpen] = useState(false);
  const cardRef = useRef(null);
  useDocumentTitle(editor.draft?.name ? `${editor.draft.name} · Resume Builder` : 'Resume Builder');

  useEffect(() => {
    useResumeStore.getState().forViewer(userId);
    useResumeStore.getState().loadOptions();
  }, [userId]);

  // The phone preview covers the page: lock the page behind it and let Escape close it.
  useEffect(() => {
    if (!previewOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setPreviewOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [previewOpen]);

  const step = RESUME_STEP_IDS.includes(searchParams.get('step')) ? searchParams.get('step') : 'personal';
  const focusItemId = searchParams.get('item');
  const goTo = (next, itemId) => {
    setSearchParams(itemId ? { step: next, item: itemId } : { step: next }, { preventScrollReset: true });
    requestAnimationFrame(() => {
      cardRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      cardRef.current?.querySelector('h2')?.focus({ preventScroll: true });
    });
  };

  // The preview follows the draft a beat behind typing, so typing never waits for layout.
  const accents = useMemo(() => accentMap(options), [options]);
  const deferredDraft = useDeferredValue(editor.draft);
  const layout = useMemo(() => (deferredDraft ? layoutResume(deferredDraft, { accents }) : null), [deferredDraft, accents]);

  if (editor.status === 'error') {
    return (
      <PageContainer width="wide">
        {editor.errorStatus === 404 || editor.errorStatus === 422 ? (
          <Card>
            <EmptyState icon={FileX} title="Resume not found" description="It may have been deleted, or it isn’t one of your resumes." action={<Button as={Link} to={ROUTES.RESUME_BUILDER}>Back to your resumes</Button>} />
          </Card>
        ) : (
          <ErrorState title="We couldn’t open this resume" description={editor.error} onRetry={editor.reload} />
        )}
      </PageContainer>
    );
  }
  if (!editor.draft || !options) {
    return (
      <PageContainer width="wide">
        {optionsError && !options ? <ErrorState title="We couldn’t load the Resume Builder" description={optionsError} onRetry={() => useResumeStore.getState().loadOptions()} /> : <Loader centered label="Opening your resume" />}
      </PageContainer>
    );
  }

  const { content } = editor.draft;
  const needsAttention = new Set();
  if (!editor.draft.name.trim()) needsAttention.add('role');
  if (!content.personal.fullName.trim() || !content.personal.email.trim()) needsAttention.add('personal');
  if (!filledCount.education(content)) needsAttention.add('education');
  for (const error of editor.fieldErrors) {
    const section = /^content\.(\w+)/.exec(error.field)?.[1];
    const stepFor = { personal: 'personal', summary: 'summary', education: 'education', coursework: 'education', skills: 'skills', projects: 'projects' }[section] ?? (section ? 'experience' : error.field === 'name' ? 'role' : 'design');
    needsAttention.add(stepFor);
  }
  const filled = new Set(['role', 'design']);
  if (editor.resume?.importedAt) filled.add('import');
  for (const key of ['personal', 'education', 'skills', 'projects', 'experience', 'summary']) if (filledCount[key](content)) filled.add(key);

  const index = RESUME_STEP_IDS.indexOf(step);
  const StepView = STEP_VIEWS[step];
  const onDownload = () => download(resumeId, { beforeExport: editor.save });
  const stepProps = { editor, options, resumeId, goTo, layout, focusItemId, onDownload, downloading: preparing, onPrint: () => print(layout) };

  return (
    <PageContainer width="full" className="max-w-[1600px]">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button as={Link} to={ROUTES.RESUME_BUILDER} variant="ghost" size="sm" leftIcon={ArrowLeft}>
          All resumes
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-bold text-ink sm:text-2xl">{editor.draft.name || 'Untitled resume'}</h1>
          <SaveStatus state={editor.saveState} onRetry={editor.saveState === 'error' ? () => editor.save() : undefined} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" leftIcon={Eye} className="lg:hidden" onClick={() => setPreviewOpen(true)}>
            Preview Resume
          </Button>
          <Button variant="outline" size="sm" leftIcon={Save} onClick={() => editor.save()} disabled={editor.saveState === 'saved' || editor.saveState === 'saving' || editor.saveState === 'conflict'}>
            Save Changes
          </Button>
          <Button variant="outline" size="sm" leftIcon={Printer} onClick={() => print(layout)} className="hidden sm:inline-flex">
            Print
          </Button>
          <Button size="sm" leftIcon={Download} onClick={onDownload} loading={preparing} data-testid="download-pdf">
            Download PDF
          </Button>
        </div>
      </div>

      {editor.saveState === 'conflict' && (
        <Alert variant="danger" title="This resume changed somewhere else" className="mb-4">
          <p>It was edited in another tab or on another device, so your latest changes here weren’t saved (nothing was overwritten).</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={editor.reload}>
            Reload the latest version
          </Button>
        </Alert>
      )}
      {editor.saveState === 'error' && (
        <Alert variant="danger" title="Couldn’t save your latest changes" className="mb-4">
          <p>{editor.saveError}</p>
          {editor.fieldErrors.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {editor.fieldErrors.slice(0, 5).map((error) => <li key={`${error.field}-${error.message}`}>{error.message}</li>)}
            </ul>
          )}
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)] xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.9fr)]">
        <div className="min-w-0">
          <StepNav current={step} onSelect={(next) => goTo(next)} filled={filled} needsAttention={needsAttention} />
          <Card ref={cardRef} className="mt-3 scroll-mt-4" data-step-panel={step}>
            <StepView {...stepProps} />
          </Card>
          <div className="mt-4 flex items-center justify-between gap-3">
            <Button variant="ghost" leftIcon={ArrowLeft} disabled={index === 0} onClick={() => goTo(RESUME_STEP_IDS[index - 1])}>
              Back
            </Button>
            {index < RESUME_STEPS.length - 1 ? (
              <Button rightIcon={ArrowRight} onClick={() => goTo(RESUME_STEP_IDS[index + 1])}>
                <span className="sm:hidden">Next: {RESUME_STEPS[index + 1].short}</span>
                <span className="hidden sm:inline">Next: {RESUME_STEPS[index + 1].label}</span>
              </Button>
            ) : (
              <Button leftIcon={Download} onClick={onDownload} loading={preparing}>
                Download PDF
              </Button>
            )}
          </div>
        </div>
        <aside className="hidden lg:sticky lg:top-4 lg:block" aria-label="Live preview">
          <ResumePreview layout={layout} pageMode={editor.draft.settings.pageMode} className="max-h-[calc(100dvh-2rem)]" />
        </aside>
      </div>

      {/* A portal: the page sits in an animated (transformed) container, which would trap a fixed panel. */}
      {previewOpen && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col bg-canvas lg:hidden" role="dialog" aria-modal="true" aria-label="Resume preview">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <p className="min-w-0 flex-1 truncate font-display text-lg font-bold text-ink">Preview Resume</p>
            <Button size="sm" leftIcon={Download} onClick={onDownload} loading={preparing}>
              Download PDF
            </Button>
            <button type="button" onClick={() => setPreviewOpen(false)} className="grid size-10 place-items-center rounded-xl text-ink-muted hover:bg-surface-muted" aria-label="Close preview" autoFocus>
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <ResumePreview layout={layout} pageMode={editor.draft.settings.pageMode} compact />
          </div>
        </div>,
        document.body,
      )}
      {portal}
    </PageContainer>
  );
}

function SaveStatus({ state, onRetry }) {
  const views = {
    saved: { icon: CloudCheck, text: 'All changes saved', className: 'text-ink-subtle' },
    dirty: { icon: CloudCheck, text: 'Unsaved changes…', className: 'text-ink-subtle' },
    saving: { icon: LoaderCircle, text: 'Saving…', className: 'text-ink-subtle', spin: true },
    error: { icon: CloudAlert, text: 'Not saved', className: 'text-danger-fg' },
    conflict: { icon: CloudAlert, text: 'Changed elsewhere: not saved', className: 'text-danger-fg' },
  };
  const view = views[state] ?? views.saved;
  const Icon = view.icon;
  return (
    <p className={`mt-0.5 flex items-center gap-1.5 text-xs font-medium ${view.className}`} role="status" aria-live="polite" data-save-state={state}>
      <Icon className={`size-3.5 ${view.spin ? 'animate-spin' : ''}`} aria-hidden="true" />
      {view.text}
      {onRetry && (
        <button type="button" onClick={onRetry} className="ml-1 font-semibold text-primary underline">
          Try again
        </button>
      )}
    </p>
  );
}
