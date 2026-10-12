import { BadgeCheck, Mail } from 'lucide-react';
import { Link } from 'react-router';
import { adminUserPath } from '@/constants/admin';
import { cn } from '@/utils/cn';
import { AdminAvatar, StatusPill, Tag, TimeAgo } from './AdminUi';

function Verification({ user }) {
  return (
    <span className="flex flex-col gap-1 text-xs">
      <span className={cn('inline-flex items-center gap-1', user.emailVerified ? 'text-ax-success' : 'text-ax-subtle')}>
        <Mail className="size-3.5" aria-hidden="true" /> {user.emailVerified ? 'Email verified' : 'Email not verified'}
      </span>
      <span className={cn('inline-flex items-center gap-1', user.isVerified ? 'text-ax-success' : 'text-ax-subtle')}>
        <BadgeCheck className="size-3.5" aria-hidden="true" /> {user.isVerified ? 'Campus verified' : 'Not campus verified'}
      </span>
    </span>
  );
}

function Identity({ user }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <AdminAvatar src={user.avatarUrl} name={user.name} size="sm" />
      <span className="min-w-0">
        <Link to={adminUserPath(user.id)} className="block truncate font-semibold text-ax-text outline-none hover:text-ax-neon focus-visible:text-ax-neon">
          {user.name}
        </Link>
        <span className="block truncate text-xs text-ax-subtle">{user.email}</span>
      </span>
    </span>
  );
}

const roleTone = (role) => (role === 'admin' ? 'danger' : role === 'moderator' ? 'violet' : 'neutral');

export function UserTable({ users }) {
  return (
    <>
      <div className="relative hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr className="border-b border-ax-border font-mono text-[10px] tracking-[0.16em] text-ax-subtle uppercase">
              <th scope="col" className="py-2.5 pr-3 font-semibold">Student</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">College</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Branch</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Sem</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Role</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Status</th>
              <th scope="col" className="py-2.5 pr-3 font-semibold">Verification</th>
              <th scope="col" className="py-2.5 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ax-border/50">
            {users.map((user) => (
              <tr key={user.id} className="transition-colors hover:bg-ax-card-hover/70">
                <td className="max-w-[16rem] py-3 pr-3">
                  <Identity user={user} />
                </td>
                <td className="max-w-[10rem] py-3 pr-3 text-ax-muted">
                  <span className="block truncate" title={user.college?.name}>{user.college?.shortName ?? '—'}</span>
                </td>
                <td className="py-3 pr-3 text-ax-muted">{user.branch?.shortName ?? '—'}</td>
                <td className="py-3 pr-3 font-mono text-ax-muted">{user.semester ?? '—'}</td>
                <td className="py-3 pr-3">
                  <Tag tone={roleTone(user.role)}>{user.role}</Tag>
                </td>
                <td className="py-3 pr-3">
                  <StatusPill kind="account" value={user.status} />
                </td>
                <td className="py-3 pr-3">
                  <Verification user={user} />
                </td>
                <td className="py-3 text-xs text-ax-muted">
                  <TimeAgo value={user.createdAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2.5 lg:hidden">
        {users.map((user) => (
          <li key={user.id} className="rounded-xl border border-ax-border bg-ax-bg-2/70 p-3">
            <Identity user={user} />
            <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ax-muted">
              <Tag tone={roleTone(user.role)}>{user.role}</Tag>
              <StatusPill kind="account" value={user.status} />
              <span>{[user.college?.shortName, user.branch?.shortName, user.semester && `Sem ${user.semester}`].filter(Boolean).join(' · ') || 'Campus details not set'}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
