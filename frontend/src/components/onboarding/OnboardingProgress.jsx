import { motion } from 'framer-motion';

/** Compact "Step 3 of 7 · Semester" label plus one segment per step. */
export function OnboardingProgress({ steps, currentIndex }) {
  const current = currentIndex + 1;
  const total = steps.length;
  const label = steps[currentIndex]?.label;

  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-primary">
          Step {current} of {total}
        </span>
        <span className="text-ink-muted">{label}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Onboarding progress"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={`Step ${current} of ${total}: ${label}`}
        className="mt-2 flex gap-1.5"
      >
        {steps.map((step, index) => (
          <span key={step.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <motion.span
              className="block h-full rounded-full bg-primary"
              initial={false}
              animate={{ width: index <= currentIndex ? '100%' : '0%' }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
