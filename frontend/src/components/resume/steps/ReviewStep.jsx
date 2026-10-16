import { useState } from 'react';
import { CircleAlert, CircleCheck, CircleX, Download, Info, ListChecks, Printer, Sparkles } from 'lucide-react';
import { Alert, Badge, Button, Loader, Textarea } from '@/components/ui';
import { resumeApi } from '@/services/resumeApi';
import { cn } from '@/utils/cn';
import { StepIntro, SubSection } from '../ResumeFields';

const STATUS = {
  fail: { icon: CircleX, className: 'text-danger-fg', label: 'Important' },
  warn: { icon: CircleAlert, className: 'text-accent-fg', label: 'Worth fixing' },
  pass: { icon: CircleCheck, className: 'text-primary', label: 'Good' },
  info: { icon: Info, className: 'text-ink-subtle', label: 'Tip' },
};
const CATEGORY_TITLES = { contact: 'Contact details & links', education: 'Education', projects: 'Projects & experience', skills: 'Skills', summary: 'Summary', dates: 'Dates', wording: 'Wording', formatting: 'Formatting', keywords: 'Job description keywords' };
const ORDER = { fail: 0, warn: 1, info: 2, pass: 3 };

/**
 * Step 10: the resume checker (rules with reasons; optional job description for keywords), the optional AI
 * review, and the download and print buttons.
 */
