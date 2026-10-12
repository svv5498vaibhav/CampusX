import { cn } from '@/utils/cn';

const PADDING = {
  none: '',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
};

const TONES = {
  default: 'border-line bg-surface shadow-soft',
  muted: 'border-transparent bg-surface-muted',
};

export function Card({
  as: Component = 'div',
  padding = 'md',
  tone = 'default',
  interactive = false,
  className,
  ...props
}) {
  return (
    <Component
      className={cn(
        'rounded-3xl border',
        TONES[tone],
        PADDING[padding],
        interactive &&
          'transition-[transform,box-shadow,border-color] duration-300 ease-campus hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift',
        className,
      )}
      {...props}
    />
  );
}
