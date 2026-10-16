import { ExternalLink, Eye, Flag, Heart, MessageSquare, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';
import { CONTENT_ACTIONS, casePath } from '@/constants/admin';
import { AdminButton, StatusPill, TimeAgo } from './AdminUi';
import { TargetAuthor } from './ModerationTable';

const TONES = { approve: 'success', flag: 'warning', restrict: 'danger', remove: 'danger', verify: 'success', reject: 'neutral' };

function Stats({ item }) {
  const { likes, comments, views, openReports } = item.stats;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-ax-muted tabular-nums">
      {likes !== undefined && (
        <span className="inline-flex items-center gap-1" title="Likes">
          <Heart className="size-3.5" aria-hidden="true" />
          <span className="sr-only">Likes</span>
          {likes}
        </span>
      )}
      {comments !== undefined && (
        <span className="inline-flex items-center gap-1" title="Comments">
          <MessageSquare className="size-3.5" aria-hidden="true" />
          <span className="sr-only">Comments</span>
          {comments}
        </span>
      )}
      {views !== undefined && (
        <span className="inline-flex items-center gap-1" title="Views">
          <Eye className="size-3.5" aria-hidden="true" />
          <span className="sr-only">Views</span>
          {views}
        </span>
      )}
      <span className={openReports ? 'inline-flex items-center gap-1 text-ax-warning' : 'inline-flex items-center gap-1'} title="Open reports">
        <Flag className="size-3.5" aria-hidden="true" />
        <span className="sr-only">Open reports</span>
        {openReports}
      </span>
    </span>
  );
}

function Summary({ item }) {
  return (
    <span className="flex min-w-0 gap-3">
      {item.media?.[0]?.type === 'image' && <img src={item.media[0].url} alt="" className="size-11 shrink-0 rounded-lg border border-ax-border object-cover" loading="lazy" />}
      <span className="min-w-0">
        {item.title && <span className="block truncate font-semibold text-ax-text">{item.title}</span>}
        <span className={item.title ? 'block truncate text-xs text-ax-subtle' : 'line-clamp-2 text-sm text-ax-text'}>{item.excerpt || '(no text)'}</span>
        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          {item.extra?.verificationStatus && <span className="text-ax-muted">Proof: {item.extra.verificationStatus}</span>}
          {item.activeCase && (
            <Link to={casePath(item.activeCase.id)} className="inline-flex items-center gap-1 text-ax-neon hover:underline">
              <ShieldAlert className="size-3.5" aria-hidden="true" /> Open case
            </Link>
          )}
          {item.link && item.moderationStatus !== 'removed' && (
            <a href={item.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ax-subtle hover:text-ax-text">
              <ExternalLink className="size-3.5" aria-hidden="true" /> View
            </a>
          )}
        </span>
      </span>
    </span>
  );
}

function Actions({ item, onAction, busy }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {item.actions.map((action) => (
        <AdminButton key={action} size="sm" tone={TONES[action]} disabled={busy} onClick={() => onAction(item, action)}>
          {CONTENT_ACTIONS[action].label}
        </AdminButton>
      ))}
    </span>
  );
}

export function ContentTable({ items, onAction, busyId }) {
  return (
    <>
      <div className="relative hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr className="admin-label border-b border-ax-border text-ax-subtle">
              <th scope="col" className="py-2.5 pr-3 font-semibold">Content</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Author</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Status</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Activity</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Created</th>
              <th scope="col" className="py-2.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ax-border/50">
            {items.map((item) => (
              <tr key={item.id} className="transition-colors hover:bg-ax-card-hover/70">
                <td className="max-w-[24rem] py-3 pr-3 align-top">
                  <Summary item={item} />
                </td>
                <td className="py-3 pr-3 align-top">
                  <TargetAuthor author={item.author} />
                </td>
                <td className="py-3 pr-3 align-top">
                  <StatusPill kind="content" value={item.moderationStatus} />
                </td>
                <td className="py-3 pr-3 align-top">
                  <Stats item={item} />
                </td>
                <td className="py-3 pr-3 align-top text-xs text-ax-muted">
                  <TimeAgo value={item.createdAt} />
                </td>
                <td className="py-3 align-top">
                  <Actions item={item} onAction={onAction} busy={busyId === item.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2.5 lg:hidden">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-ax-border bg-ax-bg-2/70 p-3">
            <Summary item={item} />
            <span className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <TargetAuthor author={item.author} />
              <span className="flex items-center gap-2">
                <StatusPill kind="content" value={item.moderationStatus} />
                <span className="text-xs text-ax-muted">
                  <TimeAgo value={item.createdAt} />
                </span>
              </span>
            </span>
            <span className="mt-2 block">
              <Stats item={item} />
            </span>
            <span className="mt-3 block">
              <Actions item={item} onAction={onAction} busy={busyId === item.id} />
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
