import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';
import { activityLink, formatPoints } from '@/constants/gamification';
import { cn } from '@/utils/cn';
import { formatDateTime, formatRelativeTime } from '@/utils/time';

/** The student's points history: "+20 Added a project", "−5 Shared a campus post (post deleted)". */
export function PointActivity({ transactions }) {
  return (
    <ul className="flex flex-col divide-y divide-line rounded-3xl border border-line bg-surface" aria-label="Points history">
      {transactions.map((item) => {
        const positive = item.points > 0;
        const to = activityLink(item.link);
        return (
          <li key={item.id} className="flex items-center gap-3 px-4 py-3" data-kind={item.kind}>
            <span className={cn('w-14 shrink-0 text-right font-display text-sm font-bold', positive ? 'text-primary' : 'text-ink-subtle')}>
              {positive ? '+' : '−'}{formatPoints(Math.abs(item.points))}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('truncate text-sm font-semibold', positive ? 'text-ink' : 'text-ink-muted')}>{item.description}</p>
              <p className="text-xs text-ink-subtle">
                <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>{formatRelativeTime(item.createdAt)}</time>
                {item.reversed && ' · no longer counts'}
              </p>
            </div>
            {to && (
              <Link to={to} className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-subtle hover:bg-surface-muted hover:text-ink" aria-label={`Open: ${item.description}`}>
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
