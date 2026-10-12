import { useEffect, useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, BadgeCheck, BookOpen, CalendarDays, IdCard, School, Sparkles, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router';
import { BranchSelector } from '@/components/onboarding/BranchSelector';
import { CollegeSelector } from '@/components/onboarding/CollegeSelector';
import { InterestSelector } from '@/components/onboarding/InterestSelector';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { OnboardingReview } from '@/components/onboarding/OnboardingReview';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { OnboardingWelcome } from '@/components/onboarding/OnboardingWelcome';
import { SemesterSelector } from '@/components/onboarding/SemesterSelector';
import { SkillSelector } from '@/components/onboarding/SkillSelector';
import { Alert, Button, ErrorState, Input, Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuthStore } from '@/store/authStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import { ONBOARDING_STEPS, branchesForCollege, stepIndexForField, validateStep } from '@/utils/onboarding';

const FORM_ID = 'onboarding-step';
// Progress counts the questions + review; the welcome screen sits outside it.
const PROGRESS_STEPS = ONBOARDING_STEPS.slice(1);

const slide = {
  enter: (direction) => ({ opacity: 0, x: direction * 32 }),
  center: { opacity: 1, x: 0 },
  exit: (direction) => ({ opacity: 0, x: direction * -32 }),
};

export default function OnboardingPage() {
  useDocumentTitle('Set up your campus');
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const store = useOnboardingStore();
  const { stepIndex, direction, draft, fieldErrors, options, optionsStatus, optionsError } = store;
  const [stepError, setStepError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const errorId = useId();

  useEffect(() => {
    store.startFor(user);
    store.loadOptions();
    // Runs once per signed-in student; the store actions are stable.
  }, [user.id]);

  const step = ONBOARDING_STEPS[stepIndex];

  const goToStep = (index) => {
    setStepError('');
    store.goTo(index);
    window.scrollTo({ top: 0 });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError('');
    try {
      await store.submit();
      navigate(ROUTES.HOME, { replace: true });
    } catch (error) {
      const hasFieldErrors = error.errors?.some((item) => stepIndexForField(item.field) > 0);
      setSubmitError(
        hasFieldErrors ? 'A few details need another look. Use Edit to fix them, then complete setup again.' : error.message,
      );
      setIsSubmitting(false);
    }
  };

  const handleContinue = (event) => {
    event.preventDefault();
    if (step.id === 'review') {
      handleSubmit();
      return;
    }
    const message = validateStep(step.id, draft, options.rules);
    if (message) {
      setStepError(message);
      return;
    }
    goToStep(stepIndex + 1);
  };

  if (optionsStatus !== 'ready') {
    return (
      <OnboardingLayout>
        {optionsStatus === 'error' ? (
          <ErrorState
            title="We couldn't load your campus options"
            description={optionsError}
            onRetry={store.loadOptions}
          />
        ) : (
          <Loader centered label="Loading your campus options" />
        )}
      </OnboardingLayout>
    );
  }

  // A rejected step (client check) or a server-side error for this step's field.
  const errorFor = (field) => stepError || fieldErrors[field] || '';
  const describedBy = (field) => (errorFor(field) ? errorId : undefined);
  const stepProps = (field) => ({ error: errorFor(field) });
  const setField = (field) => (value) => {
    setStepError('');
    store.setField(field, value);
  };

  const renderStep = () => {
    switch (step.id) {
      case 'welcome':
        return <OnboardingWelcome firstName={user.firstName} />;
      case 'college':
        return (
          <OnboardingStep icon={School} title="Which campus do you call home?" description="Search for your college and pick it from the list." {...stepProps('college')}>
            <CollegeSelector colleges={options.colleges} value={draft.college} onChange={setField('college')} describedBy={describedBy('college')} />
          </OnboardingStep>
        );
      case 'branch':
        return (
          <OnboardingStep icon={BookOpen} title="What are you studying?" description="Pick your branch. Choose “Other” if yours isn't listed." {...stepProps('branch')}>
            <BranchSelector branches={branchesForCollege(options, draft.college)} value={draft.branch} onChange={setField('branch')} describedBy={describedBy('branch')} />
          </OnboardingStep>
        );
      case 'semester':
        return (
          <OnboardingStep icon={CalendarDays} title="Which semester are you in?" description="Pick the semester you're in right now." {...stepProps('semester')}>
            <SemesterSelector semesters={options.semesters} value={draft.semester} onChange={setField('semester')} describedBy={describedBy('semester')} />
          </OnboardingStep>
        );
      case 'rollNumber':
        return (
          <OnboardingStep
            icon={IdCard}
            title="What's your roll number?"
            description="Required. Type it exactly as it appears on your college ID card. Every college uses its own format, and that's fine."
          >
            <Input
              label="Roll number"
              placeholder="e.g. CS21-045"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={options.rules.rollNumber.maxLength + 10}
              value={draft.rollNumber}
              onChange={(event) => setField('rollNumber')(event.target.value)}
              error={errorFor('rollNumber')}
              hint="Only used to confirm you're a student here."
            />
          </OnboardingStep>
        );
      case 'interests':
        return (
          <OnboardingStep
            icon={Sparkles}
            title="What are you into?"
            description={`Pick ${options.rules.interests.min} to ${options.rules.interests.max}. They'll help CampusX point you to the right people, clubs and opportunities later.`}
            {...stepProps('interests')}
          >
            <InterestSelector
              groups={options.interestGroups}
              interests={options.interests}
              selected={draft.interests}
              onChange={setField('interests')}
              rules={options.rules.interests}
              describedBy={describedBy('interests')}
            />
          </OnboardingStep>
        );
      case 'skills':
        return (
          <OnboardingStep icon={Wrench} title="Any skills to show off?" description="Optional. Add things you're good at, or skip for now." {...stepProps('skills')}>
            <SkillSelector suggestions={options.skillSuggestions} skills={draft.skills} onChange={setField('skills')} rules={options.rules} />
          </OnboardingStep>
        );
      case 'review':
        return (
          <OnboardingStep icon={BadgeCheck} title="Your campus identity" description="Check that everything looks right. You can go back and change anything." error={submitError}>
            <OnboardingReview
              user={user}
              draft={draft}
              options={options}
              fieldErrors={fieldErrors}
              onEdit={(field) => goToStep(stepIndexForField(field))}
            />
          </OnboardingStep>
        );
      default:
        return null;
    }
  };

  const continueLabel = {
    welcome: "Let's go",
    skills: draft.skills.length > 0 ? 'Continue' : 'Skip for now',
    review: isSubmitting ? 'Setting up your campus…' : 'Complete setup',
  }[step.id] ?? 'Continue';

  return (
    <OnboardingLayout
      progress={stepIndex > 0 && <OnboardingProgress steps={PROGRESS_STEPS} currentIndex={stepIndex - 1} />}
      footer={
        <>
          {stepIndex > 0 ? (
            <Button variant="ghost" leftIcon={ArrowLeft} onClick={() => goToStep(stepIndex - 1)} disabled={isSubmitting}>
              Back
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="submit"
            form={FORM_ID}
            size="lg"
            rightIcon={step.id === 'review' ? BadgeCheck : ArrowRight}
            loading={isSubmitting}
            className="min-w-36"
          >
            {continueLabel}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} noValidate onSubmit={handleContinue}>
        {/* Points screen readers at the step error that the fieldset/list references. */}
        {stepError && <span id={errorId} className="sr-only">{stepError}</span>}
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={step.id}
            custom={direction}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </form>
    </OnboardingLayout>
  );
}
