import { LoaderCircle } from 'lucide-react';
import { cn } from '@/utils/cn';

const VARIANTS = {
  primary: 'bg-primary text-primary-fg shadow-soft hover:bg-primary-hover hover:shadow-glow',
  secondary: 'bg-primary-soft text-primary-soft-fg hover:bg-primary-soft/70',
  outline: 'border border-line-strong bg-surface text-ink hover:border-primary hover:text-primary',
  ghost: 'text-ink-muted hover:bg-surface-muted hover:text-ink',
  danger: 'bg-danger text-white shadow-soft hover:bg-danger/90',
};

const SIZES = {
  sm: 'h-9 gap-1.5 px-3.5 text-sm',
  md: 'h-11 gap-2 px-5 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
  icon: 'size-10',
};

/**
 * Polymorphic button. Render a router link with `as={Link} to="/somewhere"`.
 */
export function Button({
  as: Component = 'button',
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  type,
  disabled,
  className,
  children,
  ...props
}) {
  const isNativeButton = Component === 'button';
  const isDisabled = disabled || loading;

  return (
    <Component
      type={isNativeButton ? (type ?? 'button') : type}
      disabled={isNativeButton ? isDisabled : undefined}
      aria-disabled={!isNativeButton && isDisabled ? true : undefined}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-xl font-semibold whitespace-nowrap',
        'transition-[background-color,color,border-color,box-shadow,transform] duration-200 ease-campus active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        LeftIcon && <LeftIcon className="size-4" aria-hidden="true" />
      )}
      {children}
      {RightIcon && !loading && <RightIcon className="size-4" aria-hidden="true" />}
    </Component>
  );
}
