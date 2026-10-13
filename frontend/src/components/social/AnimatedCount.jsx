import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/utils/cn';

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat();

/** 1,284 up to 9,999; 12.5K from there on. */
export const formatCount = (value) => (value >= 10_000 ? compact.format(value) : full.format(value));

const roll = {
  enter: (direction) => ({ y: direction > 0 ? '70%' : '-70%', opacity: 0 }),
  center: { y: '0%', opacity: 1 },
  exit: (direction) => ({ y: direction > 0 ? '-70%' : '70%', opacity: 0 }),
};

/**
 * A number that rolls up when it grows and down when it shrinks (follower counts). Reduced motion: the new
 * number just replaces the old one. The text is always the real number, so screen readers read it as is.
 */
export function AnimatedCount({ value = 0, className }) {
  const reduceMotion = useReducedMotion();
  // Which way the last change went (derived during render, React's pattern for state that follows a prop).
  const [shown, setShown] = useState({ value, direction: 1 });
  if (shown.value !== value) setShown({ value, direction: value > shown.value ? 1 : -1 });
  const { direction } = shown;
  const text = formatCount(value);

  if (reduceMotion) return <span className={cn('tabular-nums', className)}>{text}</span>;

  return (
    <span className={cn('relative inline-flex overflow-hidden align-bottom tabular-nums', className)}>
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.span
          key={value}
          custom={direction}
          variants={roll}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="inline-block"
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
