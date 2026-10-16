import { useEffect, useId, useState } from 'react';
import { OctagonAlert, ShieldQuestion } from 'lucide-react';
import { Modal } from '@/components/ui';
import { cn } from '@/utils/cn';
import { AdminButton } from './AdminUi';

/**
 * The confirmation step for admin actions. Dangerous ones (remove, restrict, suspend, block, ...) can't
 * be sent without it: the API also refuses them unless the request says confirm: true. When `requireReason`
 * is set the reason is required (it goes into the audit log, never to the student).
 *
 *   onConfirm(reason) → Promise; a rejected promise shows its message here and keeps the dialog open.
 */
export function ConfirmActionModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  danger = false,
  requireReason = false,
  allowReason = true,
  reasonLabel = 'Reason (kept in the audit log)',
  minReason = 5,
  maxReason = 500,
  children,
}) {
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const trimmed = reason.trim();
  const reasonMissing = requireReason && trimmed.length < minReason;

  const submit = async (event) => {
    event.preventDefault();
    if (reasonMissing || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(trimmed);
      onClose();
    } catch (failure) {
      setError(failure?.errors?.[0]?.message ?? failure?.message ?? 'That didn’t work. Please try again.');
      setBusy(false);
    }
  };

  const Icon = danger ? OctagonAlert : ShieldQuestion;

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      size="sm"
      closeOnOverlayClick={!busy}
      footer={
        <>
          <AdminButton tone="neutral" onClick={onClose} disabled={busy}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" form={`${reasonId}-form`} tone={danger ? 'danger' : 'primary'} loading={busy} disabled={reasonMissing}>
            {confirmLabel}
          </AdminButton>
        </>
      }
    >
      <form id={`${reasonId}-form`} onSubmit={submit} className="space-y-4">
        <div className={cn('flex gap-3 rounded-xl border p-3 text-sm', danger ? 'border-ax-danger/35 bg-ax-danger/8 text-ax-danger-fg' : 'border-ax-border bg-ax-bg-2 text-ax-muted')}>
          <Icon className={cn('mt-0.5 size-4 shrink-0', danger ? 'text-ax-danger' : 'text-ax-neon')} aria-hidden="true" />
          <p>{description}</p>
        </div>
        {children}
        {(requireReason || allowReason) && (
          <div>
            <label htmlFor={reasonId} className="mb-1.5 block text-sm font-semibold text-ax-text">
              {reasonLabel}
              {!requireReason && <span className="font-normal text-ax-subtle"> · optional</span>}
            </label>
            <textarea
              id={reasonId}
              rows={3}
              value={reason}
              maxLength={maxReason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={`${reasonId}-hint`}
              className="w-full resize-y rounded-lg border border-ax-border bg-ax-bg-2 px-3 py-2 text-sm text-ax-text outline-none placeholder:text-ax-subtle focus:border-ax-violet"
              placeholder={requireReason ? 'What happened, briefly' : 'Add a note for the team'}
            />
            <p id={`${reasonId}-hint`} className="mt-1 flex justify-between text-[11px] text-ax-subtle">
              <span>{requireReason ? `At least ${minReason} characters.` : 'Visible to staff only.'}</span>
              <span className="font-mono tabular-nums">
                {reason.length}/{maxReason}
              </span>
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-ax-danger/40 bg-ax-danger/10 px-3 py-2 text-sm text-ax-danger-fg">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
