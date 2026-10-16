import { useState } from 'react';
import { Check } from 'lucide-react';
import { Alert, Button, Input, Modal } from '@/components/ui';
import { cn } from '@/utils/cn';

/** "Create My Resume": the target role (the template follows from it) and an optional name. */
export function CreateResumeDialog({ open, onClose, options, onCreate }) {
  const [targetRole, setTargetRole] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [name, setName] = useState('');
  const [state, setState] = useState({ saving: false, error: null });
  const role = options?.targetRoles.find((item) => item.id === targetRole);

  const submit = async (event) => {
    event.preventDefault();
    if (!role) return;
    setState({ saving: true, error: null });
    const ok = await onCreate({ targetRole, ...(targetRole === 'custom' && customRole.trim() && { customRole: customRole.trim() }), ...(name.trim() && { name: name.trim() }) }).catch((error) => {
      setState({ saving: false, error: error.message });
      return false;
    });
    if (ok) setState({ saving: false, error: null });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create My Resume"
      description="Pick the role you’re applying for. You can import your CampusX profile on the next step."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-resume-form" loading={state.saving} disabled={!role}>
            Create resume
          </Button>
        </>
      }
    >
      <form id="create-resume-form" onSubmit={submit} className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Target role</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {options?.targetRoles.map((item) => {
              const selected = targetRole === item.id;
              const template = options.templates.find((entry) => entry.id === item.template);
              return (
                <label key={item.id} className={cn('flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2.5 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus', selected ? 'border-primary bg-primary-soft' : 'border-line hover:border-line-strong')}>
                  <input type="radio" name="create-target-role" className="sr-only" checked={selected} onChange={() => setTargetRole(item.id)} />
                  <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border', selected ? 'border-primary bg-primary text-primary-fg' : 'border-line-strong')} aria-hidden="true">
                    {selected && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-sm font-semibold', selected ? 'text-primary-soft-fg' : 'text-ink')}>{item.label}</span>
                    <span className="block text-xs text-ink-muted">Starts with {template?.name}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {targetRole === 'custom' && <Input label="Your role" value={customRole} maxLength={60} placeholder="e.g. Embedded Systems Intern" onChange={(event) => setCustomRole(event.target.value)} />}
        <Input label="Resume name (optional)" value={name} maxLength={80} placeholder={role ? `${targetRole === 'custom' && customRole.trim() ? customRole.trim() : role.label} Resume` : 'e.g. Internship Resume'} onChange={(event) => setName(event.target.value)} hint="Only you see it. Keep separate resumes for different applications." />
        {state.error && <Alert variant="danger">{state.error}</Alert>}
      </form>
    </Modal>
  );
}

/** Rename a resume (and, with `title`/`confirmLabel`, name a copy). */
export function NameResumeDialog({ open, onClose, initialName, onSave, title = 'Rename resume', confirmLabel = 'Save name' }) {
  const [name, setName] = useState(initialName ?? '');
  const [state, setState] = useState({ saving: false, error: null });
  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) return setState({ saving: false, error: 'Give your resume a name.' });
    setState({ saving: true, error: null });
    try {
      await onSave(name.trim());
      onClose();
    } catch (error) {
      setState({ saving: false, error: error.message });
    }
    return undefined;
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="name-resume-form" loading={state.saving}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id="name-resume-form" onSubmit={submit}>
        <Input label="Resume name" value={name} maxLength={80} autoFocus onChange={(event) => setName(event.target.value)} error={state.error} />
      </form>
    </Modal>
  );
}

/** Delete with confirmation. */
export function DeleteResumeDialog({ open, onClose, resume, onDelete }) {
  const [state, setState] = useState({ deleting: false, error: null });
  const confirm = async () => {
    setState({ deleting: true, error: null });
    try {
      await onDelete();
      onClose();
    } catch (error) {
      setState({ deleting: false, error: error.message });
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete this resume?"
      description={`“${resume?.name}” will be deleted permanently. Your CampusX profile, projects and achievements are not affected.`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="danger" onClick={confirm} loading={state.deleting}>
            Delete resume
          </Button>
        </>
      }
    >
      {resume?.isDefault && <p className="text-sm text-ink-muted">It’s your default resume; your most recently edited resume will become the default.</p>}
      {state.error && <Alert variant="danger" className="mt-3">{state.error}</Alert>}
    </Modal>
  );
}
