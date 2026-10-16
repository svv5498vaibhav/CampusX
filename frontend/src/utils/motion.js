/*
 * Shared Framer Motion settings, so the student app and the admin control center move the same way:
 * short, eased, and never decorative in safety or moderation flows. <MotionConfig reducedMotion="user">
 * (App.jsx) drops movement for people who ask the OS for reduced motion; opacity still fades.
 */
export const EASE = [0.22, 1, 0.36, 1];

export const DURATION = Object.freeze({ fast: 0.15, base: 0.24, slow: 0.42 });

/** Springs for things that follow the pointer or a selection (active nav item, chosen theme). */
export const SPRING = Object.freeze({
  selection: { type: 'spring', stiffness: 420, damping: 36 },
  sheet: { type: 'spring', damping: 32, stiffness: 340 },
});

/** A block appearing once (cards, panels, rows). */
export const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, delay, ease: EASE },
});

/** Dropdowns and popovers. */
export const popover = Object.freeze({
  initial: { opacity: 0, y: -6, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.98 },
  transition: { duration: DURATION.fast, ease: EASE },
});

/** A status value replacing another (badges): a quick settle, no bounce. */
export const statusChange = Object.freeze({
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.2, ease: EASE },
});

/** A check mark confirming a choice. */
export const checkIn = Object.freeze({
  initial: { opacity: 0, scale: 0.5 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.5 },
  transition: { type: 'spring', stiffness: 520, damping: 30 },
});
