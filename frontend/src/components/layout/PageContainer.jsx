import { cn } from '@/utils/cn';

const WIDTHS = {
  narrow: 'max-w-2xl',
  default: 'max-w-5xl',
  wide: 'max-w-7xl',
  full: 'max-w-none',
};

const SPACING = {
  page: 'py-6 sm:py-8 lg:py-10',
  none: '',
};

/** Centred, width-capped content column with responsive gutters. */
export function PageContainer({
  as: Component = 'div',
  width = 'default',
  spacing = 'page',
  className,
  ...props
}) {
  return (
    <Component
      className={cn('gutter-x mx-auto w-full', WIDTHS[width], SPACING[spacing], className)}
      {...props}
    />
  );
}
