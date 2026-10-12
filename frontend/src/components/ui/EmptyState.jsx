import { Inbox } from 'lucide-react';
import { cn } from '@/utils/cn';

const TONES = {
  primary: 'bg-primary-soft text-primary-soft-fg',
  danger: 'bg-danger-soft text-danger-fg',
};

/** Centered icon + message + optional action. Also the base for ErrorState. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  tone = 'primary',
  titleAs: Title = 'h3',
  className,
  ...props
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)} {...props}>
      <div className={cn('mb-5 grid size-16 place-items-center rounded-3xl', TONES[tone])}>
        <Icon className="size-7" aria-hidden="true" />
      </div>
      <Title className="font-display text-lg font-bold text-ink">{title}</Title>
      {description && (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
