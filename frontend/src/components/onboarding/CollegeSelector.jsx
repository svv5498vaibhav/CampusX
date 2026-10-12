import { useId, useMemo, useState } from 'react';
import { Search, SearchX } from 'lucide-react';
import { Input } from '@/components/ui';
import { searchColleges } from '@/utils/onboarding';
import { ChoiceCard } from './ChoiceCard';

/** Searchable list of colleges from the API. Matches names and aliases (e.g. "VNIT", "raisoni"). */
export function CollegeSelector({ colleges, value, onChange, describedBy }) {
  const [query, setQuery] = useState('');
  const resultsId = useId();
  const results = useMemo(() => searchColleges(colleges, query), [colleges, query]);
  const selected = colleges.find((college) => college.id === value);
  const selectedIsHidden = selected && !results.includes(selected);

  return (
    <div className="flex flex-col gap-4">
      <Input
        type="search"
        label="Search colleges"
        placeholder="Try “VNIT”, “Raisoni” or “Pallotti”"
        leftIcon={Search}
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-controls={resultsId}
      />

      {selectedIsHidden && (
        <p className="rounded-xl bg-primary-soft px-4 py-2.5 text-sm text-primary-soft-fg">
          Selected: <span className="font-semibold">{selected.name}</span>
        </p>
      )}

      <p className="sr-only" aria-live="polite">
        {results.length === 1 ? '1 college found' : `${results.length} colleges found`}
      </p>

      <fieldset id={resultsId} aria-describedby={describedBy}>
        <legend className="sr-only">College</legend>
        {results.length > 0 ? (
          <div className="grid gap-2.5 md:grid-cols-2">
            {results.map((college) => (
              <ChoiceCard
                key={college.id}
                name="college"
                value={college.id}
                checked={value === college.id}
                onChange={onChange}
                title={college.name}
                description={college.city}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
            <SearchX className="size-8 text-ink-subtle" aria-hidden="true" />
            <p className="mt-3 font-semibold text-ink">No college matches “{query.trim()}”</p>
            <p className="mt-1 max-w-sm text-sm text-ink-muted">
              Check the spelling or try a short form. CampusX currently covers colleges in Nagpur.
            </p>
          </div>
        )}
      </fieldset>
    </div>
  );
}
