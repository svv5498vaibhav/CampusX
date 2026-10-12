import { useEffect } from 'react';
import { APP_NAME, APP_TAGLINE } from '@/constants/app';

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : `${APP_NAME} · ${APP_TAGLINE}`;
  }, [title]);
}
