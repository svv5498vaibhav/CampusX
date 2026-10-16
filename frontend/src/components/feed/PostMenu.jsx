import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { EllipsisVertical } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * The ⋮ menu on a post (also on profiles and chats). items: [{ id, label, icon, onSelect, danger? }].
 * `triggerClassName` replaces the button's size and look (e.g. to match taller buttons beside it).
 * Keyboard: Enter/Space/↓ opens and focuses the first item, ↑/↓/Home/End move, Escape or Tab
 * closes and returns focus to the button.
 */
export function PostMenu({ items, label = 'Post options', triggerClassName }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  const itemsIn = () => [...(menuRef.current?.querySelectorAll('[role="menuitem"]') ?? [])];
  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    itemsIn()[0]?.focus();
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onMenuKeyDown = (event) => {
    const list = itemsIn();
    const index = list.indexOf(document.activeElement);
    const focusAt = (next) => list[(next + list.length) % list.length]?.focus();
    if (event.key === 'ArrowDown') focusAt(index + 1);
    else if (event.key === 'ArrowUp') focusAt(index - 1);
    else if (event.key === 'Home') focusAt(0);
    else if (event.key === 'End') focusAt(list.length - 1);
    else if (event.key === 'Escape') close();
    else if (event.key === 'Tab') return close(false);
    else return undefined;
    event.preventDefault();
    return undefined;
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn('grid place-items-center transition-colors', triggerClassName ?? 'size-9 rounded-xl text-ink-subtle hover:bg-surface-muted hover:text-ink aria-expanded:bg-surface-muted aria-expanded:text-ink')}
      >
        <EllipsisVertical className="size-5" aria-hidden="true" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.14 }}
            className="glass-overlay absolute top-full right-0 z-20 mt-1 w-48 origin-top-right rounded-2xl border border-line bg-overlay p-1.5 shadow-lift"
          >
            {items.map(({ id, label: itemLabel, icon: Icon, onSelect, danger }) => (
              <button
                key={id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  close();
                  onSelect();
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold outline-none transition-colors',
                  danger
                    ? 'text-danger-fg hover:bg-danger-soft focus-visible:bg-danger-soft'
                    : 'text-ink hover:bg-surface-muted focus-visible:bg-surface-muted',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {itemLabel}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
