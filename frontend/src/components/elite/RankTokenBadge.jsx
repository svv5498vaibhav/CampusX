import { motion } from 'framer-motion';
import { eliteLabel, eliteTierOf } from '@/constants/elite';
import { cn } from '@/utils/cn';
import { statusChange } from '@/utils/motion';

/**
 * The elite rank token as a small pill, so the rank is always said in words (and to screen readers as
 * "Golden Champion, CampusX rank 1"), not by colour alone:
 *   full     crown/shield · Golden Champion · #1   (profile header, Hall of Fame)
 *   compact  crown/shield · Gold                   (leaderboards, student cards)
 *   icon     crown/shield only, labelled            (tight rows: posts, follower lists)
 * Renders nothing for students without a token.
 */
export function RankTokenBadge({ eliteRank, variant = 'compact', className }) {
  const tier = eliteTierOf(eliteRank);
  if (!tier) return null;
  const Icon = tier.icon;
  const label = eliteLabel(tier);

  if (variant === 'icon') {
    return (
      <motion.span key={tier.id} {...statusChange} className={cn('elite-token elite-token--icon', `elite-token--${tier.id}`, className)} role="img" aria-label={label} title={label} data-elite-token={tier.id}>
        <Icon aria-hidden="true" strokeWidth={2.4} />
      </motion.span>
    );
  }
  return (
    <motion.span key={tier.id} {...statusChange} className={cn('elite-token', `elite-token--${tier.id}`, className)} title={label} data-elite-token={tier.id}>
      <Icon aria-hidden="true" strokeWidth={2.4} />
      <span aria-hidden="true">{variant === 'full' ? tier.title : tier.short}</span>
      {variant === 'full' && <span aria-hidden="true">#{tier.rank}</span>}
      <span className="sr-only">{label}</span>
    </motion.span>
  );
}
