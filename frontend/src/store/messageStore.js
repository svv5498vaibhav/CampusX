import { create } from 'zustand';
import { MESSAGE_PAGE_SIZE } from '@/constants/messages';
import { messageApi } from '@/services/socialApi';

const INITIAL_STATE = {
  viewerId: null,
  // Conversations with unread messages (the Messages badge). From the API and live updates.
  unreadCount: 0,
  // The inbox: conversation ids, latest activity first, and each conversation as the viewer sees it.
  inboxIds: [],
  conversations: {},
  inboxStatus: 'idle', // idle | loading | loading-more | ready | error
  inboxError: '',
  inboxCursor: null,
  inboxHasMore: false,
  // conversationId → { messages, status, error, hasMore, cursor, loadingOlder }
  threads: {},
  // The conversation on screen (its new messages are marked read as they arrive).
  activeId: null,
};

const EMPTY_THREAD = { messages: [], status: 'idle', error: '', hasMore: false, cursor: null, loadingOlder: false };
// Requests for a thread that was left meanwhile are cancelled.
const threadRequests = new Map();

const newClientId = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
const byLatest = (conversations) => (a, b) => new Date(conversations[b]?.lastMessageAt ?? 0) - new Date(conversations[a]?.lastMessageAt ?? 0);

/** Adds or replaces messages (matched by id, or by clientId for this tab's own sends), oldest first. */
function mergeMessages(existing, incoming) {
  const list = [...existing];
  for (const message of incoming) {
    const index = list.findIndex((item) => item.id === message.id || (message.clientId && item.clientId === message.clientId));
    if (index === -1) list.push(message);
    else list[index] = { ...list[index], ...message, status: undefined, error: undefined };
  }
  // Messages still being sent stay at the end, in the order they were written.
  const sent = list.filter((item) => !item.status).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return [...sent, ...list.filter((item) => item.status)];
}

/**
 * Direct messages: the inbox, open conversations and the unread badge. The server is the source of truth;
 * live updates (Socket.IO) only fill things in sooner, and a reconnect reloads from the API.
 */
