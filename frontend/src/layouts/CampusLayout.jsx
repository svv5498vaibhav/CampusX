import { RankChangeAnimation } from '@/components/elite/RankChangeAnimation';
import { AnimatedOutlet } from '@/components/layout/AnimatedOutlet';
import { CampusSidebar } from '@/components/layout/CampusSidebar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { MobileTopBar } from '@/components/layout/MobileTopBar';
import { useEliteCelebration } from '@/hooks/useEliteCelebration';
import { useNotificationsSocket } from '@/hooks/useNotificationsSocket';

/**
 * Shell for the in-campus experience.
 * Phone: top bar + bottom tab bar · Tablet: icon rail · Laptop/desktop: full sidebar.
 * Also keeps the live notification connection open while the student is on campus pages, and celebrates
 * (briefly) when their elite rank token changes.
 */
export function CampusLayout() {
  useNotificationsSocket();
  const [eliteChange, dismissEliteChange] = useEliteCelebration();

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-xl bg-surface px-4 py-2 font-semibold text-ink shadow-lift focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <MobileTopBar />
      <CampusSidebar />

      <main
        id="main"
        className="pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-20 lg:pl-64"
      >
        <AnimatedOutlet />
      </main>

      <MobileBottomNav />
      <RankChangeAnimation change={eliteChange} onClose={dismissEliteChange} />
    </div>
  );
}
