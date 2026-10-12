import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { SERIES } from '@/constants/admin';
import { cn } from '@/utils/cn';

/*
 * Admin charts in plain SVG (no chart library). Every value is a number the API counted; nothing is
 * smoothed or projected.
 *
 * Marks follow one spec: 2px lines with round joins, 8px end dots with a 2px surface ring, hairline solid
 * gridlines, bars at most 12px thick with a 4px rounded data end, a 2px surface gap between donut
 * segments. Series colours come from the validated --ax-series-* tokens in a fixed order and follow the
 * series, not its rank. Two or more series always get a legend; every chart has a data table view and a
 * hover/keyboard readout.
 */

const dayLabel = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const formatDay = (day) => dayLabel.format(new Date(`${day}T12:00:00`));
const number = (value) => Number(value ?? 0).toLocaleString();

/** Width of an element, kept up to date (so the SVG is drawn at its real size, text never stretched). */
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const update = () => setWidth(ref.current?.getBoundingClientRect().width ?? 0);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** A clean axis maximum and 4 ticks (0, 1·step … 4·step) with steps of 1, 2 or 5 × 10ⁿ. */
function niceTicks(max) {
  if (max <= 0) return [0, 1, 2, 3, 4];
  const raw = max / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((candidate) => candidate >= raw);
  const whole = Math.max(1, Math.ceil(step));
  return [0, 1, 2, 3, 4].map((index) => index * whole);
}

export function LegendLine({ color }) {
  return <span aria-hidden="true" className="inline-block h-0.5 w-3.5 rounded-full" style={{ backgroundColor: color }} />;
}

