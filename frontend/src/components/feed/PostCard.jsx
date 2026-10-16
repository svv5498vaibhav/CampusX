import { useId, useState } from 'react';
import { motion } from 'framer-motion';
import { Bookmark, Flag, Heart, Link2, MessageCircle, Pencil, Share2, ShieldX, Trash2, UsersRound } from 'lucide-react';
import { Link } from 'react-router';
import { EliteProfileFrame } from '@/components/elite/EliteProfileFrame';
import { EliteRankName } from '@/components/elite/EliteRankName';
import { RankTokenBadge } from '@/components/elite/RankTokenBadge';
import { Avatar, Badge, Button, Modal } from '@/components/ui';
import { CommentSection } from '@/components/feed/CommentSection';
import { PostComposer } from '@/components/feed/PostComposer';
import { PostMedia } from '@/components/feed/PostMedia';
import { PostMenu } from '@/components/feed/PostMenu';
import { ModerationNotice } from '@/components/safety/ModerationNotice';
import { ReportModal } from '@/components/safety/ReportModal';
import { FORMAT_TYPES, POST_TYPE_STYLES, VISIBILITY_ICONS, postUrl, typeLabel } from '@/constants/posts';
import { communityPath, postPath, profilePath } from '@/constants/routes';
import { useFeedStore } from '@/store/feedStore';
import { toast } from '@/store/toastStore';
import { copyText } from '@/utils/clipboard';
import { cn } from '@/utils/cn';
import { getFullName } from '@/utils/string';
import { formatDateTime, formatRelativeTime } from '@/utils/time';

const LONG_POST = { characters: 480, lines: 7 };
const URL_PATTERN = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;

