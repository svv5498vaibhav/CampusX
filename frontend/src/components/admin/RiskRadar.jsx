import { OctagonAlert, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { ChartTable } from './AdminChart';

/*
 * Active moderation cases by risk level (Phase 13's low · medium · high · critical), as segmented meters.
 * Each level carries its status colour, icon and name, and the exact count is always written out.
 */

const LEVELS = [
  { id: 'low', label: 'Low', icon: ShieldCheck, color: 'var(--ax-success)' },
  { id: 'medium', label: 'Medium', icon: TriangleAlert, color: 'var(--ax-warning)' },
  { id: 'high', label: 'High', icon: ShieldAlert, color: 'var(--ax-serious)' },
  { id: 'critical', label: 'Critical', icon: OctagonAlert, color: 'var(--ax-danger)' },
];
const CELLS = 20;

export function RiskRadar({ levels, caption = 'Active cases by risk level' }) {
  const values = levels ?? {};
  const max = Math.max(0, ...LEVELS.map((level) => values[level.id] ?? 0));
  const total = LEVELS.reduce((sum, level) => sum + (values[level.id] ?? 0), 0);

  return (
    <figure>
      <ul className="space-y-3.5" aria-label={caption}>
        {LEVELS.map(({ id, label, icon: Icon, color }) => {
          const count = values[id] ?? 0;
          const filled = max ? Math.round((count / max) * CELLS) : 0;
          return (
            <li key={id} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3">
              <span className="flex items-center gap-1.5 font-mono text-xs tracking-wider uppercase" style={{ color }}>
                <Icon className="size-3.5" aria-hidden="true" />
                {label}
              </span>
              <span className="flex h-3 gap-[2px]" aria-hidden="true">
                {Array.from({ length: CELLS }, (_, index) => (
                  <span key={index} className="h-full flex-1 rounded-[2px]" style={{ backgroundColor: index < filled ? color : 'var(--ax-chart-grid)', opacity: index < filled ? 0.35 + (0.65 * (index + 1)) / Math.max(1, filled) : 1 }} />
                ))}
              </span>
              <span className="text-right font-mono text-sm font-semibold text-ax-text tabular-nums">{count}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 font-mono text-[11px] text-ax-subtle">
        {total} active {total === 1 ? 'case' : 'cases'} · Phase 13 risk scoring
      </p>
      <ChartTable caption={caption} columns={['Risk level', 'Active cases']} rows={LEVELS.map((level) => [level.label, String(values[level.id] ?? 0)])} />
    </figure>
  );
}
