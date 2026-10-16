import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { LoaderCircle, Plus, UserMinus, UserPlus } from 'lucide-react';
import { useFollowStore } from '@/store/followStore';
import { cn } from '@/utils/cn';

const SIZES = {
  sm: { button: 'h-9 min-w-[7rem] px-3.5 text-sm', placeholder: 'h-9 w-28', spread: 0.75 },
  md: { button: 'h-11 min-w-[8.75rem] px-5 text-sm', placeholder: 'h-11 w-36', spread: 1 },
};

const TONES = {
  follow: 'glass-primary border-transparent bg-primary text-primary-fg shadow-soft hover:bg-primary-hover hover:shadow-glow',
  following: 'border-line-strong bg-surface text-ink',
  unfollow: 'border-danger/50 bg-danger-soft text-danger-fg',
};

// Where the little "+" sparks drift to, around the button (px from its centre), and how they turn.
const SPARKS = [
  { x: -62, y: -20, rotate: -40 },
  { x: -34, y: -32, rotate: 25 },
  { x: 2, y: -36, rotate: -15 },
  { x: 36, y: -30, rotate: 35 },
  { x: 64, y: -14, rotate: -30 },
  { x: 52, y: 22, rotate: 20 },
];

// How long a follow counts as "just happened" (a button mounting later doesn't replay the celebration).
const CELEBRATION_MS = 1100;

/** A tick that draws itself in once, right after following. */
function DrawnCheck({ draw }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={draw ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.12, ease: 'easeOut' }} />
    </svg>
  );
}

/**
 * The CampusX Follow button, shared by profiles, followers/following lists and student cards (they all read
 * the same entry in the follow store, so they stay in step).
 *
 *   Follow      green; pressing it springs in, sends a soft green glow and a few "+" sparks outward, draws a
 *               tick and rolls the label to "Following" while the follower count rolls up
 *   Following   neutral outline; hovering (or keyboard focus) turns it into a red "Unfollow" warning
 *   Unfollow    goes back to Follow with a quiet fade, the count rolls down; no celebration
 *   in flight   a small spinner, and further presses are ignored (no duplicate requests)
 *
 * The change is optimistic and rolled back if the server refuses (followStore). Success is never only the
 * animation: the label changes, the count changes and screen readers hear "You're now following …".
 * Reduced motion: no sparks, glow or bounce, just a short crossfade.
 */
