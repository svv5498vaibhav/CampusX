import { useState } from 'react';
import { COMMUNITY_TYPE_STYLES } from '@/constants/communities';
import { cn } from '@/utils/cn';

const SIZES = {
  sm: 'size-10 rounded-xl [&_svg]:size-5',
  md: 'size-12 rounded-2xl [&_svg]:size-6',
  lg: 'size-16 rounded-2xl [&_svg]:size-7',
  xl: 'size-20 rounded-3xl [&_svg]:size-9 sm:size-24',
};

/** The community's icon, or its type's symbol on a campus-green tile when there is none (or it fails to load). */
export function CommunityIcon({ community, size = 'md', className }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const { icon: TypeIcon } = COMMUNITY_TYPE_STYLES[community.type] ?? COMMUNITY_TYPE_STYLES['student-created'];
  const showImage = Boolean(community.iconUrl) && failedSrc !== community.iconUrl;

  return (
    <span
      className={cn(
        'relative inline-grid shrink-0 place-items-center overflow-hidden bg-primary-soft text-primary-soft-fg',
        SIZES[size],
        className,
      )}
    >
      {showImage ? (
        <img src={community.iconUrl} alt="" loading="lazy" className="size-full object-cover" onError={() => setFailedSrc(community.iconUrl)} />
      ) : (
        <TypeIcon aria-hidden="true" />
      )}
    </span>
  );
}
