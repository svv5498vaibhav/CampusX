import { useState } from 'react';
import { motion } from 'framer-motion';
import { PenLine, Plus } from 'lucide-react';
import { PostComposer } from '@/components/feed/PostComposer';
import { Avatar } from '@/components/ui';
import { CAMPUS_PROMPTS, QUICK_STARTS } from '@/constants/posts';
import { useAuthStore } from '@/store/authStore';
import { getFullName } from '@/utils/string';

// A different prompt each visit keeps the card feeling alive.
const prompt = CAMPUS_PROMPTS[Math.floor(Math.random() * CAMPUS_PROMPTS.length)];

/**
 * "Campus Activity" card at the top of the feed: a prompt to write, plus quick starts for photos,
 * videos and the campus post types. On phones a floating button keeps posting one tap away.
 * With `community` ({ id, name }) everything is posted inside that community.
 */
export function CreatePost({ community = null }) {
  const user = useAuthStore((state) => state.user);
  const [composer, setComposer] = useState(null); // { type, picker } while open
  const name = getFullName(user);

  const open = (start = {}) => setComposer({ type: start.type ?? 'text', picker: start.picker ?? null });

  return (
    <>
      <section aria-label={community ? `Post in ${community.name}` : 'Share with campus'} className="campus-grid overflow-hidden glass-card rounded-3xl border border-line bg-surface p-4 shadow-soft sm:p-5">
        <div className="flex items-center gap-3">
          <Avatar src={user?.avatarUrl} name={name} size="md" />
          <motion.button
            type="button"
            whileTap={{ scale: 0.99 }}
            onClick={() => open()}
            className="group flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-line bg-surface-muted/70 px-4 text-left text-sm text-ink-muted transition-colors hover:border-primary/50 hover:bg-surface"
          >
            <span className="truncate">{community ? `Share something with ${community.name}...` : prompt}</span>
            <PenLine className="ml-auto size-4 shrink-0 text-ink-subtle transition-colors group-hover:text-primary" aria-hidden="true" />
          </motion.button>
        </div>

        <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]" role="group" aria-label="Start a post">
          {QUICK_STARTS.map(({ id, label, icon: Icon, media }) => (
            <motion.button
              key={id}
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => open(media ? { picker: media } : { type: id })}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-ink-muted transition-colors hover:bg-primary-soft hover:text-primary-soft-fg"
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </motion.button>
          ))}
        </div>
      </section>

      {/* Phones: always-reachable create button above the tab bar. */}
      <motion.button
        type="button"
        onClick={() => open()}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileTap={{ scale: 0.92 }}
        aria-label="Create a post"
        className="fixed right-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-20 grid size-14 place-items-center rounded-2xl glass-primary bg-primary text-primary-fg shadow-glow md:hidden"
      >
        <Plus className="size-6" aria-hidden="true" />
      </motion.button>

      {composer && (
        <PostComposer open initialType={composer.type} picker={composer.picker} community={community} onClose={() => setComposer(null)} />
      )}
    </>
  );
}
