import { useId, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { Alert, Button, Input, Modal, PasswordInput } from '@/components/ui';
import { DELETE_ACCOUNT_CONFIRMATION } from '@/constants/auth';
import { ROUTES } from '@/constants/routes';
import { useDeleteAccount } from '@/hooks/useDeleteAccount';
import { useAuthStore } from '@/store/authStore';

const EMPTY = { password: '', confirmation: '' };

const isConfirmed = (text) => text.trim() === DELETE_ACCOUNT_CONFIRMATION;

/** What deleting removes, keeps and hands on: the same policy as backend/services/accountDeletionService.js. */
const CONSEQUENCES = [
  'Your profile, posts, comments, projects, achievements, saved opportunities, roadmap progress, points, badges and notifications are deleted.',
  'Photos and files on your profile, posts, projects and achievements are removed. Comments other students left on your posts go with those posts, and your likes stop counting.',
  'A community you own alone passes to its longest-serving moderator, or is archived if it has none.',
  'Reports you filed and moderation records stay with CampusX for safety, without your name.',
];

/*
 * The typed password lives only in this form's state: never logged or stored, and dropped when the dialog
 * closes (the form remounts empty). The API checks everything again; nothing is deleted unless the password
 * is right and the confirmation word matches.
 */
function DeleteAccountForm({ formId, onBusyChange, onConfirmedChange }) {
  const email = useAuthStore((state) => state.user?.email ?? '');
  const deleteAccount = useDeleteAccount();
  const formRef = useRef(null);
  // Guards against a second submit before the first one has re-rendered the button as busy.
  const inFlight = useRef(false);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const confirmationHintId = useId();

  const setBusy = (busy) => {
    inFlight.current = busy;
    setIsDeleting(busy);
    onBusyChange(busy);
  };

  const field = (name) => ({
    name,
    value: values[name],
    error: errors[name],
    disabled: isDeleting,
    onChange: (event) => {
      const { value } = event.target;
      setValues((previous) => ({ ...previous, [name]: value }));
      if (name === 'confirmation') onConfirmedChange(isConfirmed(value));
      if (errors[name]) setErrors((previous) => ({ ...previous, [name]: undefined }));
      if (formError) setFormError('');
    },
  });

  // The first invalid field gets the focus; otherwise a message for the whole form is brought into view
  // (on a phone it can sit below the fold of the dialog).
  const focusInvalid = () =>
    requestAnimationFrame(() => {
      const invalid = formRef.current?.querySelector('[aria-invalid="true"]');
      if (invalid) invalid.focus();
      else formRef.current?.querySelector('[data-form-error]')?.scrollIntoView({ block: 'nearest' });
    });

  const onSubmit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    const nextErrors = {
      password: values.password ? undefined : 'Please enter your password.',
      confirmation: isConfirmed(values.confirmation) ? undefined : `Type ${DELETE_ACCOUNT_CONFIRMATION} to confirm.`,
    };
    setErrors(nextErrors);
    setFormError('');
    if (nextErrors.password || nextErrors.confirmation) {
      focusInvalid();
      return;
    }

    setBusy(true);
    try {
      // On success this page is left (signed out); nothing below runs for it.
      await deleteAccount({ password: values.password, confirmation: values.confirmation.trim() });
    } catch (error) {
      const fieldErrors = Object.fromEntries((error.errors ?? []).filter((item) => ['password', 'confirmation'].includes(item.field)).map((item) => [item.field, item.message]));
      setErrors(fieldErrors);
      setFormError(Object.keys(fieldErrors).length ? '' : error.message || 'Something went wrong. Please try again.');
      // A wrong password is cleared so it isn't retried by accident.
      if (fieldErrors.password) setValues((previous) => ({ ...previous, password: '' }));
      setBusy(false);
      focusInvalid();
    }
  };

  return (
    <form id={formId} ref={formRef} noValidate onSubmit={onSubmit} className="flex flex-col gap-5" aria-label="Delete account" aria-busy={isDeleting || undefined}>
      <Alert variant="danger" title="This can't be undone">
        Deleting your account is permanent. Your account and associated personal data may not be recoverable.
      </Alert>

      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-ink-muted marker:text-danger">
        {CONSEQUENCES.map((text) => (
          <li key={text}>{text}</li>
        ))}
        <li>
          Your Anonymous Zone posts and comments stay anonymous and are not removed. To remove them, delete them first in{' '}
          <Link to={ROUTES.ANONYMOUS_MINE} className="font-semibold text-primary hover:underline">
            My anonymous posts
          </Link>
          .
        </li>
      </ul>

      {formError && (
        <div data-form-error>
          <Alert variant="danger">{formError}</Alert>
        </div>
      )}

      {/* Lets password managers fill the password of the right account. */}
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <PasswordInput label="Current password" autoComplete="current-password" {...field('password')} />
      <Input
        label={`Type ${DELETE_ACCOUNT_CONFIRMATION} to confirm`}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        hint={`Type ${DELETE_ACCOUNT_CONFIRMATION} in capital letters.`}
        aria-describedby={confirmationHintId}
        {...field('confirmation')}
      />
      <p id={confirmationHintId} className="sr-only">
        The delete button is enabled once you have typed {DELETE_ACCOUNT_CONFIRMATION}.
      </p>
    </form>
  );
}

/**
 * Final confirmation before deleting the account: current password (show/hide) and the typed word DELETE,
 * which enables the red button. Can't be closed while the deletion is running.
 */
export function DeleteAccountDialog({ open, onClose }) {
  const formId = useId();
  const [isBusy, setIsBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [isConfirmedText, setIsConfirmedText] = useState(false);

  const close = () => {
    if (isBusy) return;
    setIsConfirmedText(false);
    setFormKey((key) => key + 1);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      closeOnOverlayClick={!isBusy}
      title="Delete your account?"
      description="This permanently deletes your CampusX account."
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={isBusy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="danger" leftIcon={Trash2} loading={isBusy} disabled={!isConfirmedText} data-testid="confirm-delete-account">
            {isBusy ? 'Deleting your account…' : 'Permanently Delete My Account'}
          </Button>
        </>
      }
    >
      <DeleteAccountForm key={formKey} formId={formId} onBusyChange={setIsBusy} onConfirmedChange={setIsConfirmedText} />
    </Modal>
  );
}
