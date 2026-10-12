import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

export function ErrorState({
  title = 'Something went wrong',
  description = 'We could not load this right now. Please try again.',
  onRetry,
  retryLabel = 'Try again',
  action,
  ...props
}) {
  return (
    <EmptyState
      role="alert"
      tone="danger"
      icon={TriangleAlert}
      title={title}
      description={description}
      action={
        action ??
        (onRetry && (
          <Button variant="outline" leftIcon={RefreshCw} onClick={onRetry}>
            {retryLabel}
          </Button>
        ))
      }
      {...props}
    />
  );
}
