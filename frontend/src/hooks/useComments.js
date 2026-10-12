import { useCallback, useEffect, useRef, useState } from 'react';
import { postApi } from '@/services/postApi';
import { useFeedStore } from '@/store/feedStore';

const PAGE_SIZE = 10;

/**
 * Comments for one post, loaded only when the section is opened, a page at a time (newest first).
 * New comment counts are pushed into the feed store so the post card stays in step.
 */
export function useComments(postId, { enabled = true } = {}) {
  const [comments, setComments] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const setCommentCount = useFeedStore((state) => state.setCommentCount);
  const removeLocal = useFeedStore((state) => state.removeLocal);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const data = await postApi.listComments(postId, { page: 1, limit: PAGE_SIZE });
      if (!mounted.current) return;
      setComments(data.comments);
      setPagination(data.pagination);
      setStatus('ready');
    } catch (requestError) {
      if (!mounted.current) return;
      if (requestError.status === 404) removeLocal(postId);
      setError(requestError.message);
      setStatus('error');
    }
  }, [postId, removeLocal]);

  useEffect(() => {
    if (enabled && status === 'idle') load();
  }, [enabled, status, load]);

  const loadMore = async () => {
    if (!pagination?.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await postApi.listComments(postId, { page: pagination.page + 1, limit: PAGE_SIZE });
      if (!mounted.current) return;
      setComments((current) => {
        const shown = new Set(current.map((comment) => comment.id));
        return [...current, ...data.comments.filter((comment) => !shown.has(comment.id))];
      });
      setPagination(data.pagination);
    } catch (requestError) {
      if (mounted.current) setError(requestError.message);
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  };

  // These reject with the API error so the form can show it.
  const add = async (content) => {
    const { comment, commentCount } = await postApi.addComment(postId, content);
    setComments((current) => [comment, ...current]);
    setPagination((current) => current && { ...current, total: current.total + 1 });
    setCommentCount(postId, commentCount);
    return comment;
  };

  const update = async (commentId, content) => {
    const comment = await postApi.updateComment(commentId, content);
    setComments((current) => current.map((item) => (item.id === commentId ? comment : item)));
    return comment;
  };

  const remove = async (commentId) => {
    const { commentCount } = await postApi.deleteComment(commentId);
    setComments((current) => current.filter((item) => item.id !== commentId));
    setPagination((current) => current && { ...current, total: Math.max(0, current.total - 1) });
    setCommentCount(postId, commentCount);
  };

  return { comments, pagination, status, error, loadingMore, reload: load, loadMore, add, update, remove };
}
