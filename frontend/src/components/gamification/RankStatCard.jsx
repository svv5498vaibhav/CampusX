import { cn } from '@/utils/cn';

/** One rank in a scope ("College Rank #6"), or a hint while the student has no points there yet. */
export function RankStatCard({ label, rank, hint, className }) {
  return (
    <div className={cn('rounded-2xl bg-surface-muted px-3 py-2.5', className)} title={hint ?? undefined}>
      <p className="text-[11px] font-semibold tracking-wide text-ink-subtle uppercase">{label}</p>
      <p className="mt-0.5 font-display text-lg font-bold text-ink">{rank ? `#${rank}` : '—'}</p>
      {hint && <p className="truncate text-[11px] text-ink-muted">{hint}</p>}
    </div>
  );
}
