import { useState } from 'react';
import { CloudDownload, Info } from 'lucide-react';
import { Alert, Badge, Button, Loader } from '@/components/ui';
import { resumeApi } from '@/services/resumeApi';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';
import { mergeImport } from '@/utils/resume/content';
import { dateRange, formatDate } from '@/utils/resume/format';
import { StepIntro } from '../ResumeFields';

const LISTS = [
  { key: 'projects', title: 'Projects', describe: (item) => [item.role, item.tech.slice(0, 4).join(', ')].filter(Boolean).join(' · ') },
  { key: 'experience', title: 'Internships', describe: (item) => [item.organization, formatDate(item.startDate)].filter(Boolean).join(' · ') },
  { key: 'achievements', title: 'Achievements', describe: (item) => [item.kind, item.organization, formatDate(item.date)].filter(Boolean).join(' · ') },
  { key: 'certifications', title: 'Certifications', describe: (item) => [item.issuer, formatDate(item.date)].filter(Boolean).join(' · ') },
];

/** One tickable line of the import review. */
function Toggle({ choice, setChoice, name, label, detail, disabled }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-muted', disabled && 'cursor-not-allowed opacity-50')}>
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--cx-primary)]" checked={Boolean(choice[name])} disabled={disabled} onChange={(event) => setChoice((current) => ({ ...current, [name]: event.target.checked }))} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {detail && <span className="block text-xs text-ink-muted">{detail}</span>}
      </span>
    </label>
  );
}

/**
 * Step 2: "Import My CampusX Profile". Loads a draft from the student's own CampusX records (nothing is
 * saved yet), lets them tick what to keep, and adds it to the resume. Existing text is never overwritten.
 */
