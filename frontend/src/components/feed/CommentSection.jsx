import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Flag, Pencil, SendHorizontal, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { ModerationNotice } from '@/components/safety/ModerationNotice';
import { ReportModal } from '@/components/safety/ReportModal';
import { Avatar, Button } from '@/components/ui';
import { profilePath } from '@/constants/routes';
import { useComments } from '@/hooks/useComments';
import { useAuthStore } from '@/store/authStore';
import { useFeedStore } from '@/store/feedStore';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';
import { getFullName } from '@/utils/string';
import { formatDateTime, formatRelativeTime } from '@/utils/time';

const textareaClass =
  'w-full resize-none rounded-2xl border border-line bg-surface-muted px-4 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-subtle focus:border-primary focus:bg-surface focus:outline-none focus:ring-4 focus:ring-focus';

function CommentForm({ initial = '', submitLabel, onSubmit, onCancel, autoFocus = false, maxLength }) {
  const [content, setContent] = useState(initial);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const fieldId = useId();
  const trimmed = content.trim();

  const submit = async (event) => {
    event.preventDefault();
    if (sending) return;
    if (!trimmed) {
      setError('Comment cannot be empty.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await onSubmit(trimmed);
      setContent('');
    } catch (requestError) {
      setError(requestError.errors?.[0]?.message ?? requestError.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5" noValidate>
      <div className="flex items-end gap-2">
        <label htmlFor={fieldId} className="sr-only">
          {submitLabel === 'Save' ? 'Edit your comment' : 'Write a comment'}
        </label>
        <textarea
          id={fieldId}
          rows={1}
          value={content}
          maxLength={maxLength}
          autoFocus={autoFocus}
          placeholder="Add to the conversation..."
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setContent(event.target.value);
            event.target.style.height = 'auto';
            event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit(event);
            if (event.key === 'Escape' && onCancel) onCancel();
          }}
          className={textareaClass}
        />
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={sending}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          size={onCancel ? 'sm' : 'icon'}
          loading={sending}
          disabled={!trimmed}
          aria-label={onCancel ? undefined : submitLabel}
          className={cn(!onCancel && 'size-10 rounded-2xl')}
        >
          {onCancel ? submitLabel : !sending && <SendHorizontal className="size-4" aria-hidden="true" />}
        </Button>
      </div>
      {error && (
        <p role="alert" className="px-1 text-xs font-medium text-danger-fg">
          {error}
        </p>
      )}
    </form>
  );
}

function CommentItem({ comment, onUpdate, onDelete, maxLength }) {
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const name = getFullName(comment.author);

  const remove = async () => {
    setDeleting(true);
    try {
      await onDelete(comment.id);
    } catch (error) {
      toast.error(error.message);
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="flex gap-3"
    >
      <Link to={profilePath(comment.author.id)} className="shrink-0 rounded-xl" aria-label={`${name}'s profile`}>
        <Avatar src={comment.author.avatarUrl} name={name} size="sm" />
      </Link>
      <div className="min-w-0 flex-1">
        {editing ? (
          <CommentForm
            initial={comment.content}
            submitLabel="Save"
            autoFocus
            maxLength={maxLength}
            onCancel={() => setEditing(false)}
            onSubmit={async (content) => {
              await onUpdate(comment.id, content);
              setEditing(false);
            }}
          />
        ) : (
          <div className="rounded-2xl rounded-tl-md bg-surface-muted px-3.5 py-2.5">
            <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <Link to={profilePath(comment.author.id)} className="font-bold text-ink hover:underline">
                {name}
              </Link>
              <time dateTime={comment.createdAt} title={formatDateTime(comment.createdAt)} className="text-ink-subtle">
                {formatRelativeTime(comment.createdAt)}
              </time>
              {comment.editedAt && <span className="text-ink-subtle">· Edited</span>}
            </p>
            <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-line text-ink">{comment.content}</p>
          </div>
        )}
        {comment.moderation && !editing && <ModerationNotice status={comment.moderation.status} noun="comment" className="mt-1.5" />}

        {!comment.isOwner && (
          <div className="mt-1 px-1 text-xs font-semibold">
            <button type="button" onClick={() => setReporting(true)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-ink-subtle hover:text-ink" aria-label={`Report ${name}'s comment`}>
              <Flag className="size-3" aria-hidden="true" /> Report
            </button>
            <ReportModal target={{ type: 'comment', id: comment.id }} open={reporting} onClose={() => setReporting(false)} />
          </div>
        )}

        {comment.isOwner && !editing && (
          <div className="mt-1 flex items-center gap-1 px-1 text-xs font-semibold">
            {confirming ? (
              <>
                <span className="text-ink-muted">Delete this comment?</span>
                <button type="button" onClick={() => setConfirming(false)} disabled={deleting} className="rounded-md px-1.5 py-1 text-ink-muted hover:text-ink">
                  Cancel
                </button>
                <button type="button" onClick={remove} disabled={deleting} className="rounded-md px-1.5 py-1 text-danger-fg hover:underline disabled:opacity-50">
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-ink-subtle hover:text-ink">
                  <Pencil className="size-3" aria-hidden="true" /> Edit
                </button>
                <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-ink-subtle hover:text-danger-fg">
                  <Trash2 className="size-3" aria-hidden="true" /> Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </motion.li>
  );
}

/** Comments under a post: write one, read them a page at a time, edit or delete your own. */
export function CommentSection({ postId, id }) {
  const user = useAuthStore((state) => state.user);
  const maxLength = useFeedStore((state) => state.options?.rules.comment.maxLength ?? 1000);
  const { comments, pagination, status, error, loadingMore, reload, loadMore, add, update, remove } = useComments(postId);
  const remaining = pagination ? pagination.total - comments.length : 0;

  return (
    <section id={id} aria-label="Comments" className="flex flex-col gap-4 border-t border-line pt-4">
      <div className="flex items-start gap-3">
        <Avatar src={user?.avatarUrl} name={getFullName(user)} size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <CommentForm submitLabel="Post comment" maxLength={maxLength} onSubmit={add} />
        </div>
      </div>

      {status === 'loading' && <p className="px-1 text-sm text-ink-muted" role="status">Loading comments...</p>}
      {status === 'error' && (
        <p className="px-1 text-sm text-danger-fg" role="alert">
          {error}{' '}
          <button type="button" onClick={reload} className="font-semibold underline">
            Try again
          </button>
        </p>
      )}
      {status === 'ready' && comments.length === 0 && (
        <p className="px-1 text-sm text-ink-muted">No comments yet. Start the conversation.</p>
      )}

      {comments.length > 0 && (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {comments.map((comment) => (
              <CommentItem key={comment.id} comment={comment} onUpdate={update} onDelete={remove} maxLength={maxLength} />
            ))}
          </AnimatePresence>
        </ul>
      )}

      {pagination?.hasMore && remaining > 0 && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="self-start rounded-lg px-1 text-sm font-semibold text-primary hover:underline disabled:opacity-60"
        >
          {loadingMore ? 'Loading...' : `Show ${remaining} older comment${remaining === 1 ? '' : 's'}`}
        </button>
      )}
    </section>
  );
}
