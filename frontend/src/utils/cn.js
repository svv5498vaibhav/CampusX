/**
 * Joins class names, skipping falsy values: cn('a', isOn && 'b', ['c']).
 * It does not resolve Tailwind conflicts (e.g. 'inline-flex' + 'hidden'), so
 * components expose props such as `size`, `width` or `spacing` for variations
 * instead of expecting callers to override base classes.
 */
export const cn = (...classes) => classes.flat(Infinity).filter(Boolean).join(' ');
