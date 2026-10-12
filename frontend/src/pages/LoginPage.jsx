import { useEffect, useState } from 'react';
import { ArrowRight, Mail } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { AuthShell } from '@/components/auth/AuthShell';
import { Alert, Button, Input, PasswordInput } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useForm } from '@/hooks/useForm';
import { useAuthStore } from '@/store/authStore';
import { validateLoginForm } from '@/utils/validation';

export default function LoginPage() {
  useDocumentTitle('Log in');
  const login = useAuthStore((state) => state.login);
  const location = useLocation();
  const navigate = useNavigate();
  // Set after deleting an account ('deleted' | 'scheduled'). Read once, then cleared so a reload won't repeat it.
  const [accountDeleted] = useState(() => location.state?.accountDeleted ?? null);
  useEffect(() => {
    if (location.state?.accountDeleted) navigate(location.pathname, { replace: true, state: null });
    // Once on arrival.
  }, []);
  const { formRef, fieldProps, formError, isSubmitting, handleSubmit } = useForm(
    { email: '', password: '' },
    validateLoginForm,
  );

  // After a successful login, GuestRoute sends the student on (back to the page they wanted, or home).
  const onSubmit = ({ email, password }) => login({ email: email.trim(), password });

  return (
    <AuthShell
      title="Welcome back to campus"
      subtitle="Log in to pick up where you left off."
      panelTitle="Enter your digital campus"
      panelText="Your clubs, projects, ideas and classmates, all waiting on the other side of this gate."
      footer={
        <>
          New to CampusX?{' '}
          <Link to={ROUTES.REGISTER} className="font-semibold text-primary hover:underline">
            Create your account
          </Link>
        </>
      }
    >
      <form ref={formRef} noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {formError ? (
          <Alert variant="danger">{formError}</Alert>
        ) : accountDeleted ? (
          <Alert variant="success" title={accountDeleted === 'scheduled' ? 'Account closed' : 'Account deleted'}>
            {accountDeleted === 'scheduled'
              ? 'Your account is closed. Removing the rest of its data finishes automatically.'
              : 'Your CampusX account and its data have been permanently deleted. You are signed out on every device.'}
          </Alert>
        ) : (
          location.state?.from && <Alert variant="info">Please log in to continue.</Alert>
        )}

        <Input
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          placeholder="you@college.edu"
          leftIcon={Mail}
          {...fieldProps('email')}
        />
        <PasswordInput label="Password" autoComplete="current-password" placeholder="Your password" {...fieldProps('password')} />

        <Button type="submit" size="lg" fullWidth loading={isSubmitting} rightIcon={ArrowRight} className="mt-1">
          {isSubmitting ? 'Entering campus…' : 'Log in'}
        </Button>
      </form>
    </AuthShell>
  );
}