export function ReviewStep({ editor, options, resumeId, layout, goTo, onDownload, downloading, onPrint }) {
  const [jobDescription, setJobDescription] = useState('');
  const [check, setCheck] = useState({ status: 'idle', report: null, error: null });
  const [aiReview, setAiReview] = useState({ status: 'idle', result: null, error: null, task: null });

  const runCheck = async () => {
    setCheck({ status: 'loading', report: check.report, error: null });
    try {
      if (!(await editor.save())) throw new Error('Save your latest changes first (see the message at the top).');
      const report = await resumeApi.analyze(resumeId, { jobDescription: jobDescription.trim() || undefined, pageCount: layout?.pageCount });
      setCheck({ status: 'ready', report, error: null });
    } catch (error) {
      setCheck({ status: 'error', report: null, error: error.message });
    }
  };

  const runAi = async (task) => {
    setAiReview({ status: 'loading', result: null, error: null, task });
    try {
      await editor.save();
      const result = await resumeApi.assist(resumeId, { task, ...(task === 'keywords' && { jobDescription }) });
      setAiReview({ status: 'ready', result, error: null, task });
    } catch (error) {
      setAiReview({ status: 'error', result: null, error: error.message, task });
    }
  };

  const report = check.report;
  const grouped = [];
  for (const item of report?.checks ?? []) {
    const group = grouped.find(([category]) => category === item.category);
    if (group) group[1].push(item);
    else grouped.push([item.category, [item]]);
  }

  return (
    <div className="flex flex-col gap-8">
      <StepIntro title="Review & download" description="Run the resume check, fix what matters, then download your PDF.">
        <Button leftIcon={Download} onClick={onDownload} loading={downloading} data-testid="review-download">
          Download PDF
        </Button>
        <Button variant="outline" leftIcon={Printer} onClick={onPrint}>
          Print
        </Button>
      </StepIntro>

      <SubSection id="checker" title="Resume check" description="Clear rules with a reason for each result. It can’t promise how any applicant tracking system reads your resume, or guarantee an interview.">
        <Textarea
          label="Job description (optional)"
          rows={4}
          value={jobDescription}
          maxLength={options.limits.jobDescription.max}
          onChange={(event) => setJobDescription(event.target.value)}
          placeholder="Paste the requirements from a job or internship posting to see which skills it mentions that your resume doesn’t."
        />
        <div className="flex flex-wrap gap-2">
          <Button leftIcon={ListChecks} onClick={runCheck} loading={check.status === 'loading'} data-testid="run-check">
            Check my resume
          </Button>
        </div>
        {check.status === 'error' && <Alert variant="danger" title="Couldn’t check your resume">{check.error}</Alert>}
        {report && (
          <div className="flex flex-col gap-5" data-testid="check-report">
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface-muted/60 p-4">
              <div className="relative grid size-20 place-items-center" role="img" aria-label={`Readiness ${report.score} out of 100`}>
                <svg viewBox="0 0 36 36" className="size-20 -rotate-90" aria-hidden="true">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3.5" className="text-line" />
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3.5" strokeDasharray={`${(report.score / 100) * 97.4} 97.4`} strokeLinecap="round" className="text-primary" />
                </svg>
                <span className="absolute font-display text-xl font-bold text-ink">{report.score}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-bold text-ink">{report.label}</p>
                <p className="text-sm text-ink-muted">
                  {report.counts.fail} important · {report.counts.warn} worth fixing · {report.counts.pass} good · {report.counts.info} tips
                </p>
              </div>
            </div>
            {report.keywords && report.keywords.found > 0 && (
              <div className="rounded-2xl border border-line p-4" data-testid="keyword-report">
                <p className="text-sm font-semibold text-ink">
                  Skills from the posting: {report.keywords.matched.length} of {report.keywords.found} on your resume
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {report.keywords.matched.map((term) => <Badge key={term} variant="primary" icon={CircleCheck}>{term}</Badge>)}
                  {report.keywords.missing.map((term) => <Badge key={term} variant="outline">{term}</Badge>)}
                </div>
                {report.keywords.missing.length > 0 && <p className="mt-3 text-xs text-ink-muted">Outlined skills aren’t on your resume. Add one only if you genuinely have it, where it is true.</p>}
              </div>
            )}
            {grouped.map(([category, items]) => (
              <div key={category}>
                <h3 className="mb-2 text-sm font-bold text-ink">{CATEGORY_TITLES[category] ?? category}</h3>
                <ul className="flex flex-col gap-2">
                  {[...items].sort((a, b) => ORDER[a.status] - ORDER[b.status]).map((item) => {
                    const { icon: Icon, className, label } = STATUS[item.status];
                    return (
                      <li key={item.id} className="flex gap-3 rounded-xl border border-line bg-surface px-3 py-2.5" data-status={item.status}>
                        <Icon className={cn('mt-0.5 size-4 shrink-0', className)} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-ink">
                            <span className="sr-only">{label}: </span>
                            {item.title}
                          </p>
                          {item.detail && <p className="mt-0.5 text-sm text-ink-muted">{item.detail}</p>}
                        </div>
                        {item.target && item.status !== 'pass' && (
                          <Button variant="ghost" size="sm" onClick={() => goTo(item.target.step, item.target.itemId)}>
                            Fix
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <p className="text-xs text-ink-subtle">{report.disclaimer}</p>
          </div>
        )}
      </SubSection>

      <SubSection id="ai-review" title="AI review (optional)" description="Suggestions only, based on what your resume already says. The assistant never adds facts for you.">
        {!options.ai?.available ? (
          <p id="resume-ai-unavailable" className="text-sm text-ink-muted">The AI assistant isn’t set up on this CampusX server. The resume check above works without it.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" leftIcon={Sparkles} onClick={() => runAi('review')} loading={aiReview.status === 'loading' && aiReview.task === 'review'}>
                Review my resume with AI
              </Button>
              <Button variant="secondary" leftIcon={Sparkles} onClick={() => runAi('keywords')} disabled={!jobDescription.trim()} loading={aiReview.status === 'loading' && aiReview.task === 'keywords'}>
                Suggest keywords for this job
              </Button>
            </div>
            {aiReview.status === 'loading' && <Loader label="The assistant is reading your resume" />}
            {aiReview.status === 'error' && <Alert variant="danger" title="No suggestions this time">{aiReview.error}</Alert>}
            {aiReview.status === 'ready' && <AiResult result={aiReview.result} />}
          </>
        )}
      </SubSection>
    </div>
  );
}

function AiResult({ result }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line p-4" data-testid="ai-review-result">
      {result.warnings?.length > 0 && (
        <Alert variant="info" title="Check before acting">
          {result.warnings.join(' ')}
        </Alert>
      )}
      {result.task === 'review' && (
        <ul className="flex flex-col gap-2">
          {result.suggestions.map((item, index) => (
            // Suggestions have no ids; their order is fixed once shown.
            <li key={index} className="text-sm">
              <span className="font-semibold text-ink">{item.section}: </span>
              <span className="text-ink-muted">{item.issue}</span> <span className="text-ink">{item.suggestion}</span>
            </li>
          ))}
        </ul>
      )}
      {result.task === 'keywords' && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {result.keywords.map((item) => (
              <Badge key={item.term} variant={item.inResume ? 'primary' : 'outline'} title={item.evidence || undefined}>
                {item.term}
              </Badge>
            ))}
          </div>
          {result.suggestions.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-ink-muted">
              {result.suggestions.map((text) => <li key={text}>{text}</li>)}
            </ul>
          )}
        </>
      )}
      <p className="text-xs text-ink-subtle">AI suggestions can be wrong. Only add what is true.</p>
    </div>
  );
}
