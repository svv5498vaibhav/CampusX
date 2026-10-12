import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CircleCheck, ImageUp, Trash2 } from 'lucide-react';
import { Alert, Avatar, Button, Modal } from '@/components/ui';
import { cn } from '@/utils/cn';

const COPY = {
  avatar: { title: 'Profile photo', noun: 'photo', removeLabel: 'Remove photo', hint: 'A clear photo of your face works best.' },
  cover: { title: 'Cover image', noun: 'cover image', removeLabel: 'Remove cover', hint: 'Wide images look best, around 1600 × 480.' },
  communityIcon: { title: 'Community icon', noun: 'icon', removeLabel: 'Remove icon', hint: 'A square logo or picture works best.' },
  communityCover: { title: 'Community cover', noun: 'cover', removeLabel: 'Remove cover', hint: 'Wide images look best, around 1600 × 480.' },
};

// Square previews; everything else is previewed as a wide banner.
const SQUARE_KINDS = { avatar: 'circle', communityIcon: 'squircle' };

const TYPE_LABELS = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP' };

/**
 * Choose → preview → upload (with progress) → done, plus remove-with-confirmation.
 * Files are checked here for quick feedback; the API checks them again (by content, not name).
 *   onUpload(file, onProgress) and onRemove() return promises that reject with a friendly message.
 */
export function ImageUploadDialog({ open, onClose, kind, currentUrl, name, rules, onUpload, onRemove }) {
  const copy = COPY[kind];
  const inputId = useId();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle' | 'uploading' | 'removing' | 'done'
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isBusy = status === 'uploading' || status === 'removing';
  const typeList = rules.mimeTypes.map((type) => TYPE_LABELS[type] ?? type).join(', ');

  // Start fresh every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setPreviewUrl(null);
    setStatus('idle');
    setProgress(0);
    setError('');
    setConfirmingRemove(false);
  }, [open]);

  // Free the preview's memory when it changes or the dialog closes.
  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  // Brief success state, then close.
  useEffect(() => {
    if (status !== 'done') return undefined;
    const timer = setTimeout(onClose, 900);
    return () => clearTimeout(timer);
  }, [status, onClose]);

  const choose = (candidate) => {
    setError('');
    setConfirmingRemove(false);
    if (!candidate) return;
    if (!rules.mimeTypes.includes(candidate.type)) {
      setError(`Only ${typeList.replace(/, (?=[^,]*$)/, ', and ')} images are supported.`);
      return;
    }
    if (candidate.size > rules.maxBytes) {
      setError(`Please choose an image smaller than ${rules.maxMegabytes} MB.`);
      return;
    }
    setFile(candidate);
    setPreviewUrl(URL.createObjectURL(candidate));
  };

  const upload = async () => {
    setStatus('uploading');
    setProgress(0);
    setError('');
    try {
      await onUpload(file, setProgress);
      setStatus('done');
    } catch (uploadError) {
      setError(uploadError.message || `${copy.title} upload failed. Please try again.`);
      setStatus('idle');
    }
  };

  const remove = async () => {
    setStatus('removing');
    setError('');
    try {
      await onRemove();
      setStatus('done');
    } catch (removeError) {
      setError(removeError.message || `We couldn't remove your ${copy.noun}. Please try again.`);
      setStatus('idle');
      setConfirmingRemove(false);
    }
  };

  const shownUrl = previewUrl ?? currentUrl;

  return (
    <Modal
      open={open}
      onClose={isBusy ? () => {} : onClose}
      closeOnOverlayClick={!isBusy}
      title={copy.title}
      description={copy.hint}
      footer={
        status === 'done' ? null : (
          <>
            {currentUrl && !file && !confirmingRemove && (
              <Button variant="ghost" leftIcon={Trash2} onClick={() => setConfirmingRemove(true)} disabled={isBusy} className="sm:mr-auto">
                {copy.removeLabel}
              </Button>
            )}
            <Button variant="outline" onClick={file ? () => { setFile(null); setPreviewUrl(null); setError(''); } : onClose} disabled={isBusy}>
              {file ? 'Choose another' : 'Cancel'}
            </Button>
            {file && (
              <Button leftIcon={ImageUp} onClick={upload} loading={status === 'uploading'}>
                {status === 'uploading' ? `Uploading… ${progress}%` : `Save ${copy.noun}`}
              </Button>
            )}
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {/* Preview */}
        <div className="flex justify-center">
          {SQUARE_KINDS[kind] ? (
            <motion.div key={shownUrl ?? 'initials'} initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <Avatar src={shownUrl} name={name} size="2xl" shape={SQUARE_KINDS[kind]} className="ring-4 ring-primary-soft" />
            </motion.div>
          ) : (
            <motion.div
              key={shownUrl ?? 'empty'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="aspect-[10/3] w-full overflow-hidden rounded-2xl bg-surface-muted campus-grid"
            >
              {shownUrl && <img src={shownUrl} alt="" className="size-full object-cover" />}
            </motion.div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {status === 'done' ? (
            <motion.p
              key="done"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              role="status"
              className="flex items-center justify-center gap-2 py-2 text-sm font-semibold text-primary"
            >
              <CircleCheck className="size-5" aria-hidden="true" />
              Saved!
            </motion.p>
          ) : confirmingRemove ? (
            <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Alert variant="danger" title={`Remove your ${copy.noun}?`}>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="danger" onClick={remove} loading={status === 'removing'}>
                    Yes, remove it
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmingRemove(false)} disabled={isBusy}>
                    Keep it
                  </Button>
                </div>
              </Alert>
            </motion.div>
          ) : status === 'uploading' ? (
            <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div
                role="progressbar"
                aria-label={`Uploading ${copy.noun}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="h-2 overflow-hidden rounded-full bg-surface-muted"
              >
                <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-center text-xs text-ink-muted" aria-live="polite">
                {progress < 100 ? `Uploading… ${progress}%` : 'Almost there…'}
              </p>
            </motion.div>
          ) : (
            <motion.label
              key="picker"
              htmlFor={inputId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                choose(event.dataTransfer.files?.[0]);
              }}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-colors',
                'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus',
                isDragging ? 'border-primary bg-primary-soft' : 'border-line-strong hover:border-primary hover:bg-surface-muted',
              )}
            >
              <ImageUp className="size-6 text-primary" aria-hidden="true" />
              <span className="text-sm font-semibold text-ink">{file ? 'Choose a different image' : 'Choose an image'}</span>
              <span className="text-xs text-ink-muted">
                or drag it here · {typeList} · up to {rules.maxMegabytes} MB
              </span>
              <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept={rules.mimeTypes.join(',')}
                aria-label={`Choose a ${copy.noun} file`}
                className="sr-only"
                onChange={(event) => {
                  choose(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </motion.label>
          )}
        </AnimatePresence>

        {error && <Alert variant="danger">{error}</Alert>}
      </div>
    </Modal>
  );
}
