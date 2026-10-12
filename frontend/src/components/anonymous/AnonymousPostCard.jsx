import { useState } from 'react';
import { Flag, Heart, MessageCircle, Pencil, Trash2, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { PostMedia } from '@/components/feed/PostMedia';
import { PostMenu } from '@/components/feed/PostMenu';
import { ModerationNotice } from '@/components/safety/ModerationNotice';
import { ReportModal } from '@/components/safety/ReportModal';
import { Badge, Button, Modal } from '@/components/ui';
import { ANONYMOUS_CATEGORY_ICONS, ANONYMOUS_LABEL_FALLBACK, ANONYMOUS_VISIBILITY_ICONS, anonymousPostPath, categoryLabel, editAnonymousPostPath, visibilityLabel } from '@/constants/anonymous';
import { useAnonymousStore } from '@/store/anonymousStore';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';
import { formatDateTime, formatRelativeTime } from '@/utils/time';

/** "Anonymous Student · 2h · Edited": no photo, name or campus details, ever. */
export function AnonymousByline({ createdAt, edited, size = 'md' }) {
  const label = useAnonymousStore((state) => state.options?.authorLabel) ?? ANONYMOUS_LABEL_FALLBACK;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={cn('grid shrink-0 place-items-center rounded-full bg-surface-muted text-ink-subtle', size === 'sm' ? 'size-7' : 'size-9')} aria-hidden="true">
        <UserRound className={size === 'sm' ? 'size-4' : 'size-5'} />
      </span>
      <p className="min-w-0 truncate text-sm">
        <span className="font-semibold text-ink">{label}</span>
        <span className="text-ink-subtle">
          {' · '}
          <time dateTime={createdAt} title={formatDateTime(createdAt)}>{formatRelativeTime(createdAt)}</time>
          {edited && ' · Edited'}
        </span>
      </p>
    </div>
  );
}

