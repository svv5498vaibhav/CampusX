import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Camera, ImagePlus, School } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { cn } from '@/utils/cn';

// How long after a follow the photo's ring still glows (a later visit doesn't replay it).
const GLOW_MS = 1200;

/** A soft green ring that pulses once around the photo when the viewer has just followed this student. */
function FollowGlow({ at }) {
  const reduceMotion = useReducedMotion();
  const [glowing, setGlowing] = useState(null);
  useEffect(() => {
    if (!at || reduceMotion || Date.now() - at > GLOW_MS) return undefined;
    setGlowing(at);
    const timer = setTimeout(() => setGlowing(null), GLOW_MS);
    return () => clearTimeout(timer);
  }, [at, reduceMotion]);
  return (
    <AnimatePresence>
      {glowing && (
        <motion.span
          key={glowing}
          aria-hidden="true"
          data-avatar-glow
          className="pointer-events-none absolute -inset-1 rounded-full ring-4 ring-primary/70 shadow-glow"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: [0, 1, 0], scale: [0.94, 1.04, 1.12] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      )}
    </AnimatePresence>
  );
}

const memberSince = (date) =>
  date ? new Date(date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null;

/**
 * The "campus ID card": cover banner, round photo, name and campus line. Owners get camera
 * buttons on the photo and cover. Layout responds to its container, so it works full-width
 * and in the narrow editor preview. `stats` (follower counts) sits under the campus line; `celebrateAt` is
 * when the viewer just followed this student (the photo's ring glows once); `menu` is a ⋮ menu placed after
 * the actions when they share a row, and in the header's top-right corner when they stack.
 */
export function ProfileHeader({ profile, theme, isOwner, onChangePhoto, onChangeCover, actions, menu, stats, celebrateAt, headingAs: Heading = 'h1' }) {
  const [failedCover, setFailedCover] = useState(null);
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();

  const showCover = Boolean(profile.coverImageUrl) && failedCover !== profile.coverImageUrl;
  const since = memberSince(profile.memberSince);

  return (
    <div className={cn('overflow-hidden rounded-[2rem] border transition-colors duration-300', theme.card)}>
      <div className={cn('relative h-32 transition-colors duration-300 @xl:h-44 @3xl:h-56', theme.cover)}>
        <div className="absolute inset-0" style={theme.pattern} aria-hidden="true" />
        {showCover && (
          <img
            src={profile.coverImageUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
            onError={() => setFailedCover(profile.coverImageUrl)}
          />
        )}
        {isOwner && onChangeCover && (
          <button
            type="button"
            onClick={onChangeCover}
            aria-label="Change cover image"
            className="absolute top-3 right-3 inline-flex h-10 items-center gap-2 rounded-xl bg-black/45 px-3 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-black/60"
          >
            <ImagePlus className="size-4" aria-hidden="true" />
            <span className="hidden @md:inline">Change cover</span>
          </button>
        )}
      </div>

      <div className="relative px-5 pb-6 @xl:px-8">
        {/* A ⋮ menu sits in the free corner beside the photo when the actions stack (phones), inline otherwise. */}
        {menu && <div className="absolute top-3 right-4 @xl:right-6 @3xl:hidden">{menu}</div>}
        <div className="flex flex-col gap-4 @3xl:flex-row @3xl:items-end @3xl:justify-between">
          <div className="flex flex-col items-start gap-3 @2xl:flex-row @2xl:items-end @2xl:gap-5">
            <div className="relative -mt-14 @xl:-mt-16">
              <span className={cn('block rounded-full p-1 transition-colors duration-300', theme.ring)}>
                <Avatar src={profile.avatarUrl} name={fullName} size="2xl" shape="circle" className="ring-4 ring-surface" />
              </span>
              <FollowGlow at={celebrateAt} />
              {isOwner && onChangePhoto && (
                <button
                  type="button"
                  onClick={onChangePhoto}
                  aria-label="Change profile photo"
                  className="absolute right-1 bottom-1 grid size-10 place-items-center rounded-full border-4 border-surface bg-primary text-primary-fg shadow-soft transition-transform hover:scale-105"
                >
                  <Camera className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
            {/* Top padding keeps the name clear of the cover edge when it sits beside the photo. */}
            <div className="min-w-0 @2xl:pt-5 @2xl:pb-1">
              <Heading className="font-display text-2xl font-bold tracking-tight break-words text-ink @xl:text-3xl">{fullName}</Heading>
              {(profile.branch || profile.semester) && (
                <p className={cn('mt-1 text-sm font-semibold transition-colors duration-300', theme.accent)}>
                  {profile.branch?.name}
                  {profile.branch && profile.semester && ' · '}
                  {/* Wrap before "7th Semester", never inside it. */}
                  {profile.semester && <span className="whitespace-nowrap">{profile.semester.label}</span>}
                </p>
              )}
              {profile.college && (
                <p className="mt-1.5 flex items-start gap-1.5 text-sm text-ink-muted">
                  <School className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {profile.college.name}
                </p>
              )}
              {stats}
            </div>
          </div>
          {(actions || menu) && (
            <div className="flex flex-wrap gap-2 @3xl:justify-end">
              {actions}
              {menu && <div className="hidden @3xl:block">{menu}</div>}
            </div>
          )}
        </div>
        {since && <p className="mt-4 text-xs text-ink-subtle">On CampusX since {since}</p>}
      </div>
    </div>
  );
}
