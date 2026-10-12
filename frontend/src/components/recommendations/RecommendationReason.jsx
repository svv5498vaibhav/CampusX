import { Target } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Why something is recommended, in the server's plain words ("Matches your React skills"). Never a score.
 * `compact` shows only the main reason.
 */
export function RecommendationReason({ reasons, compact = false, className }) {
  if (!reasons?.length) return null;
  const [main, extra] = reasons;
  return (
    <p className={cn('flex items-start gap-1.5 rounded-xl bg-primary-soft px-2.5 py-1.5 text-xs leading-snug font-semibold text-primary-soft-fg', className)} data-recommendation-reason="">
      <Target className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="sr-only">Why you're seeing this: </span>
        {main}
        {!compact && extra && <span className="font-medium"> · {extra}</span>}
      </span>
    </p>
  );
}
