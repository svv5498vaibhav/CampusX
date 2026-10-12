import { useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { cn } from '@/utils/cn';

/** The project's images: a large view with thumbnails below. Images load lazily. */
export function ProjectMedia({ images, title }) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState({});
  if (!images?.length) return null;
  const current = images[Math.min(index, images.length - 1)];
  const go = (step) => setIndex((value) => (value + step + images.length) % images.length);

  return (
    <section aria-label="Project images" className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface-muted">
        {failed[current.id] ? (
          <div className="grid aspect-video place-items-center text-sm text-ink-subtle">
            <span className="inline-flex items-center gap-2"><ImageOff className="size-4" aria-hidden="true" /> Image unavailable</span>
          </div>
        ) : (
          <img
            key={current.id}
            src={current.url}
            alt={`${title}: image ${index + 1} of ${images.length}`}
            loading="lazy"
            onError={() => setFailed((value) => ({ ...value, [current.id]: true }))}
            className="max-h-[32rem] w-full object-contain"
            style={current.width && current.height ? { aspectRatio: current.width / current.height } : { aspectRatio: 16 / 9 }}
          />
        )}
        {images.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous image" className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/75">
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next image" className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/75">
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      {images.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {images.map((image, i) => (
            <li key={image.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show image ${i + 1}`}
                aria-current={i === index ? 'true' : undefined}
                className={cn('block size-16 overflow-hidden rounded-xl border-2 transition-colors', i === index ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100')}
              >
                <img src={image.url} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
