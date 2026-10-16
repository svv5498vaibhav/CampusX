import { motion } from 'framer-motion';
import { NavLink } from 'react-router';
import { CAMPUS_NAV } from '@/constants/navigation';
import { cn } from '@/utils/cn';

const BOTTOM_NAV_ITEMS = CAMPUS_NAV.filter((item) => item.inBottomNav);

/** Thumb-friendly tab bar for phones. */
export function MobileBottomNav() {
  return (
    <nav
      aria-label="Campus"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-overlay/95 backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {BOTTOM_NAV_ITEMS.map(({ to, label, shortLabel, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 pt-2 pb-2.5 text-[11px] font-semibold transition-colors',
                  isActive ? 'text-primary-soft-fg' : 'text-ink-subtle hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative grid h-8 w-14 place-items-center">
                    {isActive && (
                      <motion.span
                        layoutId="bottom-nav-active"
                        className="absolute inset-0 rounded-full bg-primary-soft"
                        transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                      />
                    )}
                    <Icon className="relative size-5" aria-hidden="true" />
                  </span>
                  <span>{shortLabel ?? label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
