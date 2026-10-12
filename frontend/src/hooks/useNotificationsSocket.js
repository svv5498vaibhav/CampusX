import { useEffect } from 'react';
import { SOCKET_EVENTS } from '@/constants/notifications';
import { connectSocket, disconnectSocket, onSocketStatus } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';

/**
 * Live notifications for the signed-in student: loads the unread count, opens this tab's single
 * Socket.IO connection and feeds its events into the notification store. Mounted once, in the campus
 * layout. Logging out (or switching accounts) closes the connection and clears the store.
 */
export function useNotificationsSocket() {
  const userId = useAuthStore((state) => state.user?.id);

  useEffect(() => {
    if (!userId) return undefined;
    const store = () => useNotificationStore.getState();
    store().forViewer(userId);
    store().fetchUnreadCount();

    let connectedBefore = false;
    const stopStatus = onSocketStatus((status) => {
      store().setLiveStatus(status);
      if (status !== 'live') return;
      // Back online after a drop: fetch whatever arrived meanwhile (REST stays the source of truth).
      if (connectedBefore) store().resync();
      connectedBefore = true;
    });

    const socket = connectSocket(userId);
    const handlers = {
      [SOCKET_EVENTS.NOTIFICATION_NEW]: ({ notification, unreadCount }) => store().addRealtimeNotification(notification, unreadCount),
      [SOCKET_EVENTS.NOTIFICATION_READ]: (payload) => store().applyRead(payload),
      [SOCKET_EVENTS.NOTIFICATION_DELETED]: (payload) => store().applyDeleted(payload),
      [SOCKET_EVENTS.NOTIFICATION_COUNT]: ({ unreadCount }) => store().updateUnreadCount(unreadCount),
    };
    Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));

    return () => {
      Object.entries(handlers).forEach(([event, handler]) => socket.off(event, handler));
      stopStatus();
      disconnectSocket();
    };
  }, [userId]);
}
