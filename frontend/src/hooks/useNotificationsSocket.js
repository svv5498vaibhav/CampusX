import { useEffect } from 'react';
import { SOCKET_EVENTS } from '@/constants/notifications';
import { connectSocket, disconnectSocket, onSocketStatus } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';
import { useEliteStore } from '@/store/eliteStore';
import { useFollowStore } from '@/store/followStore';
import { useMessageStore } from '@/store/messageStore';
import { useNotificationStore } from '@/store/notificationStore';

/**
 * Live updates for the signed-in student: loads the unread counts (notifications and messages), opens this
 * tab's single Socket.IO connection and feeds its events into the notification, follow, message and elite
 * rank stores.
 * Mounted once, in the campus layout. Logging out (or switching accounts) closes the connection and clears
 * the stores. Sockets only deliver: after a dropped connection everything is reloaded from the REST API.
 */
export function useNotificationsSocket() {
  const userId = useAuthStore((state) => state.user?.id);

  useEffect(() => {
    if (!userId) return undefined;
    const store = () => useNotificationStore.getState();
    const follows = () => useFollowStore.getState();
    const messages = () => useMessageStore.getState();
    store().forViewer(userId);
    follows().forViewer(userId);
    messages().forViewer(userId);
    store().fetchUnreadCount();
    messages().fetchUnreadCount();

    let connectedBefore = false;
    const stopStatus = onSocketStatus((status) => {
      store().setLiveStatus(status);
      if (status !== 'live') return;
      // Back online after a drop: fetch whatever arrived meanwhile (REST stays the source of truth).
      if (connectedBefore) {
        store().resync();
        messages().resync();
        useEliteStore.getState().fetchOverview();
      }
      connectedBefore = true;
    });

    const socket = connectSocket(userId);
    const handlers = {
      [SOCKET_EVENTS.NOTIFICATION_NEW]: ({ notification, unreadCount }) => store().addRealtimeNotification(notification, unreadCount),
      [SOCKET_EVENTS.NOTIFICATION_READ]: (payload) => store().applyRead(payload),
      [SOCKET_EVENTS.NOTIFICATION_DELETED]: (payload) => store().applyDeleted(payload),
      [SOCKET_EVENTS.NOTIFICATION_COUNT]: ({ unreadCount }) => store().updateUnreadCount(unreadCount),
      [SOCKET_EVENTS.RELATIONSHIP_UPDATED]: (payload) => follows().applyRelationshipUpdate(payload),
      [SOCKET_EVENTS.FOLLOW_COUNTS]: (payload) => follows().applyOwnCounts(payload),
      [SOCKET_EVENTS.MESSAGE_NEW]: (payload) => messages().applyNewMessage(payload),
      [SOCKET_EVENTS.CONVERSATION_READ]: (payload) => messages().applyRead(payload),
      [SOCKET_EVENTS.MESSAGE_UNREAD_COUNT]: (payload) => messages().applyUnreadCount(payload),
      [SOCKET_EVENTS.ELITE_RANKS_UPDATED]: (payload) => useEliteStore.getState().applyRemoteUpdate(payload),
    };
    Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));

    return () => {
      Object.entries(handlers).forEach(([event, handler]) => socket.off(event, handler));
      stopStatus();
      disconnectSocket();
    };
  }, [userId]);
}
