import { useState } from 'react';
import { cn } from '@/utils/cn';
import { getInitials, hashString } from '@/utils/string';

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-base',
  xl: 'size-20 text-xl',
  '2xl': 'size-28 text-3xl sm:size-32 sm:text-4xl',
};

// Squircle corners scale with size; `shape="circle"` is used for profile photos.
const SQUIRCLE = {
  xs: 'rounded-lg',
  sm: 'rounded-xl',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  xl: 'rounded-3xl',
  '2xl': 'rounded-[2rem]',
};

// Fallback tones for initials, chosen per name so a person keeps the same colour.
const TONES = [
  'bg-leaf-100 text-leaf-800 dark:bg-leaf-900 dark:text-leaf-200',
  'bg-sun-100 text-sun-700 dark:bg-sun-900 dark:text-sun-300',
  'bg-leaf-200 text-leaf-900 dark:bg-leaf-800 dark:text-leaf-100',
  'bg-surface-muted text-ink-muted',
];

/**
 * Photo with a consistent CampusX fallback: the student's initials on a tone picked from their
 * name. A missing or broken image (e.g. deleted on Cloudinary) shows the initials, never a
 * broken-image icon.
 */
export function Avatar({ src, name = '', size = 'md', shape = 'squircle', className }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const showImage = Boolean(src) && failedSrc !== src;

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden font-bold select-none',
        SIZES[size],
        shape === 'circle' ? 'rounded-full' : SQUIRCLE[size],
        !showImage && TONES[hashString(name) % TONES.length],
        className,
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt={name}
          className="size-full object-cover"
          loading="lazy"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <>
          <span aria-hidden="true">{getInitials(name)}</span>
          {name && <span className="sr-only">{name}</span>}
        </>
      )}
    </span>
  );
}
