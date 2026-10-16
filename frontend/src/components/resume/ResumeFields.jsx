import { useId, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { fieldClassName } from '@/components/ui/FormField';
import { MONTH_OPTIONS } from '@/constants/resume';
import { cn } from '@/utils/cn';
import { move } from '@/utils/resume/content';

const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: thisYear + 7 - 1990 + 1 }, (_, index) => String(thisYear + 7 - index));
const selectClass = cn(fieldClassName(false), 'h-11 appearance-none pr-8');

/**
 * Month and year as two selects (works in every browser, unlike <input type="month">). Value: '' | 'YYYY'
 * | 'YYYY-MM', or 'present' when `allowPresent` and the "Present" box is ticked.
 */
export function MonthYearField({ label, value = '', onChange, allowPresent = false, presentLabel = 'Present', hint, error }) {
  const id = useId();
  const isPresent = value === 'present';
  const [year, month] = isPresent ? ['', ''] : value.split('-');
  const set = (nextYear, nextMonth) => onChange(nextYear ? (nextMonth ? `${nextYear}-${nextMonth}` : nextYear) : '');
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold text-ink">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-month`} className="sr-only">{`${label}: month`}</label>
        <select id={`${id}-month`} value={month ?? ''} disabled={isPresent} onChange={(event) => set(year || String(thisYear), event.target.value)} className={cn(selectClass, 'w-24')}>
          <option value="">Month</option>
          {MONTH_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <label htmlFor={`${id}-year`} className="sr-only">{`${label}: year`}</label>
        <select id={`${id}-year`} value={year ?? ''} disabled={isPresent} onChange={(event) => set(event.target.value, event.target.value ? month : '')} className={cn(selectClass, 'w-24')}>
          <option value="">Year</option>
          {YEARS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        {allowPresent && (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-1 text-sm font-medium text-ink-muted">
            <input type="checkbox" checked={isPresent} onChange={(event) => onChange(event.target.checked ? 'present' : '')} className="size-4 accent-[var(--cx-primary)]" />
            {presentLabel}
          </label>
        )}
      </div>
      {error ? <p role="alert" className="mt-1.5 text-xs font-medium text-danger-fg">{error}</p> : hint && <p className="mt-1.5 text-xs text-ink-subtle">{hint}</p>}
    </fieldset>
  );
}

/** Bullet points: one textarea each, with add, remove and reorder. */
export function BulletEditor({ label = 'Bullet points', items, onChange, max, placeholder, hint, actions }) {
  const id = useId();
  const update = (index, value) => onChange(items.map((item, position) => (position === index ? value : item)));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id={id} className="text-sm font-semibold text-ink">
          {label} <span className="font-normal text-ink-subtle">({items.length}/{max})</span>
        </span>
        {actions}
      </div>
      {hint && <p className="-mt-1 text-xs text-ink-subtle">{hint}</p>}
      <ul className="flex flex-col gap-2" aria-labelledby={id}>
        {items.map((item, index) => (
          // Bullets have no ids of their own; the position is the identity while editing.
          <li key={index} className="flex items-start gap-2">
            <span className="mt-4 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
            <textarea
              value={item}
              rows={2}
              maxLength={400}
              placeholder={placeholder}
              aria-label={`${label} ${index + 1}`}
              onChange={(event) => update(index, event.target.value.replace(/\n/g, ' '))}
              className={cn(fieldClassName(false), 'min-h-11 resize-y py-2.5 leading-relaxed')}
            />
            <div className="flex shrink-0 flex-col gap-1">
              <IconButton label={`Move point ${index + 1} up`} icon={ArrowUp} disabled={index === 0} onClick={() => onChange(move(items, index, index - 1))} />
              <IconButton label={`Remove point ${index + 1}`} icon={X} onClick={() => onChange(items.filter((_, position) => position !== index))} />
            </div>
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" leftIcon={Plus} className="self-start" disabled={items.length >= max} onClick={() => onChange([...items, ''])}>
        Add a point
      </Button>
    </div>
  );
}

export function IconButton({ label, icon: Icon, onClick, disabled, className, tone = 'default' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-8 place-items-center rounded-lg text-ink-subtle transition-colors disabled:pointer-events-none disabled:opacity-35',
        tone === 'danger' ? 'hover:bg-danger-soft hover:text-danger-fg' : 'hover:bg-surface-muted hover:text-ink',
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}

/**
 * A list of entries (projects, education, ...), each in a collapsible card with move up/down and remove.
 * `renderItem(item, update)` draws the fields; `title(item)` names the card; `openId` starts that entry open.
 */
export function ItemList({ items, onChange, renderItem, title, newItem, addLabel, max, emptyText, itemNoun = 'entry', testId, openId }) {
  // Opens the entry a checker "Fix" link points at, or the only entry there is.
  const [open, setOpen] = useState(() => new Set(openId && items.some((item) => item.id === openId) ? [openId] : items.length === 1 ? [items[0].id] : []));
  const toggle = (itemId) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    return next;
  });
  const add = () => {
    const item = newItem();
    onChange([...items, item]);
    setOpen((current) => new Set(current).add(item.id));
  };
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      {!items.length && emptyText && <p className="rounded-2xl border border-dashed border-line-strong px-4 py-5 text-center text-sm text-ink-muted">{emptyText}</p>}
      {items.map((item, index) => {
        const isOpen = open.has(item.id);
        const name = title(item) || `Untitled ${itemNoun}`;
        const panelId = `item-${item.id}`;
        return (
          <section key={item.id} className="rounded-2xl border border-line bg-surface" data-item-id={item.id}>
            <div className="flex items-center gap-1 py-1.5 pr-1.5 pl-2">
              <button type="button" onClick={() => toggle(item.id)} aria-expanded={isOpen} aria-controls={panelId} className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-surface-muted">
                <ChevronDown className={cn('size-4 shrink-0 text-ink-subtle transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
                <span className={cn('truncate text-sm font-semibold', title(item) ? 'text-ink' : 'text-ink-subtle')}>{name}</span>
              </button>
              <IconButton label={`Move ${name} up`} icon={ArrowUp} disabled={index === 0} onClick={() => onChange(move(items, index, index - 1))} />
              <IconButton label={`Move ${name} down`} icon={ArrowDown} disabled={index === items.length - 1} onClick={() => onChange(move(items, index, index + 1))} />
              <IconButton label={`Remove ${name}`} icon={Trash2} tone="danger" onClick={() => onChange(items.filter((entry) => entry.id !== item.id))} />
            </div>
            {isOpen && (
              <div id={panelId} className="border-t border-line px-4 pt-4 pb-5">
                {renderItem(item, (patch) => onChange(items.map((entry) => (entry.id === item.id ? { ...entry, ...patch } : entry))))}
              </div>
            )}
          </section>
        );
      })}
      <Button variant="outline" leftIcon={Plus} onClick={add} disabled={items.length >= max} className="self-start">
        {addLabel}
      </Button>
      {items.length >= max && <p className="text-xs text-ink-subtle">You’ve reached the limit of {max}.</p>}
    </div>
  );
}

/** Two fields side by side from `sm` up. */
export const FieldRow = ({ children, className }) => <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;

/** A step's own heading and intro inside the editor card. */
export function StepIntro({ title, description, children }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 tabIndex={-1} className="font-display text-xl font-bold text-ink focus:outline-none">{title}</h2>
        {description && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** A sub-section inside a step ("Internships", "Certifications" ...). */
export function SubSection({ title, description, children, id }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-6 first:border-t-0 first:pt-0" aria-labelledby={id}>
      <div>
        <h3 id={id} className="font-display text-base font-bold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}
