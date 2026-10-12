import { useState } from 'react';
import { TriangleAlert, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { ROLES } from '@/constants/auth';
import { useAuthStore } from '@/store/authStore';
import { DeleteAccountDialog } from './DeleteAccountDialog';

/**
 * "Danger zone" at the very bottom of the student's own profile: permanently delete the account (opens the
 * confirmation dialog). Staff accounts can't delete themselves here (the API refuses too), so they get a note.
 */
export function DangerZoneCard() {
  const role = useAuthStore((state) => state.user?.role);
  const [open, setOpen] = useState(false);
  const isStaff = role && role !== ROLES.STUDENT;

  return (
    <section aria-labelledby="danger-zone-title" data-testid="danger-zone" className="mt-10 rounded-3xl border border-danger/35 bg-danger-soft/50 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-bold tracking-[0.12em] text-danger-fg uppercase">
            <TriangleAlert className="size-3.5" aria-hidden="true" /> Danger zone
          </p>
          <h2 id="danger-zone-title" className="mt-1.5 font-display text-lg font-bold text-ink">
            Delete account
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Deleting your account is permanent. Your account and associated personal data may not be recoverable.
          </p>
          {isStaff && (
            <p className="mt-2 max-w-2xl text-sm font-medium text-ink">
              Moderator and admin accounts can't be deleted here. Ask a CampusX admin to remove your staff role first.
            </p>
          )}
        </div>
        {!isStaff && (
          <Button variant="danger" leftIcon={Trash2} onClick={() => setOpen(true)} className="self-start sm:self-center">
            Delete Account
          </Button>
        )}
      </div>
      {!isStaff && <DeleteAccountDialog open={open} onClose={() => setOpen(false)} />}
    </section>
  );
}
