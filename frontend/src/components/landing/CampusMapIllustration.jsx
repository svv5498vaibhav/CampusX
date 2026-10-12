import { motion } from 'framer-motion';
import {
  BookOpen,
  CalendarDays,
  Compass,
  FolderKanban,
  Lightbulb,
  MapPin,
  Sprout,
  Trophy,
  UsersRound,
  VenetianMask,
} from 'lucide-react';
import { cn } from '@/utils/cn';

// Decorative map of the spaces CampusX is building, laid out like a campus.
const PLACES = [
  { label: 'Library', icon: BookOpen },
  { label: 'Club Hub', icon: UsersRound },
  { label: 'Hall of Fame', icon: Trophy },
  { label: 'Project Lab', icon: FolderKanban },
  { label: 'The Quad', icon: Sprout, isCenter: true },
  { label: 'Idea Wall', icon: Lightbulb },
  { label: 'Events', icon: CalendarDays },
  { label: 'Opportunities', icon: Compass },
  { label: 'Open Corner', icon: VenetianMask },
];

export function CampusMapIllustration({ className }) {
  return (
    <div aria-hidden="true" className={cn('relative mx-auto w-full max-w-md', className)}>
      <div className="relative rounded-[2rem] border border-line bg-surface p-4 shadow-lift sm:p-6">
        <div className="campus-grid absolute inset-0 rounded-[2rem]" />

        <div className="relative grid grid-cols-3 gap-3 sm:gap-4">
          {/* Dashed "walkways" running between the buildings. */}
          <svg
            className="absolute inset-0 size-full text-line-strong"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            fill="none"
          >
            {[33.3, 66.6].map((position) => (
              <g key={position} stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 5">
                <line x1={position} y1="0" x2={position} y2="100" vectorEffect="non-scaling-stroke" />
                <line x1="0" y1={position} x2="100" y2={position} vectorEffect="non-scaling-stroke" />
              </g>
            ))}
          </svg>

          {PLACES.map(({ label, icon: Icon, isCenter }, index) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 + index * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'relative flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border p-2 text-center',
                isCenter
                  ? 'border-transparent bg-primary text-primary-fg shadow-glow'
                  : 'border-line bg-surface text-ink-muted shadow-soft',
              )}
            >
              <Icon className={cn('size-5 sm:size-6', !isCenter && 'text-primary')} />
              <span className="text-[11px] leading-tight font-semibold sm:text-xs">{label}</span>

              {isCenter && (
                <motion.span
                  className="absolute -top-3 -right-2 grid size-8 place-items-center rounded-full bg-sun-400 text-sun-900 shadow-lift"
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <MapPin className="size-4" />
                </motion.span>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
