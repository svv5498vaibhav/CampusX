import { Suspense } from 'react';
import { motion } from 'framer-motion';
import { Outlet, useLocation } from 'react-router';
import { Loader } from '@/components/ui/Loader';

/** Renders the matched child route with a lazy-load fallback and a gentle entrance. */
export function AnimatedOutlet() {
  const { pathname } = useLocation();

  return (
    <Suspense fallback={<Loader centered label="Loading page" />}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <Outlet />
      </motion.div>
    </Suspense>
  );
}
