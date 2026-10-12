import { Link } from 'react-router';
import { Logo } from '@/components/brand/Logo';
import { ApiStatus } from '@/components/common/ApiStatus';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { AnimatedOutlet } from '@/components/layout/AnimatedOutlet';
import { Button } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useAuthStore } from '@/store/authStore';

/** Shell for the public pages: landing, login and register. */
export function PublicLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/85 backdrop-blur-md">
        <div className="gutter-x mx-auto flex h-16 max-w-7xl items-center justify-between">
          <Link to={ROUTES.LANDING} aria-label="CampusX home" className="rounded-xl">
            <Logo />
          </Link>

          <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            {isAuthenticated ? (
              <Button as={Link} to={ROUTES.HOME} size="sm">
                Enter campus
              </Button>
            ) : (
              <>
                {/* Hidden on small phones to keep the header uncluttered; the hero links to login too. */}
                <span className="hidden sm:inline-flex">
                  <Button as={Link} to={ROUTES.LOGIN} variant="ghost" size="sm">
                    Log in
                  </Button>
                </span>
                <Button as={Link} to={ROUTES.REGISTER} size="sm">
                  Join
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <AnimatedOutlet />
      </main>

      <footer className="border-t border-line">
        <div className="gutter-x mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 py-6 text-sm text-ink-subtle sm:flex-row">
          <p>© {new Date().getFullYear()} CampusX · Made for student life</p>
          {import.meta.env.DEV && <ApiStatus />}
        </div>
      </footer>
    </div>
  );
}
