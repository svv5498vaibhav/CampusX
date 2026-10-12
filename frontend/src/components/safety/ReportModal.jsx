import { useEffect, useId, useState } from 'react';
import { Flag } from 'lucide-react';
import { Link } from 'react-router';
import { Alert, Button, Modal, Textarea } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useReportStore } from '@/store/reportStore';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';

const FALLBACK_LABELS = { post: 'post', comment: 'comment', project: 'project', community: 'community', opportunity: 'opportunity', achievement: 'achievement', user: 'student', anonymousPost: 'anonymous post', anonymousComment: 'anonymous comment' };

/**
 * The one report form for everything on CampusX: posts, comments, projects, communities, opportunities,
 * achievements, students and Anonymous Zone posts/comments. `target` is { type, id }. Reasons come from
 * the API and fit the kind of content. The report is private: the server never tells anyone who sent it.
 */
export function ReportModal({ target, open, onClose }) {
  const options = useReportStore((state) => state.options);
  const { loadOptions, submitReport } = useReportStore.getState();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const legendId = useId();
  const formId = useId();
  const noun = options?.targets?.[target?.type]?.label ?? FALLBACK_LABELS[target?.type] ?? 'item';
  const reasonIds = options?.targets?.[target?.type]?.reasons ?? [];
  const reasons = reasonIds.map((id) => options.reasons.find((item) => item.id === id)).filter(Boolean);
  const maxLength = options?.rules.descriptionMax ?? 500;

  useEffect(() => {
    if (!open) return;
    loadOptions();
    setReason('');
    setDescription('');
    setError('');
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    if (sending || !target) return;
    if (!reason) {
      setError('Please choose a reason for your report.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await submitReport({ targetType: target.type, targetId: target.id, reason, description: description.trim() });
      toast.success('Thanks. Your report has been submitted.');
      onClose();
    } catch (requestError) {
      // Already reported: say so kindly and close.
      if (requestError.status === 409) {
        toast.info(requestError.message);
        onClose();
      } else {
        setError(requestError.message);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={sending ? () => {} : onClose}
      title={`Report this ${noun}`}
      description="Reports are private. The CampusX team reviews every one, and nobody is told who reported them."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button type="submit" form={formId} variant="danger" leftIcon={Flag} loading={sending}>Submit Report</Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <Alert variant="danger">{error}</Alert>}
        <fieldset aria-labelledby={legendId} aria-busy={!options || undefined}>
          <legend id={legendId} className="mb-2 text-sm font-semibold text-ink">Why are you reporting this?</legend>
          {!options && <p className="text-sm text-ink-muted" role="status">Loading reasons…</p>}
          <div className="flex flex-col gap-2">
            {reasons.map((option) => (
              <label
                key={option.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus',
                  reason === option.id ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-line text-ink hover:border-line-strong',
                )}
              >
                <input type="radio" name={`${formId}-reason`} value={option.id} checked={reason === option.id} onChange={() => setReason(option.id)} className="size-4 accent-[var(--cx-primary)]" />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Textarea
          label="Anything else we should know?"
          hint={`Optional · ${description.length}/${maxLength}`}
          rows={3}
          maxLength={maxLength}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <p className="text-xs text-ink-subtle">
          In danger right now? Contact your college or local emergency services first.{' '}
          <Link to={ROUTES.SAFETY} className="font-semibold text-primary hover:underline" onClick={onClose}>Community guidelines</Link>
        </p>
      </form>
    </Modal>
  );
}
