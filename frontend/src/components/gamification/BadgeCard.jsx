import { motion, useReducedMotion } from 'framer-motion';
import { Lock, Sparkles } from 'lucide-react';
import { BADGE_ICONS, RARITY_STYLES } from '@/constants/gamification';
import { cn } from '@/utils/cn';

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** The badge's icon on its rarity tile (locked badges are muted). */
export function BadgeIcon({ badge, size = 'md', locked = false }) {
  const Icon = BADGE_ICONS[badge.icon] ?? Sparkles;
  const tile = locked ? 'bg-surface-muted text-ink-subtle' : (RARITY_STYLES[badge.rarity] ?? RARITY_STYLES.common).tile;
  return (
    <span className={cn('grid shrink-0 place-items-center', size === 'sm' ? 'size-8 rounded-xl' : 'size-12 rounded-2xl', tile)} aria-hidden="true">
      {locked ? <Lock className={size === 'sm' ? 'size-4' : 'size-5'} /> : <Icon className={size === 'sm' ? 'size-4' : 'size-6'} />}
    </span>
  );
}

/** Earned: icon, name, description and date. Locked: what it takes, with progress. */
export function BadgeCard({ badge }) {
  const reduceMotion = useReducedMotion();
  const locked = !badge.earned;
  const rarity = RARITY_STYLES[badge.rarity] ?? RARITY_STYLES.common;
  return (
    <motion.article
      initial={reduceMotion || locked ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn('flex h-full gap-3 rounded-3xl border p-4', locked ? 'border-dashed border-line-strong bg-surface' : 'border-line bg-surface shadow-soft')}
      data-badge={badge.key}
      data-earned={badge.earned}
    >
      <BadgeIcon badge={badge} locked={locked} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <h3 className={cn('font-display font-bold', locked ? 'text-ink-muted' : 'text-ink')}>{badge.name}</h3>
          <span className="text-[11px] font-semibold text-ink-subtle">{rarity.label}</span>
        </div>
        <p className="mt-0.5 text-sm text-ink-muted">{badge.description}</p>
        {badge.earned ? (
          <p className="mt-1.5 text-xs font-semibold text-primary">Earned {dateFormat.format(new Date(badge.earnedAt))}</p>
        ) : (
          badge.progress && (
            <div className="mt-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label={`${badge.name} progress`} aria-valuemin={0} aria-valuemax={badge.progress.target} aria-valuenow={badge.progress.current}>
                <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.round((badge.progress.current / badge.progress.target) * 100)}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-ink-subtle">{badge.progress.current} / {badge.progress.target}</p>
            </div>
          )
        )}
      </div>
    </motion.article>
  );
}

/** Badges in a responsive grid. */
export function BadgeGrid({ badges, label }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={label}>
      {badges.map((badge) => <li key={badge.key}><BadgeCard badge={badge} /></li>)}
    </ul>
  );
}
