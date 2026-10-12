import { cn } from '@/utils/cn';

/** Placeholder rows while notifications load. */
export function NotificationSkeleton({ rows = 4, className }) {
  return (
    <ul className={cn('flex flex-col gap-1', className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex animate-pulse items-start gap-3 rounded-2xl px-3 py-3">
          <span className="size-10 shrink-0 rounded-full bg-surface-muted" />
          <span className="flex flex-1 flex-col gap-2 pt-1">
            <span className="h-3 w-1/3 rounded bg-surface-muted" />
            <span className="h-3 w-5/6 rounded bg-surface-muted" />
            <span className="h-2.5 w-12 rounded bg-surface-muted" />
          </span>
        </li>
      ))}
    </ul>
  );
}
