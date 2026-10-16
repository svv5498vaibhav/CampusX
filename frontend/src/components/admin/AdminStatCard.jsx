import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/utils/cn';
import { Reveal } from './AdminUi';

/**
 * A headline number. `trend` ({ current, previous, days }) is the real count of new items in the last
 * `days` days against the `days` before: shown as words, with the arrow only as a supplement. Cards
 * without a trend show their `detail` line instead; nothing is estimated.
 */
export function AdminStatCard({ icon: Icon, title, value, trend, detail, to, tone = 'violet', delay = 0 }) {
  const Component = to ? Link : 'div';
  const change = trend ? trend.current - trend.previous : 0;
  const TrendIcon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;

  return (
    <Reveal delay={delay}>
      <Component
        {...(to && { to })}
        className={cn(
          'admin-panel group relative flex h-full flex-col gap-3 overflow-hidden p-4 transition-[transform,border-color,box-shadow] duration-200 ease-campus',
          // Only cards that open a page lift on hover, so the motion never suggests a link that isn't there.
          to && 'hover:-translate-y-0.5 hover:border-ax-border-strong hover:shadow-[var(--ag-shadow-lift)] focus-visible:border-ax-violet motion-reduce:hover:translate-y-0',
        )}
      >
        <span aria-hidden="true" className={cn('pointer-events-none absolute -top-12 -right-12 size-28 rounded-full blur-2xl', tone === 'danger' ? 'bg-ax-danger/10' : tone === 'warning' ? 'bg-ax-warning/10' : 'bg-ax-violet/10')} />
        <div className="flex items-center justify-between gap-2">
          <p className="admin-label text-ax-muted">{title}</p>
          {Icon && (
            <span className={cn('grid size-8 place-items-center rounded-lg border bg-ax-bg-2', tone === 'danger' ? 'border-ax-danger/40 text-ax-danger' : tone === 'warning' ? 'border-ax-warning/40 text-ax-warning' : 'border-ax-border text-ax-neon')}>
              <Icon className="size-4" aria-hidden="true" />
            </span>
          )}
        </div>
        <p className="font-display text-3xl font-bold tracking-tight text-ax-text tabular-nums">{Number(value ?? 0).toLocaleString()}</p>
        <div className="mt-auto min-h-5 text-xs text-ax-muted">
          {trend ? (
            <p className="flex flex-wrap items-center gap-x-1.5">
              {/* Direction only: more reports isn't "good", so the arrow carries no good/bad colour. */}
              <TrendIcon className="size-3.5 text-ax-neon" aria-hidden="true" />
              <span className="font-semibold text-ax-text">{trend.current.toLocaleString()}</span> new in {trend.days} days
              <span className="text-ax-subtle">· {trend.previous.toLocaleString()} the {trend.days} days before</span>
            </p>
          ) : (
            detail
          )}
        </div>
      </Component>
    </Reveal>
  );
}
