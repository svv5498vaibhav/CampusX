import { useRef, useState } from 'react';
import { FileText, ImageOff, Trash2, Upload } from 'lucide-react';
import { Alert, Button, Modal } from '@/components/ui';
import { useAchievementStore } from '@/store/achievementStore';
import { toast } from '@/store/toastStore';

const TYPE_LABELS = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP', 'application/pdf': 'PDF' };

/**
 * Certificates and other proof. Everyone who can see the achievement can open them; the owner can add
 * (which submits it for review) or remove files. The server checks each file by its contents.
 */
export function AchievementProof({ achievement }) {
  const options = useAchievementStore((state) => state.options);
  const { addProof, removeProof } = useAchievementStore.getState();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState({});
  const input = useRef(null);
  const rules = options?.media.proof;
  const max = options?.rules.proof.max ?? 5;
  const proof = achievement.proof ?? [];

  const upload = async (fileList) => {
    const files = [...fileList];
    if (!files.length || !rules) return;
    const bad = files.find((file) => !rules.mimeTypes.includes(file.type));
    if (bad) return setError('Proof must be a JPG, PNG or WEBP image, or a PDF.');
    if (files.some((file) => file.size > rules.maxBytes)) return setError(`Proof files can be up to ${rules.maxMegabytes} MB.`);
    if (proof.length + files.length > max) return setError(`An achievement can have up to ${max} proof files.`);
    setError('');
    setUploading(true);
    setProgress(0);
    try {
      await addProof(achievement.id, files, setProgress);
      toast.success('Proof submitted for review.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setUploading(false);
    }
    return undefined;
  };

  const confirmRemove = async () => {
    setBusy(true);
    try {
      await removeProof(achievement.id, removing.id);
      toast.success('Proof removed.');
      setRemoving(null);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Proof" className="flex flex-col gap-3">
      {proof.length === 0 && <p className="text-sm text-ink-muted">{achievement.isOwner ? 'No proof yet. Add a certificate, result screenshot or photo to send this for review.' : 'No proof added.'}</p>}
      {proof.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {proof.map((item, index) => (
            <li key={item.id} className="relative overflow-hidden rounded-2xl border border-line bg-surface-muted">
              {item.kind === 'pdf' ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 text-sm font-semibold text-primary hover:bg-primary-soft">
                  <FileText className="size-6 shrink-0" aria-hidden="true" /> Certificate PDF {index + 1} <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : failed[item.id] ? (
                <div className="grid aspect-video place-items-center text-xs text-ink-subtle"><span className="inline-flex items-center gap-1"><ImageOff className="size-4" aria-hidden="true" /> Image unavailable</span></div>
              ) : (
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  <img src={item.url} alt={`Proof ${index + 1} for ${achievement.title}`} loading="lazy" onError={() => setFailed((value) => ({ ...value, [item.id]: true }))} className="aspect-video w-full object-cover" />
                </a>
              )}
              {achievement.isOwner && (
                <button type="button" onClick={() => setRemoving(item)} aria-label={`Remove proof ${index + 1}`} className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {achievement.isOwner && rules && (
        <div>
          <Button variant="secondary" leftIcon={Upload} loading={uploading} onClick={() => input.current?.click()} disabled={proof.length >= max}>
            {uploading ? `Uploading… ${progress}%` : 'Add proof'}
          </Button>
          <input ref={input} type="file" accept={rules.mimeTypes.join(',')} multiple hidden onChange={(event) => { upload(event.target.files); event.target.value = ''; }} />
          <p className="mt-1.5 text-xs text-ink-subtle">{rules.mimeTypes.map((type) => TYPE_LABELS[type] ?? type).join(', ')} · up to {rules.maxMegabytes} MB each · {max} files at most. New proof is sent to CampusX moderators for review.</p>
          {error && <Alert variant="danger" className="mt-2">{error}</Alert>}
        </div>
      )}

      <Modal
        open={Boolean(removing)}
        onClose={busy ? () => {} : () => setRemoving(null)}
        title="Remove this proof?"
        description={achievement.verificationStatus === 'verified' ? 'Changing the proof of a verified achievement sends it back for review.' : 'The file will be deleted.'}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRemoving(null)} disabled={busy}>Cancel</Button>
            <Button variant="danger" leftIcon={Trash2} loading={busy} onClick={confirmRemove}>Remove</Button>
          </>
        }
      />
    </section>
  );
}
