import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Ban,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleSlash,
  Clock,
  Eye,
  OctagonAlert,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  X,
} from 'lucide-react';
import {
  ACCOUNT_STATUS_LABELS,
  CASE_STATUS_LABELS,
  CONTENT_STATUS_LABELS,
  REPORT_STATUS_LABELS,
} from '@/constants/admin';
import { getInitials } from '@/utils/string';
import { formatDateTime, formatRelativeTime } from '@/utils/time';
import { cn } from '@/utils/cn';

/*
 * Small building blocks for the admin control center: panels with terminal-style labels, status pills
 * (always icon + text, never colour alone), filter controls, pagination and page states. They use the
 * admin tokens (ax-*) from styles/index.css.
 */

// ----------------------------------------------------------------------------- panels and headings

/** "// THREAT MONITOR" style label. */
export function TerminalLabel({ children, className, as: Component = 'p' }) {
  return (
    <Component className={cn('font-mono text-[11px] font-semibold tracking-[0.18em] text-ax-muted uppercase', className)}>
      <span className="text-ax-neon" aria-hidden="true">
        //{' '}
      </span>
      {children}
    </Component>
  );
}

export function AdminPanel({ label, title, actions, children, className, bodyClassName, as: Component = 'section', ...props }) {
  return (
    <Component className={cn('admin-panel flex min-w-0 flex-col', className)} {...props}>
      {(label || title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ax-border/70 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {label && <TerminalLabel>{label}</TerminalLabel>}
            {title && <h2 className="mt-1 font-display text-base font-bold text-ax-text">{title}</h2>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('min-w-0 flex-1 p-4 sm:p-5', bodyClassName)}>{children}</div>
    </Component>
  );
}

export function AdminPageHeader({ eyebrow, title, description, actions, children }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <TerminalLabel>{eyebrow}</TerminalLabel>}
        <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-ax-text sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ax-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

// ----------------------------------------------------------------------------- buttons

const BUTTON_TONES = {
  primary: 'border-ax-violet/70 bg-ax-violet text-white hover:bg-ax-neon hover:admin-glow',
  ghost: 'border-ax-border bg-ax-card/60 text-ax-text hover:border-ax-violet/60 hover:bg-ax-card-hover',
  danger: 'border-ax-danger/50 bg-ax-danger/10 text-ax-danger hover:bg-ax-danger/20',
  success: 'border-ax-success/40 bg-ax-success/10 text-ax-success hover:bg-ax-success/20',
  warning: 'border-ax-warning/40 bg-ax-warning/10 text-ax-warning hover:bg-ax-warning/20',
  violet: 'border-ax-neon/50 bg-ax-neon/10 text-[#d8ccff] hover:bg-ax-neon/20',
  neutral: 'border-ax-border bg-transparent text-ax-muted hover:text-ax-text hover:bg-ax-card-hover',
};

export function AdminButton({ as: Component = 'button', tone = 'ghost', size = 'md', icon: Icon, loading = false, disabled, className, children, type, ...props }) {
  const native = Component === 'button';
  return (
    <Component
      type={native ? (type ?? 'button') : type}
      disabled={native ? disabled || loading : undefined}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150',
        'disabled:pointer-events-none disabled:opacity-45',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-10 px-3.5 text-sm',
        BUTTON_TONES[tone],
        className,
      )}
      {...props}
    >
      {loading ? <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" /> : Icon && <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} aria-hidden="true" />}
      {children}
    </Component>
  );
}

// ----------------------------------------------------------------------------- status pills

const TONES = {
  success: 'border-ax-success/35 bg-ax-success/10 text-ax-success',
  warning: 'border-ax-warning/35 bg-ax-warning/10 text-ax-warning',
  serious: 'border-ax-serious/35 bg-ax-serious/10 text-ax-serious',
  danger: 'border-ax-danger/40 bg-ax-danger/10 text-ax-danger',
  violet: 'border-ax-violet/45 bg-ax-violet/12 text-[#d8ccff]',
  neutral: 'border-ax-border bg-ax-bg-2 text-ax-subtle',
};

const PILL_SPECS = {
  risk: {
    low: { tone: 'success', icon: ShieldCheck, label: 'Low' },
    medium: { tone: 'warning', icon: TriangleAlert, label: 'Medium' },
    high: { tone: 'serious', icon: ShieldAlert, label: 'High' },
    critical: { tone: 'danger', icon: OctagonAlert, label: 'Critical' },
  },
  case: {
    open: { tone: 'violet', icon: Eye },
    reviewing: { tone: 'warning', icon: Clock },
    resolved: { tone: 'success', icon: CircleCheck },
    dismissed: { tone: 'neutral', icon: CircleSlash },
  },
  report: {
    pending: { tone: 'violet', icon: Eye },
    reviewing: { tone: 'warning', icon: Clock },
    resolved: { tone: 'success', icon: CircleCheck },
    dismissed: { tone: 'neutral', icon: CircleSlash },
    withdrawn: { tone: 'neutral', icon: CircleSlash },
  },
  content: {
    approved: { tone: 'success', icon: CircleCheck },
    flagged: { tone: 'warning', icon: TriangleAlert },
    pending: { tone: 'violet', icon: Clock },
    restricted: { tone: 'serious', icon: ShieldAlert },
    removed: { tone: 'danger', icon: Ban },
  },
  account: {
    active: { tone: 'success', icon: CircleCheck },
    pending: { tone: 'violet', icon: Clock },
    suspended: { tone: 'warning', icon: TriangleAlert },
    blocked: { tone: 'danger', icon: Ban },
    deactivated: { tone: 'neutral', icon: CircleSlash },
  },
};
PILL_SPECS.priority = PILL_SPECS.risk;

const PILL_LABELS = { case: CASE_STATUS_LABELS, report: REPORT_STATUS_LABELS, content: CONTENT_STATUS_LABELS, account: ACCOUNT_STATUS_LABELS };

/** A status with its icon and words: kind is risk · priority · case · report · content · account. */
export function StatusPill({ kind, value, prefix, className }) {
  if (!value) return null;
  const spec = PILL_SPECS[kind]?.[value] ?? { tone: 'neutral' };
  const Icon = spec.icon;
  const label = spec.label ?? PILL_LABELS[kind]?.[value] ?? value;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap', TONES[spec.tone], className)}>
      {Icon && <Icon className="size-3" aria-hidden="true" />}
      {prefix && <span className="font-normal opacity-80">{prefix}</span>}
      {label}
    </span>
  );
}