export const useMessageStore = create((set, get) => {
  const updateThread = (id, change) =>
    set((state) => ({ threads: { ...state.threads, [id]: { ...EMPTY_THREAD, ...state.threads[id], ...change(state.threads[id] ?? EMPTY_THREAD) } } }));

  /** Stores a conversation and moves it to its place in the inbox (only once it has a message). */
  const upsertConversation = (conversation) => {
    if (!conversation?.id) return;
    set((state) => {
      const conversations = { ...state.conversations, [conversation.id]: { ...state.conversations[conversation.id], ...conversation } };
      const inInbox = state.inboxIds.includes(conversation.id);
      const inboxIds = conversation.lastMessageAt || inInbox ? [...new Set([conversation.id, ...state.inboxIds])].sort(byLatest(conversations)) : state.inboxIds;
      return { conversations, inboxIds };
    });
  };

  return {
    ...INITIAL_STATE,

    forViewer: (userId) => {
      if (get().viewerId === userId) return;
      threadRequests.forEach((controller) => controller.abort());
      threadRequests.clear();
      set({ ...INITIAL_STATE, viewerId: userId });
    },

    fetchUnreadCount: async () => {
      try {
        set({ unreadCount: await messageApi.unreadCount() });
      } catch {
        // Keep the last known count; the next live update or reload corrects it.
      }
    },

    fetchInbox: async ({ more = false } = {}) => {
      const { inboxCursor, inboxHasMore, inboxStatus } = get();
      if (more && (!inboxHasMore || inboxStatus === 'loading-more')) return;
      set({ inboxStatus: more ? 'loading-more' : get().inboxIds.length ? 'ready' : 'loading', inboxError: '' });
      try {
        const result = await messageApi.inbox({ cursor: more ? inboxCursor : undefined });
        set((state) => {
          const conversations = { ...state.conversations };
          for (const conversation of result.conversations) conversations[conversation.id] = conversation;
          const ids = result.conversations.map((conversation) => conversation.id);
          return {
            conversations,
            inboxIds: more ? [...new Set([...state.inboxIds, ...ids])] : ids,
            inboxCursor: result.pagination.nextCursor,
            inboxHasMore: result.pagination.hasMore,
            unreadCount: result.unreadCount,
            inboxStatus: 'ready',
          };
        });
      } catch (error) {
        set({ inboxStatus: more || get().inboxIds.length ? 'ready' : 'error', inboxError: error.message });
      }
    },

    /** The conversation with a student (existing or new). Resolves its id; rejects with the API error. */
    openWithStudent: async (userId) => {
      const conversation = await messageApi.open(userId);
      upsertConversation(conversation);
      return conversation.id;
    },

    setActive: (conversationId) => set({ activeId: conversationId ?? null }),

    /** Loads a conversation and its latest messages (cancelling a load for a conversation left meanwhile). */
    loadConversation: async (conversationId) => {
      threadRequests.get(conversationId)?.abort();
      const controller = new AbortController();
      threadRequests.set(conversationId, controller);
      updateThread(conversationId, (thread) => ({ status: thread.messages.length ? 'ready' : 'loading', error: '' }));
      try {
        const [conversation, page] = await Promise.all([
          messageApi.get(conversationId),
          messageApi.messages(conversationId, { limit: MESSAGE_PAGE_SIZE }, { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        upsertConversation(conversation);
        updateThread(conversationId, (thread) => ({
          messages: mergeMessages(thread.messages.filter((item) => item.status), page.messages),
          hasMore: page.pagination.hasMore,
          cursor: page.pagination.nextCursor,
          status: 'ready',
        }));
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'CanceledError') return;
        updateThread(conversationId, () => ({ status: error.status === 404 ? 'not-found' : 'error', error: error.message }));
      } finally {
        if (threadRequests.get(conversationId) === controller) threadRequests.delete(conversationId);
      }
    },

    /** Reloads one conversation's details (e.g. after a block changed whether it can be messaged). */
    refreshConversation: async (conversationId) => {
      try {
        upsertConversation(await messageApi.get(conversationId));
      } catch {
        // Keep what's shown; sending still asks the server.
      }
    },

    loadOlder: async (conversationId) => {
      const thread = get().threads[conversationId];
      if (!thread?.hasMore || thread.loadingOlder) return;
      updateThread(conversationId, () => ({ loadingOlder: true }));
      try {
        const page = await messageApi.messages(conversationId, { before: thread.cursor, limit: MESSAGE_PAGE_SIZE });
        updateThread(conversationId, (current) => ({
          messages: mergeMessages(page.messages, current.messages),
          hasMore: page.pagination.hasMore,
          cursor: page.pagination.nextCursor,
          loadingOlder: false,
        }));
      } catch {
        updateThread(conversationId, () => ({ loadingOlder: false }));
      }
    },

    /**
     * Sends a message: shown at once as "Sending…", replaced by the saved message, or marked failed with a
     * retry. The same clientId is reused for retries, so the server never saves it twice.
     */
    send: async (conversationId, text, { clientId = newClientId() } = {}) => {
      const local = { id: `local-${clientId}`, clientId, conversationId, isMine: true, text, createdAt: new Date().toISOString(), status: 'sending' };
      updateThread(conversationId, (thread) => ({ messages: [...thread.messages.filter((item) => item.clientId !== clientId), local] }));
      try {
        const result = await messageApi.send(conversationId, { text, clientId });
        updateThread(conversationId, (thread) => ({ messages: mergeMessages(thread.messages, [result.message]) }));
        upsertConversation(result.conversation);
        return true;
      } catch (error) {
        updateThread(conversationId, (thread) => ({
          messages: thread.messages.map((item) => (item.clientId === clientId ? { ...item, status: 'failed', error: error.message } : item)),
        }));
        return false;
      }
    },

    retry: (conversationId, clientId) => {
      const message = get().threads[conversationId]?.messages.find((item) => item.clientId === clientId);
      if (message?.status === 'failed') get().send(conversationId, message.text, { clientId });
    },

    discardFailed: (conversationId, clientId) =>
      updateThread(conversationId, (thread) => ({ messages: thread.messages.filter((item) => item.clientId !== clientId || item.status !== 'failed') })),

    /** Marks the conversation read when it has something unread (shown at once, confirmed by the server). */
    markRead: async (conversationId) => {
      const conversation = get().conversations[conversationId];
      if (!conversation?.lastMessage || conversation.lastMessage.isMine || conversation.lastReadId === conversation.lastMessage.id) return;
      upsertConversation({ id: conversationId, unreadCount: 0, lastReadId: conversation.lastMessage.id });
      try {
        const result = await messageApi.markRead(conversationId);
        set({ unreadCount: result.unreadCount });
      } catch {
        // The next load shows the server's state.
      }
    },

    // ----------------------------------------------------------------- live updates (Socket.IO)

    applyNewMessage: ({ conversation, message }) => {
      if (!conversation || !message) return;
      upsertConversation(conversation);
      if (get().threads[conversation.id]) updateThread(conversation.id, (thread) => ({ messages: mergeMessages(thread.messages, [message]) }));
      const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
      if (!message.isMine && get().activeId === conversation.id && visible) get().markRead(conversation.id);
    },

    applyRead: ({ conversationId, userId, lastReadId }) => {
      const conversation = get().conversations[conversationId];
      if (!conversation) return;
      if (userId === get().viewerId) upsertConversation({ id: conversationId, lastReadId, unreadCount: 0 });
      else upsertConversation({ id: conversationId, otherLastReadId: lastReadId });
    },

    applyUnreadCount: ({ unreadCount }) => set({ unreadCount }),

    /** After a reconnect: whatever arrived meanwhile comes from the API. */
    resync: () => {
      get().fetchUnreadCount();
      if (get().inboxStatus !== 'idle') get().fetchInbox();
      const { activeId } = get();
      if (activeId) get().loadConversation(activeId);
    },

    reset: () => {
      threadRequests.forEach((controller) => controller.abort());
      threadRequests.clear();
      set(INITIAL_STATE);
    },
  };
});
