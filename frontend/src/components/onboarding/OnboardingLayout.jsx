import { LogOut } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { Button } from '@/components/ui';
import { useLogout } from '@/hooks/useLogout';

/**
 * Focused, full-screen shell for onboarding: no campus navigation, a compact progress bar
 * under the header, and a sticky action bar that stays within thumb reach on phones.
 */
export function OnboardingLayout({ progress, footer, children }) {
  const logout = useLogout();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-canvas/90 backdrop-blur-md">
        <div className="gutter-x mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3">
          <Logo wordmarkClassName="hidden min-[360px]:inline" />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="sm" leftIcon={LogOut} onClick={logout}>
              Log out
            </Button>
          </div>
        </div>
        {progress && <div className="gutter-x mx-auto w-full max-w-3xl pb-3">{progress}</div>}
      </header>

      <main id="main" className="flex-1">
        <div className="gutter-x mx-auto w-full max-w-3xl py-6 sm:py-10">{children}</div>
      </main>

      {footer && (
        <footer className="pb-safe sticky bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur-md">
          <div className="gutter-x mx-auto flex w-full max-w-3xl items-center justify-between gap-3 py-3">{footer}</div>
        </footer>
      )}
    </div>
  );
}
