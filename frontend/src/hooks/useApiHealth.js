import { useCallback, useEffect, useRef, useState } from 'react';
import { checkApiHealth } from '@/services/health.service';

const INITIAL_STATE = { status: 'checking', health: null, error: null, checkedAt: null };

/**
 * Checks GET /health.
 * status: 'checking' | 'online' | 'offline'
 * health: the API's `data` payload (environment, database, redis) when online
 */
export function useApiHealth() {
  const [state, setState] = useState(INITIAL_STATE);
  const controllerRef = useRef(null);

  const refresh = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((previous) => ({ ...previous, status: 'checking' }));

    try {
      const body = await checkApiHealth({ signal: controller.signal });
      setState({ status: 'online', health: body.data ?? null, error: null, checkedAt: new Date() });
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({ status: 'offline', health: null, error: error.message, checkedAt: new Date() });
    }
  }, []);

  useEffect(() => {
    refresh();
    return () => controllerRef.current?.abort();
  }, [refresh]);

  return { ...state, refresh };
}
