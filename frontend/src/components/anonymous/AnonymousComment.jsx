import { useEffect, useId, useState } from 'react';
import { Flag, Pencil, SendHorizontal, Trash2 } from 'lucide-react';
import { AnonymousByline } from '@/components/anonymous/AnonymousPostCard';
import { ModerationNotice } from '@/components/safety/ModerationNotice';
import { ReportModal } from '@/components/safety/ReportModal';
import { Button, Loader, Modal } from '@/components/ui';
import { useAnonymousStore } from '@/store/anonymousStore';
import { toast } from '@/store/toastStore';

const textareaClass =
  'w-full resize-y rounded-2xl border border-line bg-surface-muted px-4 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-subtle focus:border-primary focus:bg-surface focus:outline-none focus:ring-4 focus:ring-focus';

function CommentForm({ initial = '', label, submitLabel, onSubmit, onCancel, maxLength }) {
  const [content, setContent] = useState(initial);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const fieldId = useId();
  const errorId = useId();

  const submit = async (event) => {
    event.preventDefault();
    if (sending) return;
    if (!content.trim()) {
      setError('Comment cannot be empty.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await onSubmit(content.trim());
      setContent('');
    } catch (requestError) {
      setError(requestError.errors?.[0]?.message ?? requestError.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5" noValidate>
      <label htmlFor={fieldId} className="sr-only">{label}</label>
      <textarea
        id={fieldId}
        rows={2}
        value={content}
        maxLength={maxLength}
        placeholder="Add to the conversation (shown as Anonymous Student)…"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => setContent(event.target.value)}
        className={textareaClass}
      />
      {error && <p id={errorId} role="alert" className="text-xs font-medium text-danger-fg">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="ghost" size="sm" onClick={onCancel} disabled={sending}>Cancel</Button>}
        <Button type="submit" size="sm" leftIcon={SendHorizontal} loading={sending} disabled={!content.trim()}>{submitLabel}</Button>
      </div>
    </form>
  );
}

function CommentItem({ postId, comment, maxLength, onReport }) {
  const { updateComment, deleteComment } = useAnonymousStore.getState();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteComment(postId, comment.id);
      toast.success('Comment deleted.');
    } catch (error) {
      toast.error(error.message);
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <li className="rounded-2xl bg-surface-muted/60 px-4 py-3" data-anonymous-comment-id={comment.id}>
      <div className="flex items-start justify-between gap-2">
        <AnonymousByline createdAt={comment.createdAt} edited={comment.edited} size="sm" />
        {!editing && (
          <div className="flex shrink-0 gap-0.5">
            {comment.isOwner ? (
              <>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditing(true)} aria-label="Edit your comment"><Pencil className="size-4" aria-hidden="true" /></Button>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => setConfirming(true)} aria-label="Delete your comment"><Trash2 className="size-4" aria-hidden="true" /></Button>
              </>
            ) : (
              <Button variant="ghost" size="icon" className="size-8" onClick={() => onReport(comment.id)} aria-label="Report this comment"><Flag className="size-4" aria-hidden="true" /></Button>
            )}
          </div>
        )}
      </div>
      {editing ? (
        <div className="mt-2">
          <CommentForm
            initial={comment.content}
            label="Edit your comment"
            submitLabel="Save"
            maxLength={maxLength}
            onCancel={() => setEditing(false)}
            onSubmit={async (content) => {
              await updateComment(postId, comment.id, content);
              setEditing(false);
              toast.success('Comment updated.');
            }}
          />
        </div>
      ) : (
        <p className="mt-1.5 pl-[2.375rem] text-sm leading-relaxed break-words whitespace-pre-line text-ink">{comment.content}</p>
      )}
      {comment.moderation && !editing && <ModerationNotice status={comment.moderation.status} noun="comment" className="mt-2 ml-[2.375rem]" />}
      <Modal
        open={confirming}
        onClose={deleting ? () => {} : () => setConfirming(false)}
        title="Delete this comment?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={deleting}>Cancel</Button>
            <Button variant="danger" leftIcon={Trash2} onClick={remove} loading={deleting}>Delete</Button>
          </>
        }
      />
    </li>
  );
}

/** The discussion under an anonymous post, oldest first. Nobody's identity is shown. */
export function AnonymousComments({ post }) {
  const entry = useAnonymousStore((state) => state.comments[post.id]);
  const maxLength = useAnonymousStore((state) => state.options?.rules.comment.max ?? 1000);
  const { loadComments, commentAnonymousPost } = useAnonymousStore.getState();
  const [reportingId, setReportingId] = useState(null);
  const items = entry?.items ?? [];

  useEffect(() => {
    loadComments(post.id);
  }, [post.id]);

  return (
    <section aria-labelledby="anon-comments-title" className="glass-card rounded-3xl border border-line bg-surface p-4 shadow-soft sm:p-5">
      <h2 id="anon-comments-title" className="font-display text-lg font-bold text-ink">
        Comments <span className="text-sm font-semibold text-ink-subtle">{post.commentCount}</span>
      </h2>
      <div className="mt-3">
        <CommentForm label="Write a comment" submitLabel="Comment" maxLength={maxLength} onSubmit={(content) => commentAnonymousPost(post.id, content)} />
      </div>
      {entry?.status === 'loading' && items.length === 0 && <Loader centered label="Loading comments" className="min-h-24" />}
      {entry?.status === 'error' && <p className="mt-3 text-sm text-ink-muted">We couldn’t load the comments. <button type="button" className="font-semibold text-primary hover:underline" onClick={() => loadComments(post.id)}>Try again</button></p>}
      {entry?.status === 'ready' && items.length === 0 && <p className="mt-4 text-sm text-ink-muted">No comments yet. Be the first to reply.</p>}
      {items.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2" aria-label="Comments">
          {items.map((comment) => <CommentItem key={comment.id} postId={post.id} comment={comment} maxLength={maxLength} onReport={setReportingId} />)}
        </ul>
      )}
      {entry?.pagination?.hasMore && (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" size="sm" loading={entry.status === 'loading-more'} onClick={() => loadComments(post.id, { more: true })}>Show more comments</Button>
        </div>
      )}
      <ReportModal target={reportingId && { type: 'anonymousComment', id: reportingId }} open={Boolean(reportingId)} onClose={() => setReportingId(null)} />
    </section>
  );
}
