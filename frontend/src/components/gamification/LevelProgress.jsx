import { motion, useReducedMotion } from 'framer-motion';
import { formatPoints } from '@/constants/gamification';
import { cn } from '@/utils/cn';

/**
 * Progress towards the next level. Every number comes from the API's level object
 * ({ level, name, progressPercentage, pointsToNextLevel, nextLevel, isMaxLevel }).
 */
export function LevelProgress({ level, compact = false, className }) {
  const reduceMotion = useReducedMotion();
  if (!level) return null;
  const label = level.isMaxLevel ? 'Top level reached' : `${formatPoints(level.pointsToNextLevel)} XP to Level ${level.nextLevel}`;
  return (
    <div className={className}>
      {!compact && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
          <span className="font-semibold text-ink">Level {level.level} · {level.name}</span>
          <span className="font-semibold text-primary">{level.progressPercentage}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={`Progress to level ${level.isMaxLevel ? level.level : level.nextLevel}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={level.progressPercentage}
        aria-valuetext={`${level.progressPercentage}%. ${label}`}
        className={cn('overflow-hidden rounded-full bg-surface-muted', compact ? 'h-2' : 'h-2.5')}
      >
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={reduceMotion ? false : { width: 0 }}
          animate={{ width: `${level.progressPercentage}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <p className="mt-1.5 text-xs text-ink-muted">{label}</p>
    </div>
  );
}
