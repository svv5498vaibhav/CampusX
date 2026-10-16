import { useEffect, useRef, useState } from 'react';
import { Sparkles, TriangleAlert } from 'lucide-react';
import { Alert, Button, Loader, Modal, Textarea } from '@/components/ui';
import { resumeApi } from '@/services/resumeApi';
import { BulletEditor } from './ResumeFields';

/**
 * "Improve with AI" for one piece of text. The suggestion opens in an editable box with the assistant's
 * notes and any warnings (numbers or technologies that aren't in the student's resume); nothing changes
 * until the student chooses "Use this". When the assistant isn't set up on the server, the button is
 * disabled and says so.
 *
 * kind: 'text' (summary, grammar) | 'bullets' (rewrite a description as bullet points)
 */
export function AiAssistButton({ ai, resumeId, request, onAccept, kind = 'text', label = 'Improve with AI', title = 'AI suggestion', beforeRequest, disabled, size = 'sm' }) {
  const [open, setOpen] = useState(false);
  const available = Boolean(ai?.available);
  return (
    <>
      <Button
        variant="secondary"
        size={size}
        leftIcon={Sparkles}
        disabled={!available || disabled}
        onClick={() => setOpen(true)}
        title={available ? undefined : 'The AI assistant isn’t set up on this CampusX server.'}
        aria-describedby={available ? undefined : 'resume-ai-unavailable'}
      >
        {label}
      </Button>
      {open && <AiSuggestionDialog resumeId={resumeId} request={request} onAccept={onAccept} onClose={() => setOpen(false)} kind={kind} title={title} beforeRequest={beforeRequest} />}
    </>
  );
}

function AiSuggestionDialog({ resumeId, request, onAccept, onClose, kind, title, beforeRequest }) {
  const [state, setState] = useState({ status: 'idle', result: null, error: null });
  const [text, setText] = useState('');
  const [bullets, setBullets] = useState([]);

  const run = async () => {
    setState({ status: 'loading', result: null, error: null });
    try {
      if (beforeRequest) await beforeRequest();
      const result = await resumeApi.assist(resumeId, request());
      setText(result.suggestion ?? '');
      setBullets(result.bullets ?? []);
      setState({ status: 'ready', result, error: null });
    } catch (error) {
      setState({ status: 'error', result: null, error: error.message });
    }
  };

  // Start once, as soon as the dialog opens.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
    // run is recreated each render; the first one is the one wanted.
  }, []);

  const { result } = state;
  const accept = () => {
    onAccept(kind === 'bullets' ? bullets.map((item) => item.trim()).filter(Boolean) : text.trim());
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description="Review and edit the suggestion. Nothing changes in your resume until you choose “Use this”."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Discard
          </Button>
          <Button onClick={accept} disabled={state.status !== 'ready' || (kind === 'bullets' ? !bullets.some((item) => item.trim()) : !text.trim())}>
            Use this
          </Button>
        </>
      }
    >
      {state.status === 'loading' || state.status === 'idle' ? (
        <div className="py-10">
          <Loader centered label="The assistant is writing a suggestion" />
        </div>
      ) : state.status === 'error' ? (
        <div className="flex flex-col items-start gap-3">
          <Alert variant="danger" title="No suggestion this time">
            {state.error}
          </Alert>
          <Button variant="outline" size="sm" onClick={run}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4" data-testid="ai-suggestion">
          {result.warnings?.length > 0 && (
            <div role="alert" className="flex gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-fg">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Check before using</p>
                <ul className="mt-1 list-disc pl-4">
                  {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            </div>
          )}
          {kind === 'bullets' ? (
            <BulletEditor label="Suggested bullet points" items={bullets} onChange={setBullets} max={6} />
          ) : (
            <Textarea label="Suggested text" value={text} onChange={(event) => setText(event.target.value)} rows={6} />
          )}
          {result.notes?.length > 0 && (
            <div className="rounded-2xl bg-surface-muted px-4 py-3 text-sm text-ink-muted">
              <p className="font-semibold text-ink">What changed</p>
              <ul className="mt-1 list-disc pl-4">
                {result.notes.map((note) => <li key={note}>{note}</li>)}
              </ul>
            </div>
          )}
          <p className="text-xs text-ink-subtle">AI suggestions can be wrong. Keep only what is true and sounds like you.</p>
        </div>
      )}
    </Modal>
  );
}

/** The line shown once per step when the assistant is unavailable (the buttons point to it). */
export function AiUnavailableNote({ ai }) {
  if (ai?.available) return null;
  return (
    <p id="resume-ai-unavailable" className="text-xs text-ink-subtle">
      The AI assistant isn’t set up on this CampusX server, so “Improve with AI” is off. Everything else works as usual.
    </p>
  );
}
