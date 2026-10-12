import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/utils/cn';

const EASE = [0.22, 1, 0.36, 1];

/**
 * A circular progress indicator for a real percentage from the server. It fills from empty on first
 * show and moves smoothly when the value changes (instantly with reduced motion).
 */
export function RoadmapProgressRing({ value, size = 120, stroke = 10, label, valueText, className, children }) {
  const reduceMotion = useReducedMotion();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={valueText ?? `${clamped}%`}
      className={cn('relative grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-surface-muted" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap={clamped > 0 ? 'round' : 'butt'}
          strokeDasharray={circumference}
          className="stroke-primary"
          initial={reduceMotion ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
          transition={{ duration: reduceMotion ? 0 : 0.9, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
