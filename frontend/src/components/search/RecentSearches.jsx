import { useEffect } from 'react';
import { History, Trash2, X } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui';
import { searchPath } from '@/constants/routes';
import { useSearchStore } from '@/store/searchStore';
import { toast } from '@/store/toastStore';
import { formatRelativeTime } from '@/utils/time';

/** The student's own recent searches (private to them), each removable, with "Clear all". */
export function RecentSearches({ className }) {
  const history = useSearchStore((state) => state.history);
  const status = useSearchStore((state) => state.historyStatus);
  const { fetchHistory, deleteHistory, clearHistory } = useSearchStore.getState();

  useEffect(() => {
    fetchHistory();
  }, [status === 'stale']);

  const remove = async (entry) => {
    try {
      await deleteHistory(entry.id);
    } catch (error) {
      toast.error(error.message);
    }
  };
  const clearAll = async () => {
    try {
      await clearHistory();
      toast.success('Recent searches cleared.');
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <section aria-labelledby="recent-searches-title" className={className}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="recent-searches-title" className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <History className="size-5 text-primary" aria-hidden="true" /> Recent searches
        </h2>
        {history.length > 0 && (
          <Button variant="ghost" size="sm" leftIcon={Trash2} onClick={clearAll}>
            Clear all
          </Button>
        )}
      </div>

      {status === 'loading' && history.length === 0 && (
        <ul className="flex flex-wrap gap-2" aria-hidden="true">
          {[96, 72, 120].map((width) => <li key={width} className="h-9 animate-pulse rounded-xl bg-surface-muted" style={{ width }} />)}
        </ul>
      )}
      {status === 'error' && <p className="text-sm text-ink-muted">We couldn’t load your recent searches.</p>}
      {['ready', 'stale'].includes(status) && history.length === 0 && (
        <p className="rounded-2xl bg-surface-muted px-4 py-3 text-sm text-ink-muted">Your recent searches will appear here.</p>
      )}
      {history.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {history.map((entry) => (
            <li key={entry.id} className="flex items-center rounded-xl border border-line bg-surface shadow-soft">
              <Link to={searchPath(entry.query)} className="max-w-[16rem] truncate py-2 pr-1 pl-3 text-sm font-semibold text-ink hover:text-primary" title={`Searched ${formatRelativeTime(entry.searchedAt)}`}>
                {entry.query}
              </Link>
              <button type="button" onClick={() => remove(entry)} aria-label={`Remove "${entry.query}" from recent searches`} className="mr-1 grid size-7 place-items-center rounded-lg text-ink-subtle hover:bg-surface-muted hover:text-ink">
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