export function Tag({ children, tone = 'neutral', className }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10.5px] tracking-wide uppercase', TONES[tone], className)}>{children}</span>;
}

// ----------------------------------------------------------------------------- filters

/** One row of segmented filter buttons. tabs: [{ id, label, count? }] */
export function AdminTabs({ tabs, value, onChange, label, className }) {
  return (
    <div role="group" aria-label={label} className={cn('relative -mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1', className)}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id || 'all'}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors',
              active ? 'border-ax-violet/70 bg-ax-violet/15 text-ax-text' : 'border-ax-border bg-ax-card/50 text-ax-muted hover:border-ax-border-strong hover:text-ax-text',
            )}
          >
            {tab.label}
            {typeof tab.count === 'number' && <span className={cn('rounded px-1.5 py-px font-mono text-[11px]', active ? 'bg-ax-violet/30 text-white' : 'bg-ax-bg-2 text-ax-subtle')}>{tab.count.toLocaleString()}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A compact labelled native select for filter rows. options: [{ value, label }] */
export function FilterSelect({ label, value, onChange, options, className }) {
  return (
    <label className={cn('relative flex min-w-0 flex-col gap-1', className)}>
      <span className="font-mono text-[10px] tracking-[0.16em] text-ax-subtle uppercase">{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full appearance-none rounded-lg border border-ax-border bg-ax-bg-2 pr-8 pl-3 text-sm text-ax-text outline-none hover:border-ax-border-strong focus:border-ax-violet"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ax-subtle" aria-hidden="true" />
      </span>
    </label>
  );
}

export function FilterDate({ label, value, onChange, className }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="font-mono text-[10px] tracking-[0.16em] text-ax-subtle uppercase">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-lg border border-ax-border bg-ax-bg-2 px-2.5 text-sm text-ax-text outline-none [color-scheme:dark] hover:border-ax-border-strong focus:border-ax-violet"
      />
    </label>
  );
}

/** Search box that applies on Enter or after a short pause. */
export function SearchField({ value, onSearch, placeholder = 'Search', label = 'Search', className }) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  useEffect(() => {
    if (text === (value ?? '')) return undefined;
    const timer = setTimeout(() => onSearch(text.trim()), 400);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <form
      role="search"
      className={cn('relative min-w-0', className)}
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(text.trim());
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-[0.16em] text-ax-subtle uppercase">{label}</span>
        <span className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ax-subtle" aria-hidden="true" />
          <input
            type="search"
            value={text}
            maxLength={80}
            onChange={(event) => setText(event.target.value)}
            placeholder={placeholder}
            className="h-9 w-full rounded-lg border border-ax-border bg-ax-bg-2 pr-8 pl-9 text-sm text-ax-text outline-none placeholder:text-ax-subtle hover:border-ax-border-strong focus:border-ax-violet [&::-webkit-search-cancel-button]:hidden"
          />
          {text && (
            <button type="button" onClick={() => { setText(''); onSearch(''); }} className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-ax-subtle hover:text-ax-text" aria-label="Clear search">
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </span>
      </label>
    </form>
  );
}

export function FilterBar({ children, className }) {
  return <div className={cn('grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end', className)}>{children}</div>;
}

// ----------------------------------------------------------------------------- pagination and states

export function AdminPagination({ pagination, onPage, className }) {
  if (!pagination || pagination.total <= pagination.limit) return null;
  const { page, limit, total } = pagination;
  const pages = Math.max(1, Math.ceil(total / limit));
  const first = (page - 1) * limit + 1;
  const last = Math.min(total, page * limit);
  return (
    <nav aria-label="Pages" className={cn('flex flex-wrap items-center justify-between gap-3 pt-4 text-sm text-ax-muted', className)}>
      <p className="font-mono text-xs">
        {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-2">
        <AdminButton size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </AdminButton>
        <span className="font-mono text-xs">
          {page} / {pages}
        </span>
        <AdminButton size="sm" disabled={!pagination.hasMore} onClick={() => onPage(page + 1)}>
          Next <ChevronRight className="size-3.5" aria-hidden="true" />
        </AdminButton>
      </div>
    </nav>
  );
}

export function AdminLoading({ label = 'Loading', className }) {
  return (
    <div role="status" className={cn('flex min-h-40 flex-col items-center justify-center gap-3 text-ax-muted', className)}>
      <span className="relative flex size-8 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-ax-violet/25 motion-reduce:animate-none" />
        <span className="size-3 rounded-full bg-ax-neon" />
      </span>
      <span className="font-mono text-xs tracking-[0.16em] uppercase">{label}…</span>
    </div>
  );
}

export function AdminEmpty({ icon: Icon = Search, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ax-border px-6 py-10 text-center', className)}>
      <span className="grid size-11 place-items-center rounded-xl border border-ax-border bg-ax-bg-2 text-ax-muted">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <p className="font-semibold text-ax-text">{title}</p>
      {description && <p className="max-w-md text-sm text-ax-muted">{description}</p>}
      {action}
    </div>
  );
}

export function AdminError({ error, onRetry, title = 'Couldn’t load this', className }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 rounded-xl border border-ax-danger/30 bg-ax-danger/5 px-6 py-8 text-center', className)}>
      <OctagonAlert className="size-6 text-ax-danger" aria-hidden="true" />
      <div>
        <p className="font-semibold text-ax-text">{title}</p>
        <p className="mt-1 text-sm text-ax-muted">{error?.message ?? 'Something went wrong.'}</p>
      </div>
      {onRetry && (
        <AdminButton size="sm" icon={RefreshCw} onClick={onRetry}>
          Try again
        </AdminButton>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------- small pieces

export function TimeAgo({ value, className }) {
  if (!value) return <span className={className}>—</span>;
  return (
    <time dateTime={new Date(value).toISOString()} title={formatDateTime(value)} className={cn('whitespace-nowrap', className)}>
      {formatRelativeTime(value)}
    </time>
  );
}

export const shortId = (id) => (id ? `#${String(id).slice(-6).toUpperCase()}` : '—');

const AVATAR_SIZES = { xs: 'size-6 text-[10px] rounded-md', sm: 'size-8 text-xs rounded-lg', md: 'size-10 text-sm rounded-lg', lg: 'size-16 text-xl rounded-2xl' };

/** Photo, or violet initials when there is none (or it fails to load). */
export function AdminAvatar({ src, name = '', size = 'sm', className }) {
  const [failed, setFailed] = useState(false);
  const classes = cn('shrink-0 overflow-hidden border border-ax-border', AVATAR_SIZES[size], className);
  if (src && !failed) return <img src={src} alt="" className={cn(classes, 'object-cover')} onError={() => setFailed(true)} />;
  return (
    <span aria-hidden="true" className={cn(classes, 'grid place-items-center bg-ax-deep/30 font-semibold text-[#d8ccff]')}>
      {getInitials(name) || '?'}
    </span>
  );
}

export function PersonChip({ person, className, meta }) {
  if (!person) return <span className={cn('text-sm text-ax-subtle', className)}>—</span>;
  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)}>
      <AdminAvatar src={person.avatarUrl} name={person.name} size="xs" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ax-text">{person.name}</span>
        {meta && <span className="block truncate text-xs text-ax-subtle">{meta}</span>}
      </span>
    </span>
  );
}

/** Label/value rows (detail panels). items: [{ label, value }] */
export function KeyValues({ items, columns = 2, className }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1', className)}>
      {items
        .filter((item) => item && item.value !== undefined)
        .map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="font-mono text-[10px] tracking-[0.16em] text-ax-subtle uppercase">{item.label}</dt>
            <dd className="mt-0.5 text-sm break-words text-ax-text">{item.value ?? '—'}</dd>
          </div>
        ))}
    </dl>
  );
}

/** Fades a block in once (cards, rows). Motion is skipped when the OS asks for reduced motion. */
export function Reveal({ children, delay = 0, className, as = 'div' }) {
  const Component = motion[as];
  return (
    <Component className={className} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </Component>
  );
}