export function ImportStep({ editor, options, goTo }) {
  const [state, setState] = useState({ status: 'idle', data: null, error: null });
  const [choice, setChoice] = useState(null);
  const content = editor.draft.content;

  const load = async () => {
    setState({ status: 'loading', data: null, error: null });
    try {
      const data = await resumeApi.importProfile();
      const already = (key) => new Set(content[key].map((item) => item.source).filter(Boolean));
      const pickFirst = (key) => data.draft[key].filter((item) => !already(key).has(item.source)).slice(0, Math.max(0, data.limits[key] - content[key].length)).map((item) => item.id);
      setChoice({
        personal: true,
        summary: Boolean(data.draft.summary),
        education: data.draft.education.length > 0,
        skills: data.draft.skills.length > 0,
        coursework: data.draft.coursework.length > 0,
        projects: pickFirst('projects'),
        experience: pickFirst('experience'),
        achievements: pickFirst('achievements'),
        certifications: pickFirst('certifications'),
      });
      setState({ status: 'ready', data, error: null });
    } catch (error) {
      setState({ status: 'error', data: null, error: error.message });
    }
  };

  const apply = () => {
    const { draft } = state.data;
    editor.change((current) => ({ ...current, content: mergeImport(current.content, draft, choice, options.limits) }));
    editor.markImported?.();
    toast.success('Added to your resume. Review each step to edit or remove anything.');
    goTo('personal');
  };

  const toggleItem = (key, id) => setChoice((current) => ({ ...current, [key]: current[key].includes(id) ? current[key].filter((item) => item !== id) : [...current[key], id] }));

  if (state.status !== 'ready') {
    return (
      <div>
        <StepIntro title="Import CampusX Profile" description="Bring in your name, college, branch, skills, projects, achievements, certifications and completed roadmap learning. You choose what to keep, and you can edit everything afterwards." />
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-line-strong bg-surface-muted/50 p-5">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
            <li>Only your own CampusX records are read. Messages, Anonymous Zone posts and other students’ details are never used.</li>
            <li>Nothing is added until you review it.</li>
            <li>CampusX doesn’t store your phone, links, degree name, dates or CGPA, so you’ll add those yourself.</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button leftIcon={CloudDownload} onClick={load} loading={state.status === 'loading'}>
              Import CampusX Profile
            </Button>
            <Button variant="ghost" onClick={() => goTo('personal')}>
              Start from scratch
            </Button>
          </div>
          {state.status === 'loading' && <Loader label="Reading your CampusX profile" />}
          {state.status === 'error' && (
            <Alert variant="danger" title="Couldn’t import your profile">
              {state.error}
            </Alert>
          )}
        </div>
      </div>
    );
  }

  const { draft, found, skipped, missing, limits } = state.data;

  return (
    <div data-testid="import-review">
      <StepIntro title="Review your CampusX information" description="Tick what to add to this resume. Personal details only fill fields that are still empty." />
      <div className="flex flex-col gap-5">
        <section className="rounded-2xl border border-line p-2">
          <Toggle choice={choice} setChoice={setChoice} name="personal" label="Name and email" detail={[draft.personal.fullName, draft.personal.email].filter(Boolean).join(' · ')} />
          <Toggle choice={choice} setChoice={setChoice} name="education" label="College and branch" detail={draft.education[0] ? [draft.education[0].institution, draft.education[0].field].filter(Boolean).join(' · ') : 'Not set on your profile'} disabled={!draft.education.length} />
          <Toggle choice={choice} setChoice={setChoice} name="skills" label={`Skills (${found.skills})`} detail={draft.skills.map((group) => `${group.label}: ${group.items.join(', ')}`).join(' · ') || 'No skills on your profile yet'} disabled={!draft.skills.length} />
          <Toggle choice={choice} setChoice={setChoice} name="summary" label="Bio as summary" detail={draft.summary || 'Your profile has no bio'} disabled={!draft.summary} />
          <Toggle choice={choice} setChoice={setChoice} name="coursework" label={`Completed roadmap learning (${found.coursework})`} detail={draft.coursework.join(', ') || 'No completed learning milestones yet'} disabled={!draft.coursework.length} />
        </section>

        {LISTS.map(({ key, title, describe }) =>
          draft[key].length ? (
            <section key={key} className="rounded-2xl border border-line p-2" aria-label={title}>
              <div className="flex items-center justify-between px-3 pt-1.5 pb-1">
                <h3 className="text-sm font-bold text-ink">{title}</h3>
                <Badge variant="neutral">
                  {choice[key].length} of up to {limits[key]}
                </Badge>
              </div>
              {draft[key].map((item) => {
                const taken = content[key].some((entry) => entry.source && entry.source === item.source);
                const full = !choice[key].includes(item.id) && choice[key].length + content[key].length >= limits[key];
                return (
                  <label key={item.id} className={cn('flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-muted', (taken || full) && 'cursor-not-allowed opacity-50')}>
                    <input type="checkbox" className="mt-0.5 size-4 accent-[var(--cx-primary)]" checked={choice[key].includes(item.id)} disabled={taken || full} onChange={() => toggleItem(key, item.id)} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{item.name || item.role || item.title}</span>
                      <span className="block text-xs text-ink-muted">{taken ? 'Already in this resume' : describe(item) || (key === 'projects' && dateRange(item.startDate, item.endDate))}</span>
                    </span>
                  </label>
                );
              })}
            </section>
          ) : null,
        )}

        {!found.projects && !found.achievements && !found.certifications && !found.internships && (
          <Alert variant="info" title="No projects or achievements on CampusX yet">
            Add them on CampusX to reuse them here, or type them straight into this resume.
          </Alert>
        )}
        {skipped.map((item) => (
          <Alert key={item.kind} variant="info" title={`${item.count} ${item.kind} not offered`}>
            {item.reason} You can still type them in yourself if they are accurate.
          </Alert>
        ))}
        <div className="flex gap-3 rounded-2xl bg-surface-muted px-4 py-3 text-sm text-ink-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-semibold text-ink">You’ll add these yourself: </span>
            {missing.join(', ')}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={apply}>Add selected to my resume</Button>
          <Button variant="ghost" onClick={() => setState({ status: 'idle', data: null, error: null })}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
