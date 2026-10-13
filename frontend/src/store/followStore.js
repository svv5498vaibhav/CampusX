import { create } from 'zustand';
import { followApi } from '@/services/socialApi';
import { toast } from '@/store/toastStore';

const INITIAL_STATE = {
  viewerId: null,
  // userId → { isFollowing, followsYou?, blockedByYou?, canFollow, canMessage? } as the signed-in student sees it.
  relations: {},
  // userId → { followersCount, followingCount }, the signed-in student's own included.
  counts: {},
  // userId → 'follow' | 'unfollow' | 'block' | 'unblock' while a request for that student is in flight.
  pending: {},
  // userId → time of the latest follow made in this tab (drives the celebration, once).
  celebrations: {},
  // userId → server time (`at`) of the newest answer applied, so a late live update never undoes a newer one.
  appliedAt: {},
};

// Ids waiting for one batched "is the viewer following them?" request (cards mount together).
let queued = new Set();
let flushTimer = null;
const STATUS_BATCH = 50;

const withCountChange = (counts, userId, field, delta) => {
  const current = counts[userId];
  if (!current) return counts;
  return { ...counts, [userId]: { ...current, [field]: Math.max(0, current[field] + delta) } };
};

/**
 * Follow state for every screen at once: profile pages, followers/following lists, search results and
 * recommendation cards all read the same entry, so following someone anywhere updates it everywhere.
 *
 * Following and unfollowing are optimistic: the button and counts change at once, the server's answer (its
 * real counts) replaces them, and a failure puts everything back as it was. One request per student at a
 * time: a second tap while one is in flight is ignored, so duplicate requests can't be sent from here.
 */
