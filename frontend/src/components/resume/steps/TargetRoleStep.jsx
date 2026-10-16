import { Check } from 'lucide-react';
import { Input } from '@/components/ui';
import { cn } from '@/utils/cn';
import { StepIntro } from '../ResumeFields';

/** Step 1: the role the resume targets, and its name. */
export function TargetRoleStep({ editor, options }) {
  const { draft, setField, change, fieldErrors } = editor;
  const nameError = fieldErrors.find((item) => item.field === 'name')?.message;
  return (
    <div>
      <StepIntro title="Choose your target role" description="The role shapes the suggestions you get. You can change it, the name and the template at any time." />
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-ink">Target role</legend>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {options.targetRoles.map((role) => {
            const selected = draft.targetRole === role.id;
            return (
              <label
                key={role.id}
                className={cn(
                  'relative flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus',
                  selected ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-line bg-surface text-ink hover:border-line-strong',
                )}
              >
                <input type="radio" name="target-role" value={role.id} checked={selected} onChange={() => change((current) => ({ ...current, targetRole: role.id, customRole: role.id === 'custom' ? current.customRole : '' }))} className="sr-only" />
                <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border', selected ? 'border-primary bg-primary text-primary-fg' : 'border-line-strong')} aria-hidden="true">
                  {selected && <Check className="size-3" />}
                </span>
                {role.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      {draft.targetRole === 'custom' && (
        <Input
          containerClassName="mt-4"
          label="Your role"
          placeholder="e.g. Embedded Systems Intern"
          value={draft.customRole}
          maxLength={options.limits.customRole.max}
          onChange={(event) => setField('customRole', event.target.value)}
        />
      )}
      <Input
        containerClassName="mt-6"
        label="Resume name"
        hint="Only you see this name. Keep a separate resume for each kind of application."
        required
        value={draft.name}
        maxLength={options.limits.name.max}
        error={nameError ?? (!draft.name.trim() ? 'Give your resume a name.' : undefined)}
        onChange={(event) => setField('name', event.target.value)}
      />
    </div>
  );
}
