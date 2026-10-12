import { cn } from '@/utils/cn';

/** Placeholder cards while recommendations load (never a blank space). */
export function RecommendationSkeleton({ count = 4, label = 'Loading recommendations', className }) {
  return (
    <div role="status" aria-label={label} className={cn('min-w-0', className)}>
      <div className="mb-3 h-6 w-48 animate-pulse rounded-lg bg-surface-muted" />
      <div className="-mx-4 flex gap-3 overflow-hidden px-4 sm:mx-0 sm:px-0">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="w-[80%] max-w-[19rem] shrink-0 rounded-3xl border border-line bg-surface p-4 sm:w-72" aria-hidden="true">
            <div className="flex gap-3">
              <div className="size-10 animate-pulse rounded-2xl bg-surface-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-16 animate-pulse rounded bg-surface-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-surface-muted" />
              </div>
            </div>
            <div className="mt-4 h-7 animate-pulse rounded-xl bg-primary-soft/60" />
            <div className="mt-4 h-9 animate-pulse rounded-xl bg-surface-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
