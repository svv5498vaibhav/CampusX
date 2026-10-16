import { Check } from 'lucide-react';
import { Textarea } from '@/components/ui';
import { cn } from '@/utils/cn';
import { AiAssistButton, AiUnavailableNote } from '../AiAssist';
import { StepIntro } from '../ResumeFields';

const countWords = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/** Step 8: a professional summary or a career objective (the AI assistant can improve or draft it). */
export function SummaryStep({ editor, options, resumeId }) {
  const { draft, setContent, change, save } = editor;
  const summary = draft.content.summary;
  const title = draft.sections.titles.summary || options.summaryTitles[0];
  const words = countWords(summary);
  const setTitle = (value) => change((current) => {
    const titles = { ...current.sections.titles };
    if (value === options.summaryTitles[0]) delete titles.summary;
    else titles.summary = value;
    return { ...current, sections: { ...current.sections, titles } };
  });

  return (
    <div className="flex flex-col gap-5">
      <StepIntro title="Summary or career objective" description="Two or three lines: what you study or do, what you build, and the role you want. A career objective suits internship and fresher applications." />
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Show it as</legend>
        <div className="flex flex-wrap gap-2">
          {options.summaryTitles.map((option) => (
            <label key={option} className={cn('inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus', title === option ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-line text-ink hover:border-line-strong')}>
              <input type="radio" name="summary-title" className="sr-only" checked={title === option} onChange={() => setTitle(option)} />
              {title === option && <Check className="size-4" aria-hidden="true" />}
              {option}
            </label>
          ))}
        </div>
      </fieldset>
      <Textarea
        label={title}
        rows={6}
        value={summary}
        maxLength={options.limits.summary.max}
        onChange={(event) => setContent((content) => ({ ...content, summary: event.target.value.replace(/\n/g, ' ') }))}
        placeholder="e.g. Final-year Computer Science student who builds full-stack web apps with React and Node.js, looking for a software developer internship."
        hint={`${words} ${words === 1 ? 'word' : 'words'} · aim for 30 to 70`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <AiAssistButton
          ai={options.ai}
          resumeId={resumeId}
          title={summary.trim() ? `Improve your ${title.toLowerCase()}` : `Draft a ${title.toLowerCase()} from your resume`}
          label={summary.trim() ? 'Improve with AI' : 'Write with AI from my resume'}
          beforeRequest={save}
          request={() => ({ task: 'summary', text: summary, summaryTitle: title })}
          onAccept={(text) => setContent((content) => ({ ...content, summary: text }))}
        />
        <AiAssistButton
          ai={options.ai}
          resumeId={resumeId}
          title="Grammar and wording"
          label="Fix grammar"
          disabled={!summary.trim()}
          beforeRequest={save}
          request={() => ({ task: 'grammar', text: summary })}
          onAccept={(text) => setContent((content) => ({ ...content, summary: text }))}
        />
      </div>
      <AiUnavailableNote ai={options.ai} />
    </div>
  );
}
