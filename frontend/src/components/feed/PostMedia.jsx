import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/utils/cn';

// Grid shapes for 1-4 photos: one large, a pair, one large + two, or a 2×2.
const GRID = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 grid-rows-2',
  4: 'grid-cols-2 grid-rows-2',
};

function Photo({ item, alt, className, single }) {
  const [failed, setFailed] = useState(false);
  // A single photo keeps its own shape (within limits); grids use even tiles.
  const ratio = single && item.width && item.height ? Math.min(Math.max(item.width / item.height, 0.8), 1.91) : null;

  if (failed) {
    return (
      <div className={cn('grid place-items-center bg-surface-muted text-ink-subtle', single && 'aspect-video', className)}>
        <span className="flex items-center gap-2 text-xs font-semibold">
          <ImageOff className="size-4" aria-hidden="true" /> Photo unavailable
        </span>
      </div>
    );
  }

  return (
    <img
      src={item.url}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      style={ratio ? { aspectRatio: ratio } : undefined}
      className={cn('size-full bg-surface-muted object-cover', single && 'max-h-[34rem]', single && !ratio && 'aspect-video', className)}
    />
  );
}

/** Photos (grid) or a video (native controls, loaded only when played). */
export function PostMedia({ media, authorName }) {
  if (!media?.length) return null;

  const video = media.find((item) => item.type === 'video');
  if (video) {
    return (
      <div className="overflow-hidden rounded-2xl border border-line bg-black">
        <video
          src={video.url}
          poster={video.posterUrl ?? undefined}
          controls
          playsInline
          preload="none"
          aria-label={`Video shared by ${authorName}`}
          className="max-h-[70vh] w-full"
          style={video.width && video.height ? { aspectRatio: video.width / video.height } : { aspectRatio: 16 / 9 }}
        />
      </div>
    );
  }

  const photos = media.slice(0, 4);
  const count = photos.length;
  return (
    <div className={cn('grid gap-1 overflow-hidden rounded-2xl border border-line', GRID[count], count > 1 && 'aspect-[4/3]')}>
      {photos.map((item, index) => (
        <Photo
          key={item.id}
          item={item}
          single={count === 1}
          alt={count === 1 ? `Photo shared by ${authorName}` : `Photo ${index + 1} of ${count} shared by ${authorName}`}
          className={cn(count === 3 && index === 0 && 'row-span-2')}
        />
      ))}
    </div>
  );
}
