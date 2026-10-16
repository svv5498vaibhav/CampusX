import { cn } from '@/utils/cn';

const bar = 'rounded bg-surface-muted';

function CardSkeleton() {
  return (
    <div className="flex h-full animate-pulse flex-col gap-3 glass-card rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="size-12 shrink-0 rounded-2xl bg-surface-muted" />
        <span className="flex flex-1 flex-col gap-2 pt-1">
          <span className={cn(bar, 'h-3.5 w-3/4')} />
          <span className={cn(bar, 'h-3 w-1/2')} />
        </span>
      </div>
      <span className={cn(bar, 'h-3 w-full')} />
      <span className={cn(bar, 'h-3 w-5/6')} />
      <span className="mt-2 h-9 rounded-xl bg-surface-muted" />
    </div>
  );
}

function PostSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3 glass-card rounded-3xl border border-line bg-surface p-5">
      <div className="flex items-center gap-3">
        <span className="size-10 rounded-xl bg-surface-muted" />
        <span className="flex flex-1 flex-col gap-2">
          <span className={cn(bar, 'h-3.5 w-1/3')} />
          <span className={cn(bar, 'h-3 w-1/4')} />
        </span>
      </div>
      <span className={cn(bar, 'h-3 w-full')} />
      <span className={cn(bar, 'h-3 w-11/12')} />
      <span className={cn(bar, 'h-3 w-2/3')} />
    </div>
  );
}

/** Placeholders while a search runs: a grid of cards, or a column of posts. */
export function SearchSkeleton({ variant = 'grid', count = 6, className }) {
  return (
    <div role="status" aria-label="Searching" className={className}>
      {variant === 'posts' ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: Math.min(count, 3) }, (_, index) => <PostSkeleton key={index} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: count }, (_, index) => <CardSkeleton key={index} />)}
        </div>
      )}
      <span className="sr-only">Searching CampusX…</span>
    </div>
  );
}
