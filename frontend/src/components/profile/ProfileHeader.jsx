import { useState } from 'react';
import { Camera, ImagePlus, School } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { cn } from '@/utils/cn';

const memberSince = (date) =>
  date ? new Date(date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null;

/**
 * The "campus ID card": cover banner, round photo, name and campus line. Owners get camera
 * buttons on the photo and cover. Layout responds to its container, so it works full-width
 * and in the narrow editor preview.
 */
export function ProfileHeader({ profile, theme, isOwner, onChangePhoto, onChangeCover, actions, headingAs: Heading = 'h1' }) {
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
        <div className="flex flex-col gap-4 @3xl:flex-row @3xl:items-end @3xl:justify-between">
          <div className="flex flex-col items-start gap-3 @2xl:flex-row @2xl:items-end @2xl:gap-5">
            <div className="relative -mt-14 @xl:-mt-16">
              <span className={cn('block rounded-full p-1 transition-colors duration-300', theme.ring)}>
                <Avatar src={profile.avatarUrl} name={fullName} size="2xl" shape="circle" className="ring-4 ring-surface" />
              </span>
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
            </div>
          </div>
          {actions && <div className="flex flex-wrap gap-2 @3xl:justify-end">{actions}</div>}
        </div>
        {since && <p className="mt-4 text-xs text-ink-subtle">On CampusX since {since}</p>}
      </div>
    </div>
  );
}
