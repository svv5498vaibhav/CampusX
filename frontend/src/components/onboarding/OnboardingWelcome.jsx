import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, School, Sparkles } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';

const WHAT_WE_ASK = [
  { icon: School, title: 'Your campus', text: 'College and branch' },
  { icon: CalendarDays, title: 'Your year', text: 'Semester and roll number' },
  { icon: Sparkles, title: 'Your vibe', text: 'Interests and skills' },
];

export function OnboardingWelcome({ firstName }) {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="flex flex-col items-center py-4 text-center sm:py-8">
      <motion.div
        initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      >
        <span className="block rounded-[31%] shadow-glow">
          <LogoMark className="size-16 sm:size-20" />
        </span>
      </motion.div>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-6 font-display text-3xl font-extrabold tracking-tight text-balance text-ink outline-none sm:text-4xl"
      >
        Welcome to CampusX, {firstName} <span aria-hidden="true">👋</span>
      </h1>
      <p className="mt-3 max-w-md text-base leading-relaxed text-ink-muted">
        Let's set up your campus identity. It takes about a minute, and you'll be walking into your
        digital campus right after.
      </p>

      <ul className="mt-10 grid w-full max-w-xl gap-3 text-left sm:grid-cols-3">
        {WHAT_WE_ASK.map(({ icon: Icon, title, text }, index) => (
          <motion.li
            key={title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + index * 0.08, duration: 0.35 }}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft sm:flex-col sm:items-start"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-fg">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">{title}</span>
              <span className="block text-xs text-ink-muted">{text}</span>
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
