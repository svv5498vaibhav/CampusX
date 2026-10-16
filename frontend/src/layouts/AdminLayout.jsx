import { Suspense, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Outlet, useLocation } from 'react-router';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminError, AdminLoading } from '@/components/admin/AdminUi';
import { useSystemStatusPolling } from '@/components/admin/SystemStatus';
import { useAdminSocket } from '@/hooks/useAdminSocket';
import { useAdminThemeScope } from '@/hooks/useThemeSync';
import { useAdminStore } from '@/store/adminStore';
import { useAuthStore } from '@/store/authStore';

/**
 * Shell for /admin: the Aurora Glass control-center look (the admin's own light/dark choice, applied to
 * <html> only while it is open, so the student app keeps its own theme), the session's permissions, live
 * alerts and system status.
 * Laptop/desktop: permanent sidebar · tablet: icon rail that expands into a drawer · phone: drawer.
 */
export function AdminLayout() {
  const userId = useAuthStore((state) => state.user?.id);
  const sessionStatus = useAdminStore((state) => state.sessionStatus);
  const sessionError = useAdminStore((state) => state.sessionError);
  const sessionUserId = useAdminStore((state) => state.session?.user?.id);
  const drawerOpen = useAdminStore((state) => state.drawerOpen);
  const setDrawerOpen = useAdminStore((state) => state.setDrawerOpen);
  const { pathname } = useLocation();

  useAdminThemeScope();

  // A different account (or a fresh sign-in) loads its own permissions.
  useEffect(() => {
    if (!userId) return;
    if (sessionUserId && sessionUserId !== userId) useAdminStore.getState().reset();
    useAdminStore.getState().loadSession();
  }, [userId, sessionUserId]);

  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const close = (event) => event.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [drawerOpen]);

  useAdminSocket();
  useSystemStatusPolling();

  return (
    <div className="admin-grid min-h-dvh text-ax-text">
      <a href="#admin-main" className="sr-only z-50 rounded-lg bg-ax-card px-4 py-2 font-semibold text-ax-text focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 lg:block">
        <AdminSidebar variant="full" />
      </aside>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[76px] md:block lg:hidden">
        <AdminSidebar variant="rail" onExpand={() => setDrawerOpen(true)} />
      </aside>

      <AnimatePresence>
        {drawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
            <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawerOpen(false)} />
            <motion.div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 32, stiffness: 320 }}>
              <AdminSidebar variant="full" floating onNavigate={() => setDrawerOpen(false)} />
              <button type="button" onClick={() => setDrawerOpen(false)} className="absolute top-5 right-3 grid size-8 place-items-center rounded-lg border border-ax-border bg-ax-bg-2 text-ax-muted hover:text-ax-text" aria-label="Close navigation">
                <X className="size-4" aria-hidden="true" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="md:pl-[76px] lg:pl-64">
        <AdminHeader onMenu={() => setDrawerOpen(true)} />
        <main id="admin-main" className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:py-8">
          {sessionStatus === 'error' ? (
            <AdminError title="Couldn’t open the control center" error={sessionError} onRetry={() => useAdminStore.getState().loadSession({ force: true })} />
          ) : sessionStatus !== 'ready' ? (
            <AdminLoading label="Verifying access" />
          ) : (
            <Suspense fallback={<AdminLoading />}>
              <Outlet />
            </Suspense>
          )}
        </main>
      </div>
    </div>
  );
}
