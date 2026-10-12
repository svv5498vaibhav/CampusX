import { useId, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { PasswordChecklist } from '@/components/auth/PasswordChecklist';
import { Alert, Button, Card, PasswordInput } from '@/components/ui';
import { useForm } from '@/hooks/useForm';
import { authApi } from '@/services/authApi';
import { useAuthStore } from '@/store/authStore';
import { validateChangePasswordForm } from '@/utils/validation';

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };

const signedOutText = (count) =>
  count === 0 ? 'No other devices were signed in.' : `${count} other ${count === 1 ? 'device was' : 'devices were'} signed out.`;

/*
 * The typed passwords live only in this form's state: never logged or stored, and cleared once the
 * change is saved (the form remounts empty). The API checks everything again; a wrong current password
 * comes back as a field error, and an ended session signs the student out (services/api.js).
 */
function PasswordForm({ onChanged }) {
  const email = useAuthStore((state) => state.user?.email ?? '');
  const checklistId = useId();
  const { values, formRef, fieldProps, formError, isSubmitting, handleSubmit } = useForm(EMPTY, validateChangePasswordForm);

  const onSubmit = async (form) => onChanged(await authApi.changePassword(form));

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" aria-label="Change password">
      {formError && <Alert variant="danger">{formError}</Alert>}
      {/* Lets password managers file the new password under the right account. */}
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <PasswordInput label="Current password" autoComplete="current-password" {...fieldProps('currentPassword')} />
      <PasswordInput label="New password" autoComplete="new-password" aria-describedby={checklistId} {...fieldProps('newPassword')} />
      <PasswordChecklist id={checklistId} password={values.newPassword} />
      <PasswordInput label="Confirm new password" autoComplete="new-password" {...fieldProps('confirmPassword')} />
      <Button type="submit" leftIcon={KeyRound} loading={isSubmitting} className="self-start">
        {isSubmitting ? 'Changing password…' : 'Change password'}
      </Button>
    </form>
  );
}

/** "Password" section of the profile editor: change the password, signing out every other device. */
export function ChangePasswordCard({ id }) {
  const [result, setResult] = useState(null);
  const [formKey, setFormKey] = useState(0);

  const onChanged = (data) => {
    setResult(data);
    setFormKey((key) => key + 1);
  };

  return (
    <Card id={id} className="scroll-mt-24">
      <h2 className="font-display text-lg font-bold text-ink">Password</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Saves on its own, separately from your profile. You stay signed in here; every other device is signed out.
      </p>
      <div className="mt-5 flex flex-col gap-5">
        {result && (
          <Alert variant="success" title="Password changed">
            {signedOutText(result.otherSessionsSignedOut)} Use your new password next time you sign in.
          </Alert>
        )}
        <PasswordForm key={formKey} onChanged={onChanged} />
      </div>
    </Card>
  );
}
