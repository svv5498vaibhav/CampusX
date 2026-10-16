import { BookOpen, FolderKanban, Lightbulb, UsersRound } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';
import { PageContainer } from '@/components/layout/PageContainer';

const CAMPUS_SPOTS = [
  { label: 'Clubs', icon: UsersRound },
  { label: 'Projects', icon: FolderKanban },
  { label: 'Ideas', icon: Lightbulb },
  { label: 'Library', icon: BookOpen },
];

// Dots in the panel's own text colour (the shared campus-grid utility is tuned for neutral surfaces).
const PANEL_DOTS = {
  backgroundImage: 'radial-gradient(color-mix(in srgb, currentColor 18%, transparent) 1px, transparent 1px)',
  backgroundSize: '18px 18px',
};

/**
 * Layout for the sign-in and sign-up pages: a campus "gate" panel beside the form on
 * large screens, and just the form on phones.
 */
export function AuthShell({ title, subtitle, panelTitle, panelText, footer, children }) {
  return (
    <PageContainer width="wide" spacing="none" className="py-6 sm:py-10 lg:py-14">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-line bg-surface shadow-lift lg:grid-cols-[0.95fr_1.05fr]">
        {/* Brand green in light mode; deep green with green accents in dark mode. */}
        <aside className="glass-cover relative hidden flex-col justify-between gap-10 overflow-hidden bg-primary p-10 text-primary-fg lg:flex dark:border-r dark:border-line dark:bg-leaf-950 dark:text-ink">
          <div className="pointer-events-none absolute inset-0" style={PANEL_DOTS} aria-hidden="true" />
          <div className="relative flex items-center gap-2.5">
            <LogoMark inverse className="size-9" />
            <span className="font-display text-xl font-extrabold tracking-tight">CampusX</span>
          </div>
          <div className="relative">
            <h2 className="font-display text-4xl leading-[1.08] font-extrabold tracking-tight text-balance">{panelTitle}</h2>
            <p className="mt-4 max-w-sm text-base leading-relaxed opacity-90">{panelText}</p>
          </div>
          <ul className="relative grid grid-cols-2 gap-3" aria-hidden="true">
            {CAMPUS_SPOTS.map(({ label, icon: Icon }) => (
              <li
                key={label}
                className="flex items-center gap-2.5 rounded-2xl bg-current/10 px-4 py-3 text-sm font-semibold dark:bg-primary-soft dark:text-primary-soft-fg"
              >
                <Icon className="size-4" />
                {label}
              </li>
            ))}
          </ul>
        </aside>

        <div className="p-6 sm:p-10 lg:p-12">
          <LogoMark className="size-11 lg:hidden" />
          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl lg:mt-0">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-ink-muted sm:text-base">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 border-t border-line pt-6 text-center text-sm text-ink-muted">{footer}</div>}
        </div>
      </div>
    </PageContainer>
  );
}
