import { Flag, VenetianMask } from 'lucide-react';
import { Link } from 'react-router';
import { casePath, targetLabel } from '@/constants/admin';
import { cn } from '@/utils/cn';
import { PersonChip, StatusPill, Tag, TimeAgo, shortId } from './AdminUi';

/** Who a case's content belongs to: a person, "Anonymous Student" (never the real author), or nobody. */
export function TargetAuthor({ author }) {
  if (author === 'anonymous') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ax-muted">
        <VenetianMask className="size-3.5 text-ax-neon" aria-hidden="true" /> Anonymous Student
      </span>
    );
  }
  if (!author) return <span className="text-xs text-ax-subtle">CampusX</span>;
  return <PersonChip person={author} />;
}

/** "Post · ‘We need more…’" style summary of what a case or report is about. */
export function TargetSummary({ target, targetType, className }) {
  const missing = target && target.exists === false;
  return (
    <span className={cn('block min-w-0', className)}>
      <span className="flex flex-wrap items-center gap-1.5">
        <Tag tone="violet">{targetLabel(targetType)}</Tag>
        {target?.status && target.exists && <StatusPill kind={targetType === 'user' ? 'account' : targetType === 'opportunity' ? undefined : 'content'} value={targetType === 'opportunity' ? null : target.status} />}
      </span>
      <span className={cn('mt-1 block truncate text-sm', missing ? 'text-ax-subtle italic' : 'text-ax-text')}>
        {missing ? 'No longer exists' : target?.title || target?.text || '(no text)'}
      </span>
      {!missing && target?.title && target?.text && <span className="block truncate text-xs text-ax-subtle">{target.text}</span>}
    </span>
  );
}

export function ModerationTable({ cases }) {
  return (
    <>
      <div className="relative hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="admin-label border-b border-ax-border text-ax-subtle">
              <th scope="col" className="py-2.5 pr-3 font-semibold">Case</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Content</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Author</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Risk</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Priority</th>
              <th scope="col" className="py-2.5 pr-3 text-right font-semibold">Reports</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Status</th>
              <th scope="col" className="py-2.5 font-semibold">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ax-border/50">
            {cases.map((item) => (
              <tr key={item.id} className="group relative transition-colors hover:bg-ax-card-hover/70">
                <td className="py-3 pr-3 align-top">
                  <Link to={casePath(item.id)} className="font-mono text-xs font-semibold text-ax-neon outline-none after:absolute after:inset-0 hover:underline focus-visible:underline">
                    {shortId(item.id)}
                  </Link>
                  <span className="admin-label mt-1 block text-[10px] text-ax-subtle">{item.sources.join(' + ')}</span>
                </td>
                <td className="max-w-[22rem] py-3 pr-3 align-top">
                  <TargetSummary target={item.target} targetType={item.targetType} />
                </td>
                <td className="py-3 pr-3 align-top">
                  <TargetAuthor author={item.target?.author} />
                </td>
                <td className="py-3 pr-3 align-top">
                  <StatusPill kind="risk" value={item.riskLevel} />
                  <span className="mt-1 block font-mono text-[10px] text-ax-subtle">score {item.automatedScore}</span>
                </td>
                <td className="py-3 pr-3 align-top">
                  <StatusPill kind="priority" value={item.priority} />
                </td>
                <td className="py-3 pr-3 text-right align-top font-mono text-sm text-ax-text tabular-nums">{item.reportCount}</td>
                <td className="py-3 pr-3 align-top">
                  <StatusPill kind="case" value={item.status} />
                </td>
                <td className="py-3 align-top text-xs text-ax-muted">
                  <TimeAgo value={item.updatedAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2.5 md:hidden">
        {cases.map((item) => (
          <li key={item.id}>
            <Link to={casePath(item.id)} className="block rounded-xl border border-ax-border bg-ax-bg-2/70 p-3 hover:border-ax-violet/50">
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-ax-neon">{shortId(item.id)}</span>
                <span className="text-xs text-ax-muted">
                  <TimeAgo value={item.updatedAt} />
                </span>
              </span>
              <TargetSummary target={item.target} targetType={item.targetType} className="mt-2" />
              <span className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusPill kind="risk" value={item.riskLevel} />
                <StatusPill kind="priority" value={item.priority} prefix="P:" />
                <StatusPill kind="case" value={item.status} />
                {item.reportCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-ax-muted">
                    <Flag className="size-3" aria-hidden="true" /> {item.reportCount}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
