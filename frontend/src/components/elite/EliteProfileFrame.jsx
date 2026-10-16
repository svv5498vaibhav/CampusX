import { AnimatePresence, motion } from 'framer-motion';
import { eliteTierOf } from '@/constants/elite';
import { cn } from '@/utils/cn';
import { EASE } from '@/utils/motion';

// Ring width, corner radius (matching components/ui/Avatar.jsx squircles) and emblem size per avatar size.
const SIZES = {
  xs: { ring: '1.5px', radius: '0.5rem', emblem: null },
  sm: { ring: '2px', radius: '0.75rem', emblem: null },
  md: { ring: '2px', radius: '0.75rem', emblem: '1rem' },
  lg: { ring: '3px', radius: '1rem', emblem: '1.3rem' },
  xl: { ring: '3px', radius: '1.5rem', emblem: '1.65rem' },
  '2xl': { ring: '4px', radius: '2rem', emblem: '2.25rem' },
};

/**
 * The photo frame of a Gold, Silver or Bronze token holder: a metallic ring just outside the photo (so a
 * face is never covered, cropped or squeezed; photos, initials and missing photos all look right) and the
 * tier's emblem in the top corner (crown for gold, shield for silver and bronze). For everyone else it is
 * the same box without a ring, so gaining or losing a token never shifts the layout; the ring and emblem
 * cross-fade when the tier changes.
 *
 *   shape      'circle' | 'squircle', as the Avatar inside
 *   glow       a soft halo (gold breathes slowly): only where a student is featured
 *   placement  'outside' (default) or 'inside': the ring fills the wrapper's own padding, for a photo that
 *              already has a border (the profile header)
 */
export function EliteProfileFrame({ eliteRank, size = 'md', shape = 'squircle', glow = false, emblem, placement = 'outside', className, children }) {
  const tier = eliteTierOf(eliteRank);
  const preset = SIZES[size] ?? SIZES.md;
  const showEmblem = emblem ?? Boolean(preset.emblem);
  const Icon = tier?.icon;
  const style = { '--elite-ring': preset.ring, '--elite-radius': shape === 'circle' ? '9999px' : preset.radius, '--elite-emblem': preset.emblem ?? '1rem' };

  return (
    <span
      className={cn('elite-frame relative inline-flex shrink-0', tier && `elite-frame--${tier.id}`, tier && glow && 'elite-frame--glow', placement === 'inside' && 'elite-frame--inside', className)}
      style={style}
      data-elite-frame={tier?.id}
    >
      {children}
      <AnimatePresence initial={false}>
        {tier && (
          <motion.span
            key={tier.id}
            aria-hidden="true"
            className={cn('elite-frame__ring', `elite-tier--${tier.id}`)}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.5, ease: EASE }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {tier && showEmblem && (
          <motion.span
            key={tier.id}
            aria-hidden="true"
            className={cn('elite-frame__emblem', `elite-tier--${tier.id}`)}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
          >
            <Icon strokeWidth={2.4} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
