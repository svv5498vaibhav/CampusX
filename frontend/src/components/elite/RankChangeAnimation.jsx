import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Link } from 'react-router';
import { eliteTierOf } from '@/constants/elite';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/utils/cn';
import { EASE } from '@/utils/motion';

const VISIBLE_MS = 7000;

/** What happened, in words: gained, promoted, demoted or lost (from → to tier ids, null = no token). */
export function describeRankChange({ tier: tierId, previousTier: previousId }) {
  const tier = eliteTierOf(tierId);
  const previous = eliteTierOf(previousId);
  if (!tier) return { kind: 'lost', tier: previous, title: `Your ${previous.token} passed on`, message: 'Keep earning XP to win your place in the top three back.' };
  if (tier.id === 'gold') return { kind: previous ? 'promoted' : 'gained', tier, title: 'You claimed the Golden Token!', message: 'You are now CampusX Rank #1, the Golden Champion.' };
  if (!previous) return { kind: 'gained', tier, title: `You earned the ${tier.token}!`, message: `You entered the top three: ${tier.title}, Rank #${tier.rank}.` };
  if (tier.rank < previous.rank) return { kind: 'promoted', tier, title: `You moved up to ${tier.title}`, message: `You are now CampusX Rank #${tier.rank}.` };
  return { kind: 'demoted', tier, title: `You are now ${tier.title}`, message: `Your ${previous.token} passed to a new holder. You hold Rank #${tier.rank}.` };
}

/**
 * A short, restrained celebration when the signed-in student's elite rank changes. Entering the top three or
 * moving up: the token arrives with one shine and a single soft ring; moving down or losing a token: a calm
 * notice, no fanfare. No particles, no flashing. Announced politely to screen readers, closes by itself
 * after a few seconds (or with ×). With reduced motion it simply appears.
 *   change: { key, tier, previousTier } | null
 */
export function RankChangeAnimation({ change, onClose }) {
  useEffect(() => {
    if (!change) return undefined;
    const timer = setTimeout(onClose, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [change, onClose]);

  const view = change && describeRankChange(change);
  const celebrate = view && (view.kind === 'gained' || view.kind === 'promoted');
  const Icon = view?.tier.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[55] flex justify-center px-4 md:top-6 md:bottom-auto"
    >
      <AnimatePresence>
        {view && (
          <motion.div
            key={change.key}
            className={cn('glass-overlay pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-overlay shadow-lift', `elite-tier--${view.tier.id}`, celebrate && 'elite-tier-surface')}
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.35, ease: EASE }}
            data-elite-celebration={view.kind}
          >
            <div className="flex items-start gap-3 p-4 pr-12">
              <span className="relative grid size-12 shrink-0 place-items-center">
                {celebrate && (
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full border-2"
                    style={{ borderColor: 'var(--elite-line)' }}
                    initial={{ opacity: 0.9, scale: 0.7 }}
                    animate={{ opacity: 0, scale: 1.8 }}
                    transition={{ duration: 1.2, ease: 'easeOut', delay: 0.25 }}
                  />
                )}
                <motion.span
                  aria-hidden="true"
                  className={cn('relative grid size-12 place-items-center rounded-full shadow-soft', celebrate && 'elite-sweep', !celebrate && 'opacity-70 grayscale-[35%]')}
                  style={{ background: 'var(--elite-emblem-bg)', color: 'var(--elite-emblem-ink)' }}
                  initial={celebrate ? { scale: 0.5, rotate: -12 } : false}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.1 }}
                >
                  <Icon className="size-6" strokeWidth={2.2} />
                </motion.span>
              </span>
              <div className="min-w-0">
                <p className="font-display text-base leading-snug font-bold text-ink">{view.title}</p>
                <p className="mt-0.5 text-sm text-ink-muted">{view.message}</p>
                <Link to={ROUTES.HALL_OF_FAME} onClick={onClose} className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">
                  See the Hall of Fame
                </Link>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Dismiss"
              className="absolute top-3 right-3 grid size-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
