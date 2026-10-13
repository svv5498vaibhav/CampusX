/**
 * Follows, blocks and direct messages: every rule and limit in one place. The services, validators and
 * rate limiters read only from here.
 */

export const FOLLOW_RULES = Object.freeze({
  // Followers / Following lists (cursor pagination, newest relationship first).
  pageSize: { default: 20, max: 50 },
  // "Is the viewer following these students?" for cards (search results, recommendations).
  statusBatchMax: 50,
  // Searching inside one student's followers/following list.
  searchMaxLength: 60,
  // A followers list filtered by name stops looking after this long instead of keeping the database busy.
  searchTimeoutMs: 3000,
});

export const MESSAGE_RULES = Object.freeze({
  // Plain text only (rendered as text, never HTML).
  maxLength: 2000,
  // Conversation history pages (cursor pagination, newest first).
  pageSize: { default: 30, max: 50 },
  // The inbox (conversations by latest activity).
  conversationPageSize: { default: 20, max: 50 },
  // The last message shown in the inbox and in live updates.
  previewLength: 120,
  // Unread messages counted per conversation ("99+" beyond this).
  unreadCountCap: 99,
  // Lets a retried send (same clientId) return the message it already created instead of a duplicate.
  clientIdMaxLength: 64,
});

/**
 * 429 limits, per signed-in student on the shared store (Redis when connected). Generous for normal use:
 * following a whole class from a list or chatting quickly never reaches them; scripted floods do.
 */
export const SOCIAL_RATE_LIMITS = Object.freeze({
  follows: { windowMinutes: 15, max: 120, message: "You're following and unfollowing very quickly. Please wait a few minutes." },
  blocks: { windowMinutes: 15, max: 30, message: "You've changed a lot of blocks recently. Please wait a few minutes." },
  messages: { windowMinutes: 1, max: 30, message: "You're sending messages very quickly. Please slow down for a moment." },
  // Marking conversations read happens on its own while a chat is open; only floods reach this.
  reads: { windowMinutes: 15, max: 600, message: "You're updating conversations very quickly. Please wait a moment." },
  // Starting conversations with many different students is a spam pattern; replying never counts here.
  conversations: { windowMinutes: 60, max: 40, message: "You've started a lot of new conversations in the last hour. Please try again later." },
});
