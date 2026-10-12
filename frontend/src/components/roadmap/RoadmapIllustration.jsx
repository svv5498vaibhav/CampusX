import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/utils/cn';

// Eight stops on a gently rising path (viewBox 320 × 140).
const POINTS = [
  [22, 112],
  [62, 84],
  [102, 98],
  [142, 64],
  [182, 76],
  [222, 44],
  [262, 56],
  [298, 24],
];
const PATH = POINTS.slice(1).reduce((d, [x, y], index) => {
  const [px, py] = POINTS[index];
  return `${d} C ${px + 18} ${py} ${x - 18} ${y} ${x} ${y}`;
}, `M ${POINTS[0][0]} ${POINTS[0][1]}`);

const NODE = {
  completed: 'fill-primary stroke-primary',
  'in-progress': 'fill-surface stroke-primary',
  'needs-attention': 'fill-accent-soft stroke-sun-400',
  upcoming: 'fill-surface stroke-line-strong',
};

/**
 * Decorative journey path for the hero: one stop per semester, coloured by its real state, with the
 * current semester ringed. Drawn once on arrival; nothing loops.
 */
export function RoadmapIllustration({ semesters, className }) {
  const reduceMotion = useReducedMotion();
  return (
    <svg viewBox="0 0 320 140" className={cn('h-auto w-full', className)} aria-hidden="true" focusable="false">
      <path d={PATH} fill="none" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 7" className="stroke-line-strong" />
      <motion.path
        d={PATH}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        className="stroke-primary/50"
        initial={reduceMotion ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
      />
      {semesters.map((semester, index) => {
        const [cx, cy] = POINTS[index];
        return (
          <g key={semester.semester}>
            {semester.isCurrent && <circle cx={cx} cy={cy} r="14" className="fill-primary/15" />}
            <motion.circle
              cx={cx}
              cy={cy}
              r={semester.isCurrent ? 8 : 6}
              strokeWidth="2.5"
              className={NODE[semester.state] ?? NODE.upcoming}
              initial={reduceMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              style={{ transformOrigin: `${cx}px ${cy}px` }}
              transition={{ delay: reduceMotion ? 0 : 0.25 + index * 0.08, type: 'spring', stiffness: 380, damping: 22 }}
            />
          </g>
        );
      })}
      {/* Mortarboard at the end of the path. */}
      <g transform="translate(286 -2)" className="fill-primary">
        <path d="M12 2 1 7l11 5 11-5-11-5Z" />
        <path d="M5 9.5v4.2c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V9.5l-7 3.2-7-3.2Z" className="fill-primary/70" />
      </g>
    </svg>
  );
}
