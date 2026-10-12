import { AnimatePresence, motion } from 'framer-motion';
import { CircleAlert, CircleCheck, Info, LoaderCircle, X } from 'lucide-react';
import { useToastStore } from '@/store/toastStore';
import { cn } from '@/utils/cn';

const ICONS = {
  success: { icon: CircleCheck, className: 'text-primary' },
  error: { icon: CircleAlert, className: 'text-danger' },
  info: { icon: Info, className: 'text-ink-muted' },
  loading: { icon: LoaderCircle, className: 'animate-spin text-primary' },
};

/**
 * Toast stack: under the top bar on phones (clear of the tab bar and create button),
 * bottom-right from `md` up.
 * Announced politely to screen readers; errors assertively.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[calc(4.5rem+env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-4 md:inset-x-auto md:top-auto md:right-6 md:bottom-6 md:items-end"
    >
      <div aria-live="polite" className="sr-only">
        {toasts.filter((toast) => toast.type !== 'error').map((toast) => toast.message).join('. ')}
      </div>
      <div aria-live="assertive" className="sr-only">
        {toasts.filter((toast) => toast.type === 'error').map((toast) => toast.message).join('. ')}
      </div>

      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const { icon: Icon, className } = ICONS[toast.type] ?? ICONS.info;
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ type: 'spring', damping: 30, stiffness: 380 }}
              data-toast={toast.type}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink shadow-lift"
            >
              <Icon className={cn('mt-0.5 size-4.5 shrink-0', className)} aria-hidden="true" />
              <p className="min-w-0 flex-1 break-words">{toast.message}</p>
              {toast.type !== 'loading' && (
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="-my-1 -mr-2 grid size-7 shrink-0 place-items-center rounded-lg text-ink-subtle hover:bg-surface-muted hover:text-ink"
                  aria-label="Dismiss notification"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
