import { useId, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui';
import { cn } from '@/utils/cn';
import { validateSkill } from '@/utils/onboarding';

/**
 * Optional skills: tap a suggestion or type your own. Suggestions keep their official spelling
 * ("react" becomes "React"); anything else is kept as typed.
 */
export function SkillSelector({ suggestions, skills, onChange, rules }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const selectedListId = useId();

  const canonical = (raw) => {
    const skill = raw.trim().replace(/\s+/g, ' ');
    return suggestions.find((suggestion) => suggestion.toLowerCase() === skill.toLowerCase()) ?? skill;
  };

  const add = (raw) => {
    const skill = canonical(raw);
    const message = validateSkill(skill, skills, rules);
    if (message) {
      setError(message);
      return;
    }
    onChange([...skills, skill]);
    setText('');
    setError('');
  };

  const remove = (skill) => {
    onChange(skills.filter((item) => item !== skill));
    setError('');
  };

  return (
    <div className="flex flex-col gap-6">
      <Input
        label="Add your own"
        placeholder="e.g. Tailwind CSS, Arduino, Canva"
        autoComplete="off"
        value={text}
        error={error}
        hint={`${skills.length} of ${rules.skills.max} added · optional`}
        onChange={(event) => {
          setText(event.target.value);
          if (error) setError('');
        }}
        onKeyDown={(event) => {
          // Enter adds the skill instead of moving to the next step.
          if (event.key === 'Enter') {
            event.preventDefault();
            add(text);
          }
        }}
        rightElement={
          <button
            type="button"
            onClick={() => add(text)}
            className="mr-1 inline-flex h-9 items-center gap-1 rounded-lg bg-primary-soft px-3 text-sm font-semibold text-primary-soft-fg transition-colors hover:bg-primary hover:text-primary-fg"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add
          </button>
        }
      />

      <div>
        <h2 className="text-xs font-bold tracking-[0.12em] text-ink-subtle uppercase">Your skills</h2>
        {skills.length > 0 ? (
          <ul id={selectedListId} className="mt-3 flex flex-wrap gap-2" aria-live="polite">
            {skills.map((skill) => (
              <li
                key={skill}
                className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-primary py-1 pr-1 pl-3.5 text-sm font-semibold text-primary-fg"
              >
                {skill}
                <button
                  type="button"
                  onClick={() => remove(skill)}
                  aria-label={`Remove ${skill}`}
                  className="grid size-8 place-items-center rounded-lg transition-colors hover:bg-black/15"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">Nothing added yet. That's fine: skills are optional.</p>
        )}
      </div>

      <div>
        <h2 className="text-xs font-bold tracking-[0.12em] text-ink-subtle uppercase">Popular on campus</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => {
            const isSelected = skills.includes(suggestion);
            const Icon = isSelected ? Check : Plus;
            return (
              <li key={suggestion}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => (isSelected ? remove(suggestion) : add(suggestion))}
                  className={cn(
                    'inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold transition-colors',
                    isSelected
                      ? 'border-primary bg-primary-soft text-primary-soft-fg'
                      : 'border-line-strong bg-surface text-ink hover:border-primary hover:text-primary',
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" strokeWidth={isSelected ? 3 : 2} />
                  {suggestion}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
