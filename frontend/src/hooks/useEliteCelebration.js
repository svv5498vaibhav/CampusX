import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useEliteStore } from '@/store/eliteStore';

const seenKey = (userId) => `campusx:elite-seen:${userId}`;

function readSeen(userId) {
  try {
    return JSON.parse(localStorage.getItem(seenKey(userId)) ?? 'null');
  } catch {
    return null;
  }
}

function writeSeen(userId, value) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify(value));
  } catch {
    /* storage blocked: the change is still celebrated in this tab */
  }
}

/**
 * The signed-in student's elite rank, watched for changes to celebrate (RankChangeAnimation). Loads the
 * holders once on campus pages; "elite:updated" reloads them (useNotificationsSocket). The tier last seen on
 * this device is remembered, so a change that happened while away is shown on the next visit, once; the
 * first visit on a device only remembers it. The rank always comes from the API.
 * Returns [change | null, dismiss].
 */
export function useEliteCelebration() {
  const userId = useAuthStore((state) => state.user?.id);
  const overview = useEliteStore((state) => state.overview);
  const [change, setChange] = useState(null);

  useEffect(() => {
    if (!userId) return;
    useEliteStore.getState().forViewer(userId);
    useEliteStore.getState().fetchOverview();
  }, [userId]);

  const ready = overview?.status === 'ready';
  const seq = overview?.seq;
  const tier = overview?.you?.tier ?? null;
  useEffect(() => {
    if (!userId || !ready) return;
    const seen = readSeen(userId);
    if (seen && typeof seen.seq === 'number' && seen.seq > seq) return; // an older answer than what we saw
    writeSeen(userId, { seq, tier });
    if (seen && (seen.tier ?? null) !== tier) setChange({ key: `${seq}:${tier}`, tier, previousTier: seen.tier ?? null });
  }, [userId, ready, seq, tier]);

  const dismiss = useCallback(() => setChange(null), []);
  return [change, dismiss];
}
