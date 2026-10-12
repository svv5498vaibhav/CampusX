import { cn } from '@/utils/cn';

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  as: Heading = 'h2',
  className,
}) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 text-xs font-bold tracking-[0.14em] text-primary uppercase">{eyebrow}</p>
        )}
        <Heading className="font-display text-2xl font-bold tracking-tight text-balance text-ink sm:text-3xl">
          {title}
        </Heading>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-pretty text-ink-muted sm:text-base">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
