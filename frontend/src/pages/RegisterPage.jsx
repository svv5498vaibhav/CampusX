import { useId } from 'react';
import { ArrowRight, Mail } from 'lucide-react';
import { Link } from 'react-router';
import { AuthShell } from '@/components/auth/AuthShell';
import { PasswordChecklist } from '@/components/auth/PasswordChecklist';
import { Alert, Button, Input, PasswordInput } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useForm } from '@/hooks/useForm';
import { useAuthStore } from '@/store/authStore';
import { validateRegisterForm } from '@/utils/validation';

const INITIAL_VALUES = { firstName: '', lastName: '', email: '', password: '', confirmPassword: '' };

export default function RegisterPage() {
  useDocumentTitle('Join');
  const register = useAuthStore((state) => state.register);
  const checklistId = useId();
  const { values, formRef, fieldProps, formError, isSubmitting, handleSubmit } = useForm(INITIAL_VALUES, validateRegisterForm);

  // A new account is signed in straight away; GuestRoute then moves the student into campus.
  const onSubmit = (form) =>
    register({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      password: form.password,
      confirmPassword: form.confirmPassword,
    });

  return (
    <AuthShell
      title="Join your digital campus"
      subtitle="Create your student account. It takes less than a minute."
      panelTitle="Your campus life, in one place"
      panelText="One account for your clubs, projects, ideas and the people you meet along the way."
      footer={
        <>
          Already have an account?{' '}
          <Link to={ROUTES.LOGIN} className="font-semibold text-primary hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form ref={formRef} noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {formError && <Alert variant="danger">{formError}</Alert>}

        <div className="grid gap-5 sm:grid-cols-2">
          <Input label="First name" autoComplete="given-name" placeholder="Riya" {...fieldProps('firstName')} />
          <Input label="Last name" autoComplete="family-name" placeholder="Sharma" {...fieldProps('lastName')} />
        </div>
        <Input
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          placeholder="you@college.edu"
          leftIcon={Mail}
          hint="Any email works for now. College verification comes later."
          {...fieldProps('email')}
        />
        <PasswordInput
          label="Password"
          autoComplete="new-password"
          placeholder="Create a password"
          aria-describedby={checklistId}
          {...fieldProps('password')}
        />
        <PasswordChecklist id={checklistId} password={values.password} />
        <PasswordInput
          label="Confirm password"
          autoComplete="new-password"
          placeholder="Type it once more"
          {...fieldProps('confirmPassword')}
        />

        <Button type="submit" size="lg" fullWidth loading={isSubmitting} rightIcon={ArrowRight} className="mt-1">
          {isSubmitting ? 'Creating your account…' : 'Create my account'}
        </Button>
      </form>
    </AuthShell>
  );
}
