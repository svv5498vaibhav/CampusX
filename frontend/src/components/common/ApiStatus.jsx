import { Link } from 'react-router';
import { ROUTES } from '@/constants/routes';
import { useApiHealth } from '@/hooks/useApiHealth';
import { cn } from '@/utils/cn';

const STATUS_META = {
  checking: { label: 'Checking backend…', dot: 'bg-ink-subtle animate-pulse' },
  online: { label: 'Backend connected', dot: 'bg-primary' },
  offline: { label: 'Backend offline', dot: 'bg-danger' },
};

/** Development aid: compact backend status that links to the full status page. */
export function ApiStatus({ className }) {
  const { status } = useApiHealth();
  const { label, dot } = STATUS_META[status];

  return (
    <Link
      to={ROUTES.DEV_STATUS}
      role="status"
      title="Open system status (development only)"
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink-muted transition-colors hover:border-line-strong hover:text-ink',
        className,
      )}
    >
      <span className={cn('size-2 rounded-full', dot)} aria-hidden="true" />
      {label}
    </Link>
  );
}
