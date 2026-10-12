/**
 * Runs tasks that share a key one after another (different keys run in parallel). A failing task is
 * handed to `onError` and never reaches the caller. The campus event listeners use it so that, e.g.,
 * a quick like/unlike of the same post can't interleave.
 */
export function createKeyedQueue(onError) {
  const queues = new Map();

  return {
    run(key, task) {
      const next = (queues.get(key) ?? Promise.resolve())
        .then(task)
        .catch((error) => onError(key, error))
        .finally(() => {
          if (queues.get(key) === next) queues.delete(key);
        });
      queues.set(key, next);
      return next;
    },

    /** Resolves once every queued task has finished (used by shutdown and tests). */
    async settled() {
      while (queues.size) await Promise.allSettled([...queues.values()]);
    },
  };
}

/**
 * Like createKeyedQueue, but for request handlers: tasks that share a key run one after another and each
 * caller gets its own task's result or error. Used where two staff members might act on the same thing
 * at the same moment (e.g. deciding one moderation case), so the second sees the first one's result.
 */
export function createKeyedLock() {
  const tails = new Map();

  return function withLock(key, task) {
    const result = (tails.get(key) ?? Promise.resolve()).then(task);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    tails.set(key, tail);
    tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return result;
  };
}
