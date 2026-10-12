import { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * Short names as removable chips (tech stack, skills). Enter or comma adds one; known spellings from
 * `suggestions` are used ("react" → "React") and duplicates are ignored. The server checks again.
 */
export function ChipInput({ label, values, onChange, max, maxLength = 30, suggestions = [], placeholder, error, hint }) {
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const inputId = useId();
  const listId = useId();
  const messageId = useId();
  const canonical = new Map(suggestions.map((item) => [item.toLowerCase(), item]));

  const add = () => {
    const raw = draft.replace(/\s+/g, ' ').trim();
    if (!raw) return;
    const value = canonical.get(raw.toLowerCase()) ?? raw;
    if (value.length > maxLength) return setMessage(`Each entry can be up to ${maxLength} characters.`);
    if (values.some((item) => item.toLowerCase() === value.toLowerCase())) return setMessage('Already added.');
    if (values.length >= max) return setMessage(`You can add up to ${max}.`);
    onChange([...values, value]);
    setDraft('');
    setMessage('');
    return undefined;
  };

  const shown = message || error;
  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-ink">
        {label} <span className="font-normal text-ink-subtle">({values.length}/{max})</span>
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          list={suggestions.length ? listId : undefined}
          value={draft}
          placeholder={placeholder}
          maxLength={maxLength + 1}
          aria-invalid={shown ? true : undefined}
          aria-describedby={shown ? messageId : undefined}
          onChange={(event) => setDraft(event.target.value.replace(/,/g, ''))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add();
            }
          }}
          className="h-11 w-full min-w-0 rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:ring-4 focus:ring-focus focus:outline-none"
        />
        <Button variant="secondary" size="icon" className="size-11" onClick={add} disabled={!draft.trim()} aria-label={`Add ${label.toLowerCase()}`}>
          <Plus className="size-4" aria-hidden="true" />
        </Button>
        {suggestions.length > 0 && (
          <datalist id={listId}>
            {suggestions.map((item) => <option key={item} value={item} />)}
          </datalist>
        )}
      </div>
      {shown ? (
        <p id={messageId} role="alert" className="mt-1.5 text-xs font-medium text-danger-fg">{shown}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-ink-subtle">{hint}</p>
      )}
      {values.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label={`Added ${label.toLowerCase()}`}>
          {values.map((item) => (
            <li key={item} className="inline-flex items-center gap-1 rounded-lg bg-primary-soft py-1 pr-1 pl-2.5 text-xs font-semibold text-primary-soft-fg">
              {item}
              <button type="button" onClick={() => onChange(values.filter((value) => value !== item))} className="grid size-5 place-items-center rounded-md hover:bg-primary/15" aria-label={`Remove ${item}`}>
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
