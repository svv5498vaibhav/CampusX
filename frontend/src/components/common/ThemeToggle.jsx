import { AnimatePresence, motion } from 'framer-motion';
import { Monitor, Moon, Sun } from 'lucide-react';
import { getNextTheme, useThemeStore } from '@/store/themeStore';
import { cn } from '@/utils/cn';

const THEME_META = {
  light: { icon: Sun, label: 'Light' },
  dark: { icon: Moon, label: 'Dark' },
  system: { icon: Monitor, label: 'System' },
};

/** Cycles light → dark → system. `showLabel` reveals the label from `lg` up (sidebar use). */
export function ThemeToggle({ showLabel = false, className }) {
  const theme = useThemeStore((state) => state.theme);
  const cycleTheme = useThemeStore((state) => state.cycleTheme);

  const { icon: Icon, label } = THEME_META[theme];
  const nextLabel = THEME_META[getNextTheme(theme)].label.toLowerCase();

  return (
    <button
      type="button"
      onClick={cycleTheme}
      title={`Theme: ${label}`}
      aria-label={`Theme: ${label}. Switch to ${nextLabel} theme`}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-3 rounded-xl text-sm font-semibold text-ink-muted',
        'transition-colors hover:bg-surface-muted hover:text-ink',
        showLabel ? 'w-full px-3 lg:justify-start lg:px-4' : 'w-10',
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          className="grid place-items-center"
          initial={{ rotate: -90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          exit={{ rotate: 90, opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <Icon className="size-5" aria-hidden="true" />
        </motion.span>
      </AnimatePresence>
      {showLabel && <span className="hidden lg:inline">{label} theme</span>}
    </button>
  );
}
