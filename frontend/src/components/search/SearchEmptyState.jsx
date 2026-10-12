import { Search, SearchX } from 'lucide-react';
import { Button, EmptyState, ErrorState } from '@/components/ui';

/**
 * What the search page says when there is nothing to show:
 *   start     no search yet
 *   none      no matches (with "Clear filters" when filters are on)
 *   error     the search couldn't run
 */
export function SearchEmptyState({ variant = 'start', error, hasFilters = false, onClearFilters, onRetry, className = 'rounded-3xl border border-dashed border-line-strong' }) {
  if (variant === 'error') {
    return <ErrorState title="Search didn't work this time" description={error} onRetry={onRetry} className={className} />;
  }
  if (variant === 'none') {
    return (
      <EmptyState
        icon={SearchX}
        title="No matches found"
        description="Try a different keyword or remove some filters."
        action={hasFilters && <Button variant="outline" onClick={onClearFilters}>Clear filters</Button>}
        className={className}
      />
    );
  }
  return (
    <EmptyState
      icon={Search}
      title="Find your people and projects"
      description="Search students, projects, communities and opportunities across CampusX."
      className={className}
    />
  );
}
