import { Ban, ShieldCheck } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { useFollowStore } from '@/store/followStore';

/**
 * Confirms blocking or unblocking a student (profile ⋮ menu, chat menu). Blocking is about follows and direct
 * messages: it says exactly that, and that the other student isn't told.
 */
export function BlockDialog({ open, onClose, userId, name, onChanged }) {
  const blockedByYou = useFollowStore((state) => Boolean(state.relations[userId]?.blockedByYou));
  const pending = useFollowStore((state) => Boolean(state.pending[userId]));
  const setBlocked = useFollowStore((state) => state.setBlocked);

  const confirm = async () => {
    const ok = await setBlocked(userId, !blockedByYou, { name });
    if (ok) {
      onChanged?.(!blockedByYou);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={blockedByYou ? `Unblock ${name}?` : `Block ${name}?`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant={blockedByYou ? 'primary' : 'danger'} leftIcon={blockedByYou ? ShieldCheck : Ban} loading={pending} onClick={confirm}>
            {blockedByYou ? 'Unblock' : 'Block'}
          </Button>
        </>
      }
    >
      {blockedByYou ? (
        <p className="text-sm leading-relaxed text-ink-muted">
          {name} will be able to follow you and message you again. You won’t start following each other again automatically.
        </p>
      ) : (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-muted">
          <li>{name} won’t be able to follow you or send you messages, and you can’t message them either.</li>
          <li>If you follow each other, those follows end.</li>
          <li>They aren’t told. Your earlier messages stay in the conversation.</li>
          <li>Their public posts can still appear around CampusX. To flag something harmful, use Report.</li>
        </ul>
      )}
    </Modal>
  );
}
