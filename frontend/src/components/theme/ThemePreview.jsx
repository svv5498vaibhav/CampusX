/*
 * Miniature screens drawn with each theme's real tokens: `data-theme-preview` (styles/index.css) declares
 * that theme's variables on the preview element, so its children render exactly as the theme would,
 * whatever theme the page itself is in. Decorative: the option's name and description carry the meaning.
 */

const AMBIENT = [
  'radial-gradient(75% 65% at 8% 0%, var(--ag-ambient-1), transparent 70%)',
  'radial-gradient(60% 60% at 100% 12%, var(--ag-ambient-2), transparent 70%)',
  'radial-gradient(75% 70% at 70% 115%, var(--ag-ambient-3), transparent 70%)',
].join(', ');

const GRADIENT_FILL = { backgroundImage: 'var(--ag-gradient)', color: '#ffffff' };

/** The student app: navigation rail and a profile card with chips and a Follow button. */
export function AppThemePreview({ theme }) {
  const aurora = theme.style === 'aurora';
  return (
    <span data-theme-preview={theme.id} aria-hidden="true" className="relative block h-36 overflow-hidden rounded-xl border border-line bg-canvas text-ink">
      {aurora ? <span className="absolute inset-0" style={{ backgroundImage: AMBIENT }} /> : <span className="campus-grid absolute inset-0" />}
      <span className="absolute inset-y-0 left-0 flex w-11 flex-col items-center gap-2 border-r border-line bg-surface pt-3">
        <span className="size-5 rounded-md bg-primary" style={aurora ? GRADIENT_FILL : undefined} />
        <span className="mt-1 h-1.5 w-6 rounded-full bg-primary-soft" />
        <span className="h-1.5 w-6 rounded-full bg-surface-muted" />
        <span className="h-1.5 w-6 rounded-full bg-surface-muted" />
        <span className="h-1.5 w-6 rounded-full bg-surface-muted" />
      </span>
      <span className="absolute top-3 right-3 left-14 rounded-lg border border-line bg-surface p-2.5 shadow-soft" style={aurora ? { backgroundImage: 'var(--ag-sheen)' } : undefined}>
        <span className="flex items-center gap-2">
          <span className="size-6 shrink-0 rounded-full bg-primary-soft ring-2 ring-primary/50" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[11px] leading-none font-bold">Aa · Campus</span>
            <span className="mt-1 block h-1.5 w-3/5 rounded-full bg-ink-subtle/40" />
          </span>
        </span>
        <span className="mt-2 block h-1.5 w-full rounded-full bg-ink-subtle/25" />
        <span className="mt-1 block h-1.5 w-4/5 rounded-full bg-ink-subtle/25" />
        <span className="mt-2.5 flex items-center gap-1">
          <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[9px] font-semibold text-primary-soft-fg">React</span>
          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[9px] font-semibold text-accent-fg">DSA</span>
          <span className="ml-auto rounded-md bg-primary px-2 py-0.5 text-[9px] font-bold text-primary-fg" style={aurora ? GRADIENT_FILL : undefined}>
            Follow
          </span>
        </span>
      </span>
    </span>
  );
}

/** The admin control center: header, stat tiles with status and a small activity chart. */
export function AdminThemePreview({ theme }) {
  return (
    <span data-theme-preview={theme.id} aria-hidden="true" className="relative block h-36 overflow-hidden rounded-xl border border-ax-border bg-ax-bg text-ax-text">
      <span className="absolute inset-0" style={{ backgroundImage: AMBIENT }} />
      <span className="admin-grid absolute inset-0" />
      <span className="absolute inset-x-0 top-0 flex h-6 items-center gap-1.5 border-b border-ax-border bg-ax-bg/70 px-2">
        <span className="size-3 rounded-[4px]" style={GRADIENT_FILL} />
        <span className="font-display text-[9px] font-semibold">Control center</span>
        <span className="ml-auto flex items-center gap-1 rounded border border-ax-success/40 px-1 font-mono text-[7px] text-ax-success uppercase">
          <span className="size-1 rounded-full bg-ax-success" /> online
        </span>
      </span>
      <span className="absolute top-6 bottom-0 left-0 w-8 border-r border-ax-border bg-ax-card" />
      <span className="absolute top-8 right-2 left-10 grid grid-cols-3 gap-1.5">
        {[
          ['Reports', '24', 'text-ax-warning', 'Pending'],
          ['Cases', '7', 'text-ax-danger', 'High'],
          ['Students', '1.2k', 'text-ax-success', 'Active'],
        ].map(([label, value, tone, status]) => (
          <span key={label} className="block rounded-md border border-ax-border bg-ax-card bg-[image:var(--ag-sheen)] p-1.5">
            <span className="block text-[7px] font-semibold tracking-wide text-ax-muted uppercase">{label}</span>
            <span className="block font-display text-[13px] leading-tight font-bold">{value}</span>
            <span className={`block text-[7px] font-semibold ${tone}`}>● {status}</span>
          </span>
        ))}
      </span>
      <span className="absolute right-2 bottom-2 left-10 block h-10 rounded-md border border-ax-border bg-ax-card">
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="size-full">
          <polyline fill="none" stroke="var(--ax-series-1)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" points="0,22 15,18 30,20 45,12 60,14 75,8 100,10" />
          <polyline fill="none" stroke="var(--ax-series-2)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" points="0,26 15,24 30,25 45,21 60,22 75,18 100,19" />
        </svg>
      </span>
    </span>
  );
}
