import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button, Input, Modal, Select } from '@/components/ui';
import { FILTER_DEFAULTS, SEARCH_FILTER_KEYS } from '@/constants/search';
import { useSearchStore } from '@/store/searchStore';

/** A text filter applied after a short pause in typing (comma-separated names). */
function TextFilter({ label, value, onChange, placeholder, hint }) {
  const [draft, setDraft] = useState(value);
  const timer = useRef(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Input
      label={label}
      hint={hint}
      value={draft}
      placeholder={placeholder}
      maxLength={150}
      onChange={(event) => {
        setDraft(event.target.value);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onChange(event.target.value.trim()), 400);
      }}
    />
  );
}

const choices = (list, anyLabel, map = (item) => ({ value: item.id, label: item.label })) => [{ value: '', label: anyLabel }, ...(list ?? []).map(map)];
const college = (item) => ({ value: item.id, label: item.shortName });
const branch = (item) => ({ value: item.id, label: item.shortName });
const semester = (item) => ({ value: String(item.value), label: item.label });

/** The filter fields each category offers, built from GET /search/options. */
function fieldsFor(type, filters) {
  const f = filters ?? {};
  const select = (key, label, options) => ({ key, kind: 'select', label, options });
  const text = (key, label, placeholder) => ({ key, kind: 'text', label, placeholder, hint: 'Separate with commas' });
  switch (type) {
    case 'students':
      return [
        select('college', 'College', choices(f.colleges, 'Any college', college)),
        select('branch', 'Branch', choices(f.branches, 'Any branch', branch)),
        select('semester', 'Semester', choices(f.semesters, 'Any semester', semester)),
        text('skills', 'Skills', 'e.g. React, Python'),
      ];
    case 'posts':
      return [select('kind', 'Post type', choices(f.postTypes, 'Any type'))];
    case 'projects':
      return [select('category', 'Category', choices(f.projectCategories, 'Any category')), text('tech', 'Tech stack', 'e.g. React, MongoDB')];
    case 'communities':
      return [
        select('kind', 'Type', choices(f.communityTypes, 'Any type')),
        select('college', 'College', choices(f.colleges, 'Any college', college)),
        select('branch', 'Branch', choices(f.branches, 'Any branch', branch)),
      ];
    case 'opportunities':
      return [
        select('kind', 'Type', choices(f.opportunityTypes, 'Any type')),
        select('mode', 'Mode', choices(f.opportunityModes, 'Any mode')),
        text('skills', 'Skills', 'e.g. React, Python'),
        select('deadline', 'Deadline', (f.deadlineFilters ?? [{ id: 'any', label: 'Any deadline' }]).map((item) => ({ value: item.id, label: item.label }))),
        select('college', 'Open to college', choices(f.colleges, 'Any college', college)),
        select('branch', 'Open to branch', choices(f.branches, 'Any branch', branch)),
      ];
    case 'achievements':
      return [select('kind', 'Type', choices(f.achievementTypes, 'Any type')), { key: 'verified', kind: 'checkbox', label: 'Verified by CampusX only' }];
    default:
      return [];
  }
}

function Field({ field, value, onChange }) {
  if (field.kind === 'text') return <TextFilter label={field.label} hint={field.hint} placeholder={field.placeholder} value={value} onChange={(next) => onChange({ [field.key]: next })} />;
  if (field.kind === 'checkbox') {
    return (
      <label className="flex cursor-pointer items-center gap-3 self-end rounded-xl border border-line px-3.5 py-2.5 text-sm font-semibold text-ink has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus">
        <input type="checkbox" checked={value === 'true'} onChange={(event) => onChange({ [field.key]: event.target.checked ? 'true' : '' })} className="size-4 accent-[var(--cx-primary)]" />
        {field.label}
      </label>
    );
  }
  return <Select label={field.label} value={value} onChange={(event) => onChange({ [field.key]: event.target.value })} options={field.options} />;
}

/**
 * Filters and sort for one category. Laptops: a filter bar above the results. Phones: a "Filters" button
 * that opens a bottom sheet. Filters only narrow the search; the server decides what the student may see.
 */
export function SearchFilters({ type, filters, sort, onChange, onSortChange, onClear }) {
  const options = useSearchStore((state) => state.options);
  const [open, setOpen] = useState(false);
  const fields = fieldsFor(type, options?.filters);
  const sorts = options?.sorts?.[type] ?? [{ id: 'relevance', label: 'Best match' }];
  const active = (SEARCH_FILTER_KEYS[type] ?? []).filter((key) => (filters[key] ?? '') !== '' && filters[key] !== FILTER_DEFAULTS[key]).length;
  const valueOf = (key) => filters[key] ?? FILTER_DEFAULTS[key] ?? '';

  if (fields.length === 0) return null;
  const grid = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {fields.map((field) => <Field key={field.key} field={field} value={valueOf(field.key)} onChange={onChange} />)}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={active ? 'secondary' : 'outline'} size="sm" leftIcon={SlidersHorizontal} onClick={() => setOpen(true)} className="md:hidden" aria-haspopup="dialog">
          Filters{active > 0 && ` (${active})`}
        </Button>
        {active > 0 && (
          <Button variant="ghost" size="sm" leftIcon={X} onClick={onClear}>
            Clear filters
          </Button>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm font-semibold text-ink-muted">
          Sort
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value)}
            className="h-9 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold text-ink focus:border-primary focus:ring-4 focus:ring-focus focus:outline-none"
          >
            {sorts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <div className="hidden glass-card rounded-3xl border border-line bg-surface p-4 shadow-soft md:block" role="group" aria-label="Filters">
        {grid}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Filters"
        description="Narrow down your results."
        footer={
          <>
            {active > 0 && <Button variant="ghost" onClick={onClear}>Clear</Button>}
            <Button onClick={() => setOpen(false)}>Show results</Button>
          </>
        }
      >
        {grid}
      </Modal>
    </div>
  );
}
