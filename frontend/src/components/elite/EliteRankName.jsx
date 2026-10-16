import { useState } from 'react';
import { motion } from 'framer-motion';
import { eliteTierOf } from '@/constants/elite';
import { EASE } from '@/utils/motion';
import { cn } from '@/utils/cn';

/**
 * A student's name in their elite rank's metal: gold, silver or bronze gradient text (a solid colour
 * underneath keeps it readable everywhere). `shine` adds the occasional light sweep (gold more often, silver
 * and bronze softer); use it only where a student is featured (profile header, podium, Hall of Fame).
 * Everyone ranked #4 and below keeps the normal styling. The rank itself is told in words by
 * RankTokenBadge next to the name, never by colour alone. When the rank changes the name fades into its
 * new metal.
 */
export function EliteRankName({ eliteRank, shine = false, className, children }) {
  const tier = eliteTierOf(eliteRank);
  const [initialTier] = useState(tier?.id ?? null);
  const changed = (tier?.id ?? null) !== initialTier;
  if (!tier && !changed) return className ? <span className={className}>{children}</span> : children;
  return (
    <motion.span
      key={tier?.id ?? 'plain'}
      className={cn(tier && ['elite-name', `elite-name--${tier.id}`, shine && 'elite-name--shine'], className)}
      initial={changed ? { opacity: 0.35 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE }}
      data-elite-name={tier?.id}
    >
      {children}
    </motion.span>
  );
}