export function FollowButton({ userId, name = 'this student', size = 'md', fullWidth = false, className }) {
  const relation = useFollowStore((state) => state.relations[userId]);
  const pending = useFollowStore((state) => Boolean(state.pending[userId]));
  const celebratedAt = useFollowStore((state) => state.celebrations[userId]);
  const toggleFollow = useFollowStore((state) => state.toggleFollow);
  const reduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  // Right after following, the pointer is still on the button: no red "Unfollow" until it leaves once.
  const [justFollowed, setJustFollowed] = useState(false);
  const [burst, setBurst] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const following = Boolean(relation?.isFollowing);

  useEffect(() => {
    if (!celebratedAt || Date.now() - celebratedAt > CELEBRATION_MS) return undefined;
    setBurst(celebratedAt);
    const timer = setTimeout(() => setBurst(null), CELEBRATION_MS);
    return () => clearTimeout(timer);
  }, [celebratedAt]);

  // A follow the server refused is rolled back: stop celebrating it.
  useEffect(() => {
    if (!following) setBurst(null);
  }, [following]);

  useEffect(() => {
    if (!announcement) return undefined;
    const timer = setTimeout(() => setAnnouncement(''), 4000);
    return () => clearTimeout(timer);
  }, [announcement]);

  const sizing = SIZES[size] ?? SIZES.md;
  if (!relation) return <span aria-hidden="true" className={cn('inline-block animate-pulse rounded-xl bg-surface-muted', sizing.placeholder, fullWidth && 'w-full', className)} />;
  if (relation.canFollow === false && !following) return null;

  const warn = following && !pending && !justFollowed && (hovered || keyboardFocus);
  const label = following ? (warn ? 'Unfollow' : 'Following') : 'Follow';
  const tone = warn ? TONES.unfollow : following ? TONES.following : TONES.follow;
  const celebrating = Boolean(burst) && following && !reduceMotion;

  const onClick = async () => {
    if (pending) return;
    const willFollow = !following;
    if (willFollow) setJustFollowed(true);
    const ok = await toggleFollow(userId, { name });
    if (ok) setAnnouncement(willFollow ? `You're now following ${name}.` : `You unfollowed ${name}.`);
  };

  let icon = <UserPlus className="size-4" aria-hidden="true" />;
  if (pending) icon = <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />;
  else if (warn) icon = <UserMinus className="size-4" aria-hidden="true" />;
  else if (following) icon = <DrawnCheck key={burst ?? 'steady'} draw={celebrating} />;

  return (
    <span className={cn('relative inline-flex', fullWidth && 'w-full', className)}>
      {/* The soft green glow behind the button. */}
      <AnimatePresence>
        {celebrating && (
          <motion.span
            key={`glow-${burst}`}
            aria-hidden="true"
            data-follow-glow
            className="pointer-events-none absolute -inset-1 rounded-2xl bg-primary/45 blur-md"
            initial={{ opacity: 0.9, scale: 0.85 }}
            animate={{ opacity: 0, scale: 1.45 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={onClick}
        onPointerEnter={(event) => event.pointerType === 'mouse' && setHovered(true)}
        onPointerLeave={() => {
          setHovered(false);
          setJustFollowed(false);
        }}
        onFocus={(event) => setKeyboardFocus(event.currentTarget.matches(':focus-visible'))}
        onBlur={() => {
          setKeyboardFocus(false);
          setJustFollowed(false);
        }}
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        data-follow-state={following ? 'following' : 'not-following'}
        whileTap={reduceMotion || pending ? undefined : { scale: 0.92 }}
        animate={celebrating ? { scale: [0.92, 1.06, 1] } : { scale: 1 }}
        transition={{ scale: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }}
        className={cn(
          'relative z-10 inline-flex items-center justify-center gap-1.5 rounded-xl border font-semibold whitespace-nowrap select-none',
          'transition-[background-color,color,border-color,box-shadow] duration-200 ease-campus',
          sizing.button,
          fullWidth && 'w-full',
          tone,
          pending && 'cursor-progress',
        )}
      >
        <span className="grid size-4 place-items-center">{icon}</span>
        <span className="relative inline-flex">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={label}
              aria-hidden="true"
              className="inline-block"
              initial={reduceMotion ? { opacity: 0 } : label === 'Following' && celebrating ? { y: 12, opacity: 0 } : { opacity: 0, scale: 0.92 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { y: label === 'Follow' ? -10 : 0, opacity: 0, scale: 0.92 }}
              transition={{ duration: reduceMotion ? 0.12 : 0.2, ease: 'easeOut' }}
            >
              {label}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="sr-only">{following ? `Following ${name}. Press to unfollow.` : `Follow ${name}`}</span>
      </motion.button>

      {/* A few "+" sparks drifting out and fading. */}
      {celebrating &&
        SPARKS.map((spark, index) => (
          <motion.span
            key={`${burst}-${index}`}
            aria-hidden="true"
            data-follow-spark
            className="pointer-events-none absolute top-1/2 left-1/2 z-20 -mt-1.5 -ml-1.5 text-primary"
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
            animate={{ x: spark.x * sizing.spread, y: spark.y * sizing.spread, opacity: [0, 1, 0], scale: [0.4, 1, 0.7], rotate: spark.rotate }}
            transition={{ duration: 0.8, delay: 0.06 + index * 0.03, ease: 'easeOut' }}
          >
            <Plus className="size-3" strokeWidth={3} />
          </motion.span>
        ))}

      <span className="sr-only" role="status">
        {announcement}
      </span>
    </span>
  );
}
