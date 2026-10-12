import { useSyncExternalStore } from 'react';

/*
 * The current time, refreshed every minute for every component that uses it (one shared timer), so
 * countdowns like "Deadline today" move on by themselves while a page stays open.
 */
const TICK_MS = 60_000;
const listeners = new Set();
let now = Date.now();
let timer = null;

function subscribe(listener) {
  listeners.add(listener);
  if (!timer) {
    // Nothing was ticking: catch up first (React re-reads the snapshot after subscribing).
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((notify) => notify());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => now;

export function useNow() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
