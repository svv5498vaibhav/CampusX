import { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { RouterProvider } from 'react-router/dom';
import { Toaster } from '@/components/ui/Toaster';
import { useThemeSync } from '@/hooks/useThemeSync';
import { router } from '@/routes/router';
import { useAuthStore } from '@/store/authStore';

export default function App() {
  useThemeSync();

  // Restore the signed-in session (via the refresh cookie) once on page load.
  useEffect(() => {
    useAuthStore.getState().initialize();
  }, []);

  return (
    // Honour the OS "reduce motion" setting across every animation.
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
      <Toaster />
    </MotionConfig>
  );
}