/** Data table view for any chart (always available, collapsed by default). */
export function ChartTable({ caption, columns, rows }) {
  return (
    <details className="group mt-3 text-sm">
      <summary className="cursor-pointer list-none font-mono text-[11px] tracking-[0.14em] text-ax-subtle uppercase hover:text-ax-muted focus-visible:text-ax-text">
        <span className="group-open:hidden">▸ View data table</span>
        <span className="hidden group-open:inline">▾ Hide data table</span>
      </summary>
      <div className="relative mt-2 max-h-64 overflow-auto rounded-lg border border-ax-border">
        <table className="w-full text-left text-xs tabular-nums">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-ax-bg-2 text-ax-subtle">
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="px-3 py-2 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ax-border/60 text-ax-text">
            {rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, index) => (
                  <td key={columns[index]} className={cn('px-3 py-1.5', index > 0 && 'text-right')}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Daily counts over time. series: [{ id, label, values, color? }] (colours default to the fixed series
 * order). One series: an area wash and no legend box; two or more: a legend with each series' total.
 */
export function LineChart({ days, series, height = 220, caption, className }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(null);
  const gradientId = useId().replace(/:/g, '');
  const colored = series.map((item, index) => ({ ...item, color: item.color ?? SERIES[index % SERIES.length] }));
  const max = Math.max(0, ...colored.flatMap((item) => item.values));
  const ticks = niceTicks(max);
  const top = ticks.at(-1);
  const pad = { top: 12, right: 14, bottom: 26, left: 34 };
  const plotWidth = Math.max(0, width - pad.left - pad.right);
  const plotHeight = height - pad.top - pad.bottom;
  const x = (index) => pad.left + (days.length <= 1 ? plotWidth / 2 : (index / (days.length - 1)) * plotWidth);
  const y = (value) => pad.top + plotHeight - (value / top) * plotHeight;
  const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(plotWidth / 70))));

  const indexAt = (clientX) => {
    const rect = ref.current.getBoundingClientRect();
    const position = clientX - rect.left - pad.left;
    return Math.max(0, Math.min(days.length - 1, Math.round((position / Math.max(1, plotWidth)) * (days.length - 1))));
  };
  const onKey = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = active ?? days.length - 1;
    const next = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: days.length - 1 }[event.key];
    setActive(Math.max(0, Math.min(days.length - 1, next)));
  };
  const totals = colored.map((item) => item.values.reduce((sum, value) => sum + value, 0));
  const tooltipLeft = active === null ? 0 : Math.min(Math.max(x(active) + 12, 8), Math.max(8, width - 170));

  return (
    <figure className={cn('min-w-0', className)}>
      {colored.length > 1 && (
        <figcaption className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ax-muted">
          {colored.map((item, index) => (
            <span key={item.id} className="inline-flex items-center gap-1.5">
              <LegendLine color={item.color} />
              {item.label}
              <span className="font-mono text-ax-text tabular-nums">{number(totals[index])}</span>
            </span>
          ))}
        </figcaption>
      )}
      <div
        ref={ref}
        className="relative outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-ax-violet/60"
        style={{ height }}
        tabIndex={0}
        role="img"
        aria-label={`${caption}. ${colored.map((item, index) => `${item.label}: ${number(totals[index])} in total`).join('; ')}. Use the arrow keys to read each day.`}
        onPointerMove={(event) => width && setActive(indexAt(event.clientX))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((current) => current ?? days.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
      >
        {width > 0 && (
          <svg width={width} height={height} className="block overflow-visible" aria-hidden="true">
            {colored.length === 1 && (
              <defs>
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={colored[0].color} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={colored[0].color} stopOpacity="0.02" />
                </linearGradient>
              </defs>
            )}
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="var(--ax-chart-grid)" strokeWidth="1" />
                <text x={pad.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-ax-subtle font-mono text-[10px] tabular-nums">
                  {number(tick)}
                </text>
              </g>
            ))}
            {days.map((day, index) =>
              index % labelEvery === 0 || index === days.length - 1 ? (
                (index === days.length - 1 || days.length - 1 - index >= labelEvery / 2) && (
                  <text key={day} x={x(index)} y={height - 6} textAnchor="middle" className="fill-ax-subtle text-[10px]">
                    {formatDay(day)}
                  </text>
                )
              ) : null,
            )}
            {colored.length === 1 && (
              <path
                d={`M${x(0)},${y(0)} ${colored[0].values.map((value, index) => `L${x(index)},${y(value)}`).join(' ')} L${x(days.length - 1)},${y(0)} Z`}
                fill={`url(#${gradientId})`}
              />
            )}
            {colored.map((item) => (
              <polyline key={item.id} fill="none" stroke={item.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')} />
            ))}
            {active === null &&
              colored.map((item) => <circle key={item.id} cx={x(days.length - 1)} cy={y(item.values.at(-1) ?? 0)} r="4" fill={item.color} stroke="var(--ax-card)" strokeWidth="2" />)}
            {active !== null && (
              <g>
                <line x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + plotHeight} stroke="var(--ax-muted)" strokeOpacity="0.5" strokeWidth="1" />
                {colored.map((item) => (
                  <circle key={item.id} cx={x(active)} cy={y(item.values[active] ?? 0)} r="4" fill={item.color} stroke="var(--ax-card)" strokeWidth="2" />
                ))}
              </g>
            )}
          </svg>
        )}
        {active !== null && width > 0 && (
          <div className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-lg border border-ax-border-strong bg-ax-bg/95 px-3 py-2 text-xs shadow-lg" style={{ left: tooltipLeft }}>
            <p className="font-mono text-[10px] tracking-wider text-ax-subtle uppercase">{formatDay(days[active])}</p>
            <ul className="mt-1 space-y-0.5">
              {colored.map((item) => (
                <li key={item.id} className="flex items-center gap-2">
                  <LegendLine color={item.color} />
                  <span className="font-semibold text-ax-text tabular-nums">{number(item.values[active])}</span>
                  <span className="text-ax-muted">{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <ChartTable caption={caption} columns={['Day', ...colored.map((item) => item.label)]} rows={days.map((day, index) => [formatDay(day), ...colored.map((item) => number(item.values[index]))])} />
    </figure>
  );
}

/**
 * Horizontal bars for magnitude by category (one hue; the value sits at the bar's tip in text ink).
 * items: [{ id, label, value, hint? }]
 */
export function BarList({ items, caption, color = 'var(--ax-series-1)', emptyText = 'Nothing recorded yet.', className }) {
  const max = Math.max(0, ...items.map((item) => item.value));
  if (!items.length || max === 0) return <p className={cn('py-6 text-center text-sm text-ax-subtle', className)}>{emptyText}</p>;
  return (
    <figure className={cn('min-w-0', className)}>
      <ul className="space-y-2.5" aria-label={caption}>
        {items.map((item) => (
          <li key={item.id} className="group grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,11rem)_1fr]" title={`${item.label}: ${number(item.value)}`}>
            <span className="truncate text-sm text-ax-muted group-hover:text-ax-text">{item.label}</span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-3 rounded-r-[4px] transition-[filter] group-hover:brightness-125" style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, backgroundColor: color, maxWidth: 'calc(100% - 3.5rem)' }} />
              <span className="shrink-0 font-mono text-xs text-ax-text tabular-nums">{number(item.value)}</span>
            </span>
          </li>
        ))}
      </ul>
      <ChartTable caption={caption} columns={['Category', 'Count']} rows={items.map((item) => [item.label, number(item.value)])} />
    </figure>
  );
}

/**
 * Parts of a whole. items: [{ id, label, value, color }] — at most four parts (three hues + a neutral,
 * validated all-pairs). The centre shows the total, or the hovered/focused part.
 */
export function DonutChart({ items, caption, totalLabel = 'Total', size = 168, className }) {
  const [active, setActive] = useState(null);
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  const gap = total > 0 && items.filter((item) => item.value > 0).length > 1 ? 2 : 0;
  let offset = 0;
  const arcs = items.map((item) => {
    const length = total ? (item.value / total) * circumference : 0;
    const arc = { ...item, length: Math.max(0, length - gap), offset };
    offset += length;
    return arc;
  });
  const shown = active !== null ? items.find((item) => item.id === active) : null;

  return (
    <div className={cn('@container min-w-0', className)}>
      <figure className="flex min-w-0 flex-col items-center gap-4 @[30rem]:flex-row">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${caption}: ${items.map((item) => `${item.label} ${item.value}`).join(', ')}`}>
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--ax-chart-grid)" strokeWidth="14" />
            {total > 0 &&
              arcs.map((arc) =>
                arc.length > 0 ? (
                  <circle
                    key={arc.id}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={arc.color}
                    strokeWidth={active === arc.id ? 18 : 14}
                    strokeDasharray={`${arc.length} ${circumference - arc.length}`}
                    strokeDashoffset={-arc.offset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    className="cursor-default transition-[stroke-width] duration-150"
                    onPointerEnter={() => setActive(arc.id)}
                    onPointerLeave={() => setActive(null)}
                  />
                ) : null,
              )}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="font-display text-2xl font-bold text-ax-text tabular-nums">{number(shown ? shown.value : total)}</span>
            <span className="max-w-24 truncate text-[11px] text-ax-muted">{shown ? shown.label : totalLabel}</span>
          </div>
        </div>
        <ul className="w-full min-w-0 space-y-1.5 text-sm">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-ax-card-hover focus-visible:bg-ax-card-hover"
                onPointerEnter={() => setActive(item.id)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(item.id)}
                onBlur={() => setActive(null)}
              >
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: item.color }} />
                <span className="min-w-0 flex-1 truncate text-ax-muted">{item.label}</span>
                <span className="font-mono text-xs text-ax-text tabular-nums">{number(item.value)}</span>
                <span className="w-10 text-right font-mono text-[11px] text-ax-subtle tabular-nums">{total ? `${Math.round((item.value / total) * 100)}%` : '0%'}</span>
              </button>
            </li>
          ))}
        </ul>
      </figure>
    </div>
  );
}

/** Re-renders charts quietly while data refreshes (previous frame kept at reduced opacity). */
export function Refetching({ busy, children, className }) {
  const [shown, setShown] = useState(busy);
  useEffect(() => {
    const timer = setTimeout(() => setShown(busy), busy ? 120 : 0);
    return () => clearTimeout(timer);
  }, [busy]);
  return <div className={cn('transition-opacity duration-200', shown && 'pointer-events-none opacity-50', className)}>{children}</div>;
}