export const useFollowStore = create((set, get) => {
  /** The server's answer to any follow/block action (or a live update) replaces the local copy. */
  const applyResult = (result) => {
    if (!result?.userId) return;
    set((state) => {
      if (result.at && state.appliedAt[result.userId] > result.at) return {};
      return {
        relations: { ...state.relations, [result.userId]: { ...state.relations[result.userId], ...result.relationship } },
        counts: {
          ...state.counts,
          [result.userId]: result.counts,
          ...(state.viewerId && result.viewerCounts && { [state.viewerId]: result.viewerCounts }),
        },
        ...(result.at && { appliedAt: { ...state.appliedAt, [result.userId]: result.at } }),
      };
    });
  };

  const setPending = (userId, value) =>
    set((state) => {
      const pending = { ...state.pending };
      if (value) pending[userId] = value;
      else delete pending[userId];
      return { pending };
    });

  async function flushStatuses() {
    flushTimer = null;
    const ids = [...queued];
    queued = new Set();
    for (let index = 0; index < ids.length; index += STATUS_BATCH) {
      const batch = ids.slice(index, index + STATUS_BATCH);
      let statuses = {};
      try {
        statuses = await followApi.statuses(batch);
      } catch {
        // Cards then simply show no follow button; nothing else depends on it.
      }
      set((state) => {
        const relations = { ...state.relations };
        for (const userId of batch) {
          // A tap in flight (or a state learned meanwhile) wins over a status read before it.
          if (state.pending[userId]) continue;
          // Students the server left out (no longer active) or couldn't answer for: no follow button.
          relations[userId] = statuses[userId] ? { ...relations[userId], ...statuses[userId] } : (relations[userId] ?? { isFollowing: false, canFollow: false });
        }
        return { relations };
      });
    }
  }

  return {
    ...INITIAL_STATE,

    /** Clears everything when a different student signs in (or out). */
    forViewer: (userId) => {
      if (get().viewerId === userId) return;
      queued = new Set();
      set({ ...INITIAL_STATE, viewerId: userId });
    },

    /** Counts and relationship from a profile response (GET /profile or /profile/:id). */
    seedProfile: (profile) => {
      if (!profile?.social) return;
      const { followersCount, followingCount, relationship } = profile.social;
      set((state) => ({
        counts: { ...state.counts, [profile.id]: { followersCount, followingCount } },
        ...(relationship && !state.pending[profile.id] && { relations: { ...state.relations, [profile.id]: relationship } }),
      }));
    },

    /** Follow state from a followers/following list (one row per student). */
    seedStudents: (students) =>
      set((state) => {
        const relations = { ...state.relations };
        for (const student of students) {
          if (student.isYou || state.pending[student.id]) continue;
          relations[student.id] = { ...relations[student.id], isFollowing: student.isFollowing, canFollow: student.canFollow };
        }
        return { relations };
      }),

    /** Asks (in one batched request) whether the viewer follows these students, unless already known. */
    ensureStatuses: (userIds) => {
      const { relations, viewerId } = get();
      for (const id of userIds) if (id && id !== viewerId && !relations[id]) queued.add(id);
      if (queued.size && !flushTimer) flushTimer = setTimeout(flushStatuses, 30);
    },

    /** Follows or unfollows (optimistic, rolled back on failure). Resolves true when the server agreed. */
    toggleFollow: async (userId, { name } = {}) => {
      const state = get();
      const relation = state.relations[userId];
      if (!relation || state.pending[userId] || !state.viewerId || userId === state.viewerId) return false;
      const follow = !relation.isFollowing;
      if (follow && relation.canFollow === false) return false;
      const before = { relation, counts: state.counts[userId], viewerCounts: state.counts[state.viewerId] };

      set((current) => {
        let counts = withCountChange(current.counts, userId, 'followersCount', follow ? 1 : -1);
        counts = withCountChange(counts, current.viewerId, 'followingCount', follow ? 1 : -1);
        return {
          relations: { ...current.relations, [userId]: { ...relation, isFollowing: follow } },
          counts,
          pending: { ...current.pending, [userId]: follow ? 'follow' : 'unfollow' },
          ...(follow && { celebrations: { ...current.celebrations, [userId]: Date.now() } }),
        };
      });

      try {
        applyResult(follow ? await followApi.follow(userId) : await followApi.unfollow(userId));
        return true;
      } catch (error) {
        // Put back exactly what was there before this tap.
        set((current) => ({
          relations: { ...current.relations, [userId]: before.relation },
          counts: {
            ...current.counts,
            ...(before.counts && { [userId]: before.counts }),
            ...(before.viewerCounts && { [current.viewerId]: before.viewerCounts }),
          },
          celebrations: Object.fromEntries(Object.entries(current.celebrations).filter(([id]) => id !== userId)),
        }));
        toast.error(error?.message || `We couldn't ${follow ? 'follow' : 'unfollow'} ${name ?? 'this student'}. Please try again.`);
        // Refused for a reason that may have changed the relationship (e.g. a block): ask the server.
        if ([403, 409].includes(error?.status)) get().refreshRelationship(userId);
        return false;
      } finally {
        setPending(userId, null);
      }
    },

    /** Blocks or unblocks (waits for the server: not optimistic). */
    setBlocked: async (userId, blocked, { name } = {}) => {
      if (get().pending[userId]) return false;
      setPending(userId, blocked ? 'block' : 'unblock');
      try {
        applyResult(blocked ? await followApi.block(userId) : await followApi.unblock(userId));
        toast.success(blocked ? `${name ?? 'Student'} is blocked.` : `${name ?? 'Student'} is unblocked.`);
        return true;
      } catch (error) {
        toast.error(error?.message || "We couldn't change that right now. Please try again.");
        return false;
      } finally {
        setPending(userId, null);
      }
    },

    refreshRelationship: async (userId) => {
      try {
        applyResult(await followApi.relationship(userId));
      } catch {
        // Keep what we have; the next profile load corrects it.
      }
    },

    // ----------------------------------------------------------------- live updates (Socket.IO)

    /** This student followed/unfollowed/blocked someone in another tab. */
    applyRelationshipUpdate: (payload) => {
      if (get().pending[payload?.userId]) return; // this tab's own request answers for itself
      applyResult(payload);
    },

    /** Someone followed or unfollowed the signed-in student: their own counts changed. */
    applyOwnCounts: ({ followersCount, followingCount, at }) => {
      const { viewerId } = get();
      if (!viewerId) return;
      set((state) => {
        const key = `own:${viewerId}`;
        if (at && state.appliedAt[key] > at) return {};
        return {
          counts: { ...state.counts, [viewerId]: { followersCount, followingCount } },
          ...(at && { appliedAt: { ...state.appliedAt, [key]: at } }),
        };
      });
    },

    reset: () => {
      queued = new Set();
      set(INITIAL_STATE);
    },
  };
});
