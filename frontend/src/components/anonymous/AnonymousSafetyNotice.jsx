import { useCallback, useState } from 'react';
import { EyeOff, HeartHandshake, ShieldCheck } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { safetyNoticeKey } from '@/constants/anonymous';

const readSeen = (userId) => {
  try {
    return localStorage.getItem(safetyNoticeKey(userId)) === '1';
  } catch {
    return false; // Storage blocked: just show the note again.
  }
};

/** Whether this student has read the "how anonymity works" note on this device. */
export function useSafetyNotice(userId) {
  const [seen, setSeen] = useState(() => readSeen(userId));
  const acknowledge = useCallback(() => {
    try {
      localStorage.setItem(safetyNoticeKey(userId), '1');
    } catch {
      /* ignore */
    }
    setSeen(true);
  }, [userId]);
  return { seen, acknowledge };
}

const POINTS = [
  { icon: EyeOff, text: 'Your name and profile are hidden from other students.' },
  { icon: ShieldCheck, text: 'CampusX still keeps an internal account reference for safety, moderation, and abuse prevention.' },
  { icon: HeartHandshake, text: 'Keep it kind, and leave out phone numbers, emails and other private details.' },
];

/** Shown before a student's first anonymous post. */
export function AnonymousSafetyNotice({ open, onContinue, onCancel }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Before you post anonymously"
      size="sm"
      closeOnOverlayClick={false}
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onContinue}>Continue</Button>
        </>
      }
    >
      <ul className="flex flex-col gap-3">
        {POINTS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3 text-sm leading-relaxed text-ink">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-fg" aria-hidden="true">
              <Icon className="size-4" />
            </span>
            {text}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
