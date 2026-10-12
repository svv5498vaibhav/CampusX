import { FeedFilters } from '@/components/feed/FeedFilters';

/** Category chips and "Most recent / Most discussed". Labels come from the API. */
export function AnonymousFilters({ options, category, sort, onChange }) {
  return (
    <div className="flex flex-col gap-3">
      <FeedFilters filters={options?.filters} value={category} onChange={(next) => onChange({ category: next })} label="Filter by category" />
      <label className="flex items-center gap-2 self-end text-sm font-semibold text-ink-muted">
        Sort
        <select
          value={sort}
          onChange={(event) => onChange({ sort: event.target.value })}
          className="h-9 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold text-ink focus:border-primary focus:ring-4 focus:ring-focus focus:outline-none"
        >
          {(options?.sorts ?? [{ id: 'recent', label: 'Most recent' }]).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
    </div>
  );
}