/** Asks before the author deletes their anonymous post. */
export function DeleteAnonymousPostDialog({ post, open, onClose, onDeleted }) {
  const deleteAnonymousPost = useAnonymousStore((state) => state.deleteAnonymousPost);
  const [deleting, setDeleting] = useState(false);
  const remove = async () => {
    setDeleting(true);
    try {
      await deleteAnonymousPost(post.id);
      toast.success('Anonymous post deleted.');
      onClose();
      onDeleted?.();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDeleting(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={deleting ? () => {} : onClose}
      title="Delete this anonymous post?"
      description="It will disappear for everyone. CampusX keeps an internal record for safety reviews."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={deleting}>Cancel</Button>
          <Button variant="danger" leftIcon={Trash2} onClick={remove} loading={deleting}>Delete</Button>
        </>
      }
    />
  );
}

/**
 * One anonymous post: category, title, content, photos, likes and comments. The author's menu has Edit
 * and Delete; everyone else can Report. `detail` shows the full text on the post's own page.
 */
export function AnonymousPostCard({ post, detail = false, onDeleted, headingLevel = 'h2' }) {
  const navigate = useNavigate();
  const options = useAnonymousStore((state) => state.options);
  const likeBusy = useAnonymousStore((state) => Boolean(state.busy[`${post.id}:like`]));
  const likeAnonymousPost = useAnonymousStore((state) => state.likeAnonymousPost);
  const [deleting, setDeleting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const CategoryIcon = ANONYMOUS_CATEGORY_ICONS[post.category] ?? ANONYMOUS_CATEGORY_ICONS.other;
  const VisibilityIcon = ANONYMOUS_VISIBILITY_ICONS[post.visibility] ?? ANONYMOUS_VISIBILITY_ICONS.campus;
  const Heading = headingLevel;
  const label = options?.authorLabel ?? ANONYMOUS_LABEL_FALLBACK;

  const menuItems = post.isOwner
    ? [
        { id: 'edit', label: 'Edit', icon: Pencil, onSelect: () => navigate(editAnonymousPostPath(post.id)) },
        { id: 'delete', label: 'Delete', icon: Trash2, onSelect: () => setDeleting(true), danger: true },
      ]
    : [{ id: 'report', label: 'Report', icon: Flag, onSelect: () => setReporting(true) }];

  const like = async () => {
    try {
      await likeAnonymousPost(post.id, !post.likedByCurrentUser);
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <article className="rounded-3xl border border-line bg-surface p-4 shadow-soft sm:p-5" data-anonymous-post-id={post.id} aria-labelledby={`anon-${post.id}-title`}>
      <header className="flex items-start justify-between gap-3">
        <AnonymousByline createdAt={post.createdAt} edited={post.edited} />
        <PostMenu items={menuItems} label={post.isOwner ? 'Your anonymous post options' : 'Post options'} />
      </header>

      {/* Only the author's own copy carries moderationStatus (the API never sends it to anyone else). */}
      {post.isOwner && <ModerationNotice status={post.moderationStatus} noun="anonymous post" className="mt-3" />}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant="primary" icon={CategoryIcon} className="px-2 py-0.5 text-[11px]">{categoryLabel(options, post.category)}</Badge>
        <Badge variant="neutral" icon={VisibilityIcon} className="px-2 py-0.5 text-[11px]">
          {post.community ? post.community.name : visibilityLabel(options, post.visibility)}
        </Badge>
      </div>

      <Heading id={`anon-${post.id}-title`} className={cn('mt-2 font-display leading-snug font-bold text-ink', detail ? 'text-2xl sm:text-3xl' : 'text-lg')}>
        {detail ? post.title : <Link to={anonymousPostPath(post.id)} className="hover:underline">{post.title}</Link>}
      </Heading>
      <p className={cn('mt-2 text-[15px] leading-relaxed break-words whitespace-pre-line text-ink', !detail && 'line-clamp-4')}>{post.content}</p>

      {post.media.length > 0 && (
        <div className="mt-3">
          <PostMedia media={post.media.map((item) => ({ ...item, type: 'image' }))} authorName={label} />
        </div>
      )}

      <footer className="mt-3 flex items-center gap-1 border-t border-line pt-2 text-sm font-semibold text-ink-muted">
        <button
          type="button"
          onClick={like}
          disabled={likeBusy}
          aria-pressed={post.likedByCurrentUser}
          aria-label={`${post.likedByCurrentUser ? 'Unlike' : 'Like'} (${post.likeCount} ${post.likeCount === 1 ? 'like' : 'likes'})`}
          className={cn('inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 transition-colors', post.likedByCurrentUser ? 'text-primary' : 'hover:bg-surface-muted hover:text-ink')}
        >
          <Heart className={cn('size-4', post.likedByCurrentUser && 'fill-current')} aria-hidden="true" />
          <span aria-hidden="true">{post.likeCount}</span>
        </button>
        {detail ? (
          <span className="inline-flex h-9 items-center gap-1.5 px-2.5" aria-label={`${post.commentCount} ${post.commentCount === 1 ? 'comment' : 'comments'}`}>
            <MessageCircle className="size-4" aria-hidden="true" /> <span aria-hidden="true">{post.commentCount}</span>
          </span>
        ) : (
          <Link to={anonymousPostPath(post.id)} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 hover:bg-surface-muted hover:text-ink" aria-label={`${post.commentCount} ${post.commentCount === 1 ? 'comment' : 'comments'}: open the discussion`}>
            <MessageCircle className="size-4" aria-hidden="true" /> <span aria-hidden="true">{post.commentCount}</span>
          </Link>
        )}
      </footer>

      {post.isOwner ? (
        <DeleteAnonymousPostDialog post={post} open={deleting} onClose={() => setDeleting(false)} onDeleted={onDeleted} />
      ) : (
        <ReportModal target={{ type: 'anonymousPost', id: post.id }} open={reporting} onClose={() => setReporting(false)} />
      )}
    </article>
  );
}
