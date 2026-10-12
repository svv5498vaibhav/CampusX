import { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/utils/cn';

const inputClass =
  'h-11 w-full min-w-0 rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:ring-4 focus:ring-focus focus:outline-none';

/** Tags as removable chips; Enter or comma adds one. Mirrors the server's rules for quick feedback. */
export function TagInput({ tags, onChange, max = 8, maxLength = 30, error }) {
  const [draft, setDraft] = useState('');
  const [hint, setHint] = useState('');
  const inputId = useId();
  const errorId = useId();

  const add = () => {
    const tag = draft.replace(/\s+/g, ' ').trim().toLowerCase().replace(/^#/, '');
    if (!tag) return;
    if (tag.length > maxLength) return setHint(`Tags can be up to ${maxLength} characters.`);
    if (tags.includes(tag)) return setHint('You already added that tag.');
    if (tags.length >= max) return setHint(`You can add up to ${max} tags.`);
    onChange([...tags, tag]);
    setDraft('');
    setHint('');
    return undefined;
  };

  const message = hint || error;
  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-ink">
        Tags <span className="font-normal text-ink-subtle">({tags.length}/{max})</span>
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          value={draft}
          maxLength={maxLength + 1}
          placeholder="e.g. web dev, hackathons"
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? errorId : undefined}
          onChange={(event) => setDraft(event.target.value.replace(/,/g, ''))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add();
            }
          }}
          className={inputClass}
        />
        <Button variant="secondary" size="icon" className="size-11" onClick={add} aria-label="Add tag" disabled={!draft.trim()}>
          <Plus className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {message && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-danger-fg">
          {message}
        </p>
      )}
      {tags.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Added tags">
          {tags.map((tag) => (
            <li key={tag} className="inline-flex items-center gap-1 rounded-lg bg-primary-soft py-1 pr-1 pl-2.5 text-xs font-semibold text-primary-soft-fg">
              #{tag}
              <button type="button" onClick={() => onChange(tags.filter((item) => item !== tag))} className="grid size-5 place-items-center rounded-md hover:bg-primary/15" aria-label={`Remove tag ${tag}`}>
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Up to `max` short community rules, added one at a time. */
export function RulesInput({ rules, onChange, max = 10, maxLength = 150, error }) {
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const full = rules.length >= max;

  const add = () => {
    const rule = draft.replace(/\s+/g, ' ').trim();
    if (!rule || full) return;
    onChange([...rules, rule.slice(0, maxLength)]);
    setDraft('');
  };

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-ink">
        Community rules <span className="font-normal text-ink-subtle">(optional, {rules.length}/{max})</span>
      </label>
      {rules.length > 0 && (
        <ol className="mb-2.5 flex flex-col gap-1.5">
          {rules.map((rule, index) => (
            <li key={`${index}-${rule}`} className="flex items-start gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm text-ink">
              <span className="font-bold text-primary">{index + 1}.</span>
              <span className="min-w-0 flex-1 break-words">{rule}</span>
              <button type="button" onClick={() => onChange(rules.filter((_, i) => i !== index))} className="grid size-6 shrink-0 place-items-center rounded-md text-ink-subtle hover:bg-surface hover:text-danger-fg" aria-label={`Remove rule ${index + 1}`}>
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2">
        <input
          id={inputId}
          value={draft}
          maxLength={maxLength}
          disabled={full}
          placeholder={full ? `That's ${max} rules: the maximum` : 'e.g. Respect everyone'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          className={cn(inputClass, full && 'opacity-60')}
        />
        <Button variant="secondary" size="icon" className="size-11" onClick={add} aria-label="Add rule" disabled={!draft.trim() || full}>
          <Plus className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}
