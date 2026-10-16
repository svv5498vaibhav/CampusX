import { useEffect, useId, useRef, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { FeedFilters } from '@/components/feed/FeedFilters';
import { Button, Input, Select } from '@/components/ui';
import { cn } from '@/utils/cn';

// Filters inside the "More filters" panel (the type chips and sort are always visible).
const PANEL_FILTERS = ['mode', 'deadline', 'location', 'skills', 'college', 'branch', 'semester', 'eligible'];
const PANEL_DEFAULTS = { mode: '', deadline: 'any', location: '', skills: '', college: '', branch: '', semester: '', eligible: '' };

/** A text filter applied after a short pause in typing. */
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
      maxLength={80}
      onChange={(event) => {
        setDraft(event.target.value);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onChange(event.target.value.trim()), 400);
      }}
    />
  );
}

/**
 * Type chips, sort, and a small panel for the rest: mode, deadline, location, skills and who it is
 * open to (college, branch, semester). "Only ones I'm eligible for" is checked by the server against the
 * student's own profile.
 */
export function OpportunityFilters({ filters, onChange, options }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const active = PANEL_FILTERS.filter((key) => String(filters[key] ?? '') !== String(PANEL_DEFAULTS[key])).length;
  const choices = (list, all, map = (item) => ({ value: item.id, label: item.label })) => [{ value: '', label: all }, ...(list ?? []).map(map)];

  return (
    <div className="flex flex-col gap-3">
      <FeedFilters filters={options?.filters} value={filters.type} onChange={(type) => onChange({ type })} label="Opportunity types" />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={open || active ? 'secondary' : 'outline'}
          size="sm"
          leftIcon={SlidersHorizontal}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
        >
          Filters{active > 0 && ` (${active})`}
        </Button>
        {active > 0 && (
          <Button variant="ghost" size="sm" leftIcon={X} onClick={() => onChange(PANEL_DEFAULTS)}>
            Clear filters
          </Button>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm font-semibold text-ink-muted">
          Sort
          <select
            value={filters.sort}
            onChange={(event) => onChange({ sort: event.target.value })}
            className="h-9 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold text-ink focus:border-primary focus:ring-4 focus:ring-focus focus:outline-none"
          >
            {(options?.sorts ?? [{ id: 'deadline', label: 'Deadline soon' }]).map((sort) => (
              <option key={sort.id} value={sort.id}>{sort.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div id={panelId} hidden={!open} className={cn('glass-card rounded-3xl border border-line bg-surface p-4 shadow-soft sm:p-5', !open && 'hidden')}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Mode" value={filters.mode} onChange={(event) => onChange({ mode: event.target.value })} options={choices(options?.modes, 'Any mode')} />
          <Select
            label="Deadline"
            value={filters.deadline}
            onChange={(event) => onChange({ deadline: event.target.value })}
            options={(options?.deadlineFilters ?? [{ id: 'any', label: 'Any deadline' }]).map((item) => ({ value: item.id, label: item.label }))}
          />
          <TextFilter label="Location" value={filters.location} onChange={(location) => onChange({ location })} placeholder="e.g. Nagpur" />
          <TextFilter label="Skills" value={filters.skills} onChange={(skills) => onChange({ skills })} placeholder="e.g. React, Python" hint="Separate skills with commas" />
          <Select
            label="Open to college"
            value={filters.college}
            onChange={(event) => onChange({ college: event.target.value })}
            options={choices(options?.colleges, 'Any college', (college) => ({ value: college.id, label: college.shortName }))}
          />
          <Select
            label="Open to branch"
            value={filters.branch}
            onChange={(event) => onChange({ branch: event.target.value })}
            options={choices(options?.branches, 'Any branch', (branch) => ({ value: branch.id, label: branch.shortName }))}
          />
          <Select
            label="Open to semester"
            value={String(filters.semester)}
            onChange={(event) => onChange({ semester: event.target.value })}
            options={choices(options?.semesters, 'Any semester', (semester) => ({ value: String(semester.value), label: semester.label }))}
          />
          <label className="flex cursor-pointer items-center gap-3 self-end rounded-xl border border-line px-3.5 py-2.5 text-sm font-semibold text-ink has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus">
            <input
              type="checkbox"
              checked={filters.eligible === 'true'}
              onChange={(event) => onChange({ eligible: event.target.checked ? 'true' : '' })}
              className="size-4 accent-[var(--cx-primary)]"
            />
            Only ones I’m eligible for
          </label>
        </div>
      </div>
    </div>
  );
}
