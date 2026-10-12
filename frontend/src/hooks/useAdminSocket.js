import { useEffect } from 'react';
import { SOCKET_EVENTS } from '@/constants/notifications';
import { connectSocket, disconnectSocket, onSocketStatus } from '@/services/socket';
import { useAdminStore } from '@/store/adminStore';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';

/**
 * Live admin alerts while the control center is open: this tab's single Socket.IO connection (the same
 * one campus pages use), listening for the staff-only events. The server sends them only to moderators
 * and admins; payloads are ids, kinds and levels. Urgent ones also show a toast.
 */
export function useAdminSocket() {
  const userId = useAuthStore((state) => state.user?.id);

  useEffect(() => {
    if (!userId) return undefined;
    const store = () => useAdminStore.getState();
    const stopStatus = onSocketStatus((status) => store().setLiveStatus(status));
    const socket = connectSocket(userId);
    if (socket.connected) store().setLiveStatus('live');

    const urgent = (priority) => ['high', 'critical'].includes(priority);
    const handlers = {
      [SOCKET_EVENTS.ADMIN_NEW_REPORT]: (payload) => {
        store().pushEvent({ kind: 'report', ...payload });
        if (urgent(payload.priority)) toast.info(`New ${payload.priority}-priority report`);
      },
      [SOCKET_EVENTS.ADMIN_NEW_MODERATION_CASE]: (payload) => {
        store().pushEvent({ kind: 'case', ...payload });
        if (urgent(payload.priority)) toast.info(`New ${payload.priority} moderation case`);
      },
      [SOCKET_EVENTS.ADMIN_SYSTEM_ALERT]: (payload) => {
        store().pushEvent({ kind: 'system', ...payload });
        (payload.level === 'warning' ? toast.error : toast.info)(payload.message);
        store().refreshSystem();
      },
    };
    Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));

    return () => {
      Object.entries(handlers).forEach(([event, handler]) => socket.off(event, handler));
      stopStatus();
      disconnectSocket();
      store().setLiveStatus('offline');
    };
  }, [userId]);
}