/** Post text with web links made clickable (text stays text; React escapes everything else). */
function PostText({ content }) {
  return content.split(URL_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <a key={index} href={part} target="_blank" rel="noopener noreferrer nofollow ugc" className="font-semibold break-all text-primary hover:underline">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

function ActionButton({ icon: Icon, label, count, active, activeClass, onClick, disabled, ...props }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      // The label already includes the count, so screen readers hear it once.
      aria-label={label}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors disabled:opacity-60',
        active ? activeClass : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
      )}
      {...props}
    >
      <motion.span whileTap={{ scale: 0.8 }} className="grid place-items-center">
        <Icon className={cn('size-[18px]', active && 'fill-current')} aria-hidden="true" />
      </motion.span>
      {count !== undefined && count > 0 && (
        <span className="tabular-nums" aria-hidden="true">
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * One campus post. Owners get Edit and Delete in the ⋮ menu; everyone else gets Report. In a
 * community, its owners and moderators also get "Remove post" (post.canModerate). The server checks
 * permissions again on every change, so the menu is only a convenience.
 * `showCommunity` adds an "in <community>" link (off inside the community's own feed).
 */
export function PostCard({ post, defaultShowComments = false, onDeleted, headingLevel = 'h2', showCommunity = true }) {
  const options = useFeedStore((state) => state.options);
  const likeBusy = useFeedStore((state) => Boolean(state.busy[`${post.id}:like`]));
  const saveBusy = useFeedStore((state) => Boolean(state.busy[`${post.id}:save`]));
  const deleting = useFeedStore((state) => state.deletingPost === post.id);
  const { likePost, unlikePost, savePost, unsavePost, deletePost } = useFeedStore.getState();

  const [showComments, setShowComments] = useState(defaultShowComments);
  const [expanded, setExpanded] = useState(false);
  const [dialog, setDialog] = useState(null); // 'edit' | 'delete' | 'report' | null
  const titleId = useId();
  const commentsId = useId();

  const { author } = post;
  const name = getFullName(author);
  const Heading = headingLevel;
  const typeStyle = POST_TYPE_STYLES[post.type] ?? POST_TYPE_STYLES.text;
  const VisibilityIcon = VISIBILITY_ICONS[post.visibility] ?? VISIBILITY_ICONS.campus;
  const visibilityLabel = options?.visibility.find((option) => option.id === post.visibility)?.label ?? post.visibility;
  const campusLine = [author.branch?.shortName, author.semester?.label].filter(Boolean).join(' • ');
  const isLong = post.content.length > LONG_POST.characters || post.content.split('\n').length > LONG_POST.lines;

  const run = async (action) => {
    try {
      await action(post.id);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const share = async () => {
    const copied = await copyText(postUrl(post.id));
    if (copied) toast.success('Post link copied!');
    else toast.error(`Couldn't copy automatically. The link is ${postUrl(post.id)}`);
  };

  const confirmDelete = async () => {
    try {
      await deletePost(post.id);
      setDialog(null);
      toast.success(post.isOwner ? 'Post deleted.' : 'Post removed from the community.');
      onDeleted?.(post.id);
    } catch (error) {
      // Never fail silently. The post stays on screen (unless it no longer exists) and the dialog
      // stays open for another try after network or server errors.
      if (error.status === 404) {
        setDialog(null);
        useFeedStore.getState().removeLocal(post.id);
        toast.error('Post not found.');
      } else if (error.status === 403) {
        setDialog(null);
        toast.error(error.message);
      } else {
        toast.error('Unable to delete post. Please try again.');
      }
    }
  };

  const menuItems = post.isOwner
    ? [
        { id: 'edit', label: 'Edit post', icon: Pencil, onSelect: () => setDialog('edit') },
        { id: 'copy', label: 'Copy link', icon: Link2, onSelect: share },
        { id: 'delete', label: 'Delete post', icon: Trash2, onSelect: () => setDialog('delete'), danger: true },
      ]
    : [
        { id: 'copy', label: 'Copy link', icon: Link2, onSelect: share },
        { id: 'report', label: 'Report post', icon: Flag, onSelect: () => setDialog('report'), danger: true },
        ...(post.canModerate ? [{ id: 'remove', label: 'Remove post', icon: ShieldX, onSelect: () => setDialog('delete'), danger: true }] : []),
      ];

  return (
    <article aria-labelledby={titleId} className="glass-card rounded-3xl border border-line bg-surface p-4 shadow-soft sm:p-5" data-post-id={post.id}>
      <header className="flex items-start gap-3">
        <Link to={profilePath(author.id)} className="shrink-0 rounded-2xl" tabIndex={-1} aria-hidden="true">
          <EliteProfileFrame eliteRank={author.eliteRank} size="md">
            <Avatar src={author.avatarUrl} name={name} size="md" />
          </EliteProfileFrame>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Heading id={titleId} className="text-[15px] leading-tight font-bold text-ink">
              <Link to={profilePath(author.id)} className="hover:underline">
                <EliteRankName eliteRank={author.eliteRank}>{name}</EliteRankName>
              </Link>
            </Heading>
            <RankTokenBadge eliteRank={author.eliteRank} variant="icon" />
            {!FORMAT_TYPES.includes(post.type) && (
              <Badge variant={typeStyle.badge} icon={typeStyle.icon} className="px-2 py-0.5 text-[11px]">
                {typeLabel(options, post.type)}
              </Badge>
            )}
          </div>
          {author.college && <p className="truncate text-xs text-ink-muted">{author.college.name}</p>}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-subtle">
            {campusLine && <span className="font-medium text-ink-muted">{campusLine}</span>}
            {campusLine && <span aria-hidden="true">·</span>}
            <Link to={postPath(post.id)} className="hover:underline">
              <time dateTime={post.createdAt} title={formatDateTime(post.createdAt)}>
                {formatRelativeTime(post.createdAt)}
              </time>
            </Link>
            {post.editedAt && (
              <>
                <span aria-hidden="true">·</span>
                <span title={`Edited ${formatDateTime(post.editedAt)}`}>Edited</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            {post.community && showCommunity ? (
              <Link to={communityPath(post.community.id)} className="inline-flex min-w-0 items-center gap-1 font-semibold text-primary hover:underline">
                <UsersRound className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="sr-only">Posted in </span>
                <span className="truncate">{post.community.name}</span>
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1" title={`Visible to: ${post.community ? 'community members' : visibilityLabel}`}>
                {post.community ? <UsersRound className="size-3.5" aria-hidden="true" /> : <VisibilityIcon className="size-3.5" aria-hidden="true" />}
                <span className="sr-only">Visible to: </span>
                {/* Icon only on phones; the label is still read out. */}
                <span className="sr-only sm:not-sr-only">{post.community ? 'Members only' : visibilityLabel}</span>
              </span>
            )}
          </p>
        </div>
        <PostMenu items={menuItems} label={post.isOwner ? 'Your post options' : 'Post options'} />
      </header>

      {post.moderation && <ModerationNotice status={post.moderation.status} noun="post" className="mt-3" />}

      {post.content && (
        <div className="mt-3">
          <p className={cn('text-[15px] leading-relaxed break-words whitespace-pre-line text-ink', isLong && !expanded && 'line-clamp-6')}>
            <PostText content={post.content} />
          </p>
          {isLong && (
            <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-1 text-sm font-semibold text-primary hover:underline" aria-expanded={expanded}>
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      {post.media.length > 0 && (
        <div className="mt-3">
          <PostMedia media={post.media} authorName={name} />
        </div>
      )}

      <div className="mt-3 flex items-center gap-1 border-t border-line pt-2" role="group" aria-label="Post actions">
        <ActionButton
          icon={Heart}
          label={`${post.likedByCurrentUser ? 'Unlike' : 'Like'} (${post.likeCount} ${post.likeCount === 1 ? 'like' : 'likes'})`}
          count={post.likeCount}
          active={post.likedByCurrentUser}
          activeClass="text-danger hover:bg-danger-soft"
          aria-pressed={post.likedByCurrentUser}
          disabled={likeBusy}
          onClick={() => run(post.likedByCurrentUser ? unlikePost : likePost)}
        />
        <ActionButton
          icon={MessageCircle}
          label={`Comments (${post.commentCount})`}
          count={post.commentCount}
          active={showComments}
          activeClass="bg-primary-soft text-primary-soft-fg"
          aria-expanded={showComments}
          aria-controls={commentsId}
          onClick={() => setShowComments((value) => !value)}
        />
        <ActionButton
          icon={Bookmark}
          label={post.savedByCurrentUser ? 'Saved. Remove from saved' : 'Save post'}
          active={post.savedByCurrentUser}
          activeClass="text-primary hover:bg-primary-soft"
          aria-pressed={post.savedByCurrentUser}
          disabled={saveBusy}
          onClick={() => run(post.savedByCurrentUser ? unsavePost : savePost)}
        />
        <div className="flex-1" />
        <ActionButton icon={Share2} label="Share: copy link to post" onClick={share} />
      </div>

      {showComments && (
        <div className="mt-2">
          <CommentSection postId={post.id} id={commentsId} />
        </div>
      )}

      {dialog === 'edit' && <PostComposer open mode="edit" post={post} onClose={() => setDialog(null)} />}
      {!post.isOwner && <ReportModal target={{ type: 'post', id: post.id }} open={dialog === 'report'} onClose={() => setDialog(null)} />}
      {(post.isOwner || post.canModerate) && (
        <Modal
          open={dialog === 'delete'}
          onClose={deleting ? () => {} : () => setDialog(null)}
          title={post.isOwner ? 'Delete this campus post?' : 'Remove this post from the community?'}
          description={
            post.isOwner
              ? "It will be removed for everyone, along with its photos, videos and comments. This can't be undone."
              : `You're removing ${name}'s post as a community moderator. Its photos, videos and comments go too. This can't be undone.`
          }
          size="sm"
          footer={
            <>
              <Button variant="outline" onClick={() => setDialog(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="danger" leftIcon={Trash2} loading={deleting} onClick={confirmDelete}>
                {post.isOwner ? 'Delete' : 'Remove'}
              </Button>
            </>
          }
        />
      )}
    </article>
  );
}
