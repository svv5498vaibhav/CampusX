import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Award, Flame, FolderKanban, Lock, Trophy } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { AdminAvatar, AdminButton, AdminError, AdminLoading, AdminPanel, KeyValues, StatusPill, Tag, TimeAgo } from '@/components/admin/AdminUi';
import { AuditTimeline } from '@/components/admin/CaseDetail';
import { ConfirmActionModal } from '@/components/admin/ConfirmActionModal';
import { ADMIN_ROUTES, USER_ACTIONS, casePath, targetLabel } from '@/constants/admin';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { adminApi } from '@/services/adminApi';
import { toast } from '@/store/toastStore';
import { formatDateTime } from '@/utils/time';

const ACTION_TONES = { suspend: 'warning', block: 'danger', deactivate: 'danger', unsuspend: 'success', activate: 'success' };

function Counter({ label, value }) {
  return (
    <div className="rounded-lg border border-ax-border bg-ax-bg-2/70 p-3">
      <p className="admin-label text-ax-subtle">{label}</p>
      <p className="mt-1 font-display text-xl font-bold text-ax-text tabular-nums">{Number(value ?? 0).toLocaleString()}</p>
    </div>
  );
}

function ListOrEmpty({ items, empty, children }) {
  if (!items?.length) return <p className="text-sm text-ax-subtle">{empty}</p>;
  return <ul className="divide-y divide-ax-border/50">{items.map(children)}</ul>;
}

/** /admin/users/:userId: everything an admin needs to manage one account, and nothing more. */
export default function AdminUserDetail() {
  const { userId } = useParams();
  useDocumentTitle('Admin · Student');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminApi.user(userId));
    } catch (failure) {
      setError(failure);
    }
  }, [userId]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  if (error && !data) return <AdminError title={error.status === 404 ? 'Account not found' : 'Couldn’t load this account'} error={error} onRetry={error.status === 404 ? undefined : load} />;
  if (!data) return <AdminLoading label="Loading account" />;

  const { user, activity, trust, moderationHistory, contentCases, reports, gamification, communities, projects, achievements, statusActions } = data;
  const action = pending ? USER_ACTIONS[pending] : null;
  const change = async (reason) => {
    try {
      const next = await adminApi.changeUserStatus(user.id, { action: pending, ...(reason && { reason }), confirm: true });
      setData(next);
      toast.success(`${USER_ACTIONS[pending].label}: done.`);
    } catch (failure) {
      if (failure.status === 409) load();
      throw failure;
    }
  };

  return (
    <div className="space-y-5">
      <AdminButton as={Link} to={ADMIN_ROUTES.USERS} size="sm" tone="neutral" icon={ArrowLeft}>
        Students
      </AdminButton>

      <section className="admin-panel flex flex-wrap items-center gap-4 p-5">
        <AdminAvatar src={user.avatarUrl} name={user.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold text-ax-text">{user.name}</h1>
          <p className="truncate text-sm text-ax-muted">{user.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Tag tone={user.role === 'admin' ? 'danger' : user.role === 'moderator' ? 'violet' : 'neutral'}>{user.role}</Tag>
            <StatusPill kind="account" value={user.status} />
            <StatusPill kind="risk" value={trust.riskLevel} prefix="Risk" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {statusActions.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-ax-subtle">
              <Lock className="size-3.5" aria-hidden="true" /> Status can’t be changed here for this account.
            </p>
          ) : (
            statusActions.map((id) => (
              <AdminButton key={id} tone={ACTION_TONES[id]} onClick={() => setPending(id)}>
                {USER_ACTIONS[id].label}
              </AdminButton>
            ))
          )}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <AdminPanel label="Profile">
          <KeyValues
            items={[
              { label: 'Joined', value: formatDateTime(user.createdAt) },
              { label: 'Last sign-in', value: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never' },
              { label: 'Email', value: user.emailVerified ? 'Verified' : 'Not verified' },
              { label: 'Campus verification', value: user.isVerified ? 'Verified' : 'Not verified' },
              { label: 'Onboarding', value: user.onboardingCompleted ? `Done${user.onboardingCompletedAt ? ` · ${formatDateTime(user.onboardingCompletedAt)}` : ''}` : 'Not finished' },
              { label: 'Signed-in devices', value: user.activeSessions },
            ]}
          />
          {user.bio && <p className="mt-4 rounded-lg border border-ax-border bg-ax-bg-2/70 p-3 text-sm text-ax-muted">{user.bio}</p>}
        </AdminPanel>
        <AdminPanel label="Academic information">
          <KeyValues
            items={[
              { label: 'College', value: user.college?.name ?? 'Not set' },
              { label: 'Branch', value: user.branch?.name ?? 'Not set' },
              { label: 'Semester', value: user.semester ?? 'Not set' },
              { label: 'Roll number', value: user.rollNumber ?? 'Not set' },
              { label: 'Skills', value: user.skills.length ? user.skills.join(', ') : 'None listed' },
              { label: 'Interests', value: user.interests.length ? `${user.interests.length} chosen` : 'None' },
            ]}
          />
        </AdminPanel>
      </div>

      <AdminPanel label="Activity">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Counter label="Posts" value={activity.posts} />
          <Counter label="Comments" value={activity.comments} />
          <Counter label="Projects" value={activity.projects} />
          <Counter label="Achievements" value={activity.achievements} />
          <Counter label="Communities" value={activity.communities} />
          <Counter label="Communities created" value={activity.communitiesCreated} />
          <Counter label="Opportunities tracked" value={activity.trackedOpportunities} />
          <Counter label="Reports filed" value={activity.reportsFiled} />
          <Counter label="Reports about them" value={activity.reportsAgainst} />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ax-subtle">
          <Lock className="size-3" aria-hidden="true" /> Anonymous Zone activity is never linked to an account here.
        </p>
      </AdminPanel>

      <div className="grid gap-5 xl:grid-cols-2">
        <AdminPanel label="Moderation history">
          <KeyValues
            items={[
              { label: 'Risk score', value: `${trust.riskScore}/100` },
              { label: 'Warnings', value: trust.warningCount },
              { label: 'Violations', value: `${trust.violationCount} (${trust.recentViolations} in 30 days)` },
              { label: 'Posting paused until', value: trust.restrictedUntil ? formatDateTime(trust.restrictedUntil) : 'Not paused' },
              { label: 'Dismissed reports they filed', value: trust.reportsDismissed },
              { label: 'Signals', value: trust.flags.length ? trust.flags.map((flag) => flag.replace(/_/g, ' ')).join(', ') : 'None' },
            ]}
          />
          <p className="mt-5 mb-2 admin-label text-ax-subtle">Cases about their content</p>
          <ListOrEmpty items={contentCases} empty="No cases about their content.">
            {(item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link to={casePath(item.id)} className="text-ax-neon hover:underline">
                  {targetLabel(item.targetType)} · {item.reportCount} {item.reportCount === 1 ? 'report' : 'reports'}
                </Link>
                <span className="flex items-center gap-1.5">
                  <StatusPill kind="risk" value={item.riskLevel} />
                  <StatusPill kind="case" value={item.status} />
                </span>
              </li>
            )}
          </ListOrEmpty>
          <p className="mt-5 mb-3 admin-label text-ax-subtle">Account actions</p>
          <AuditTimeline entries={moderationHistory} emptyText="No warnings, restrictions or status changes." />
        </AdminPanel>

        <AdminPanel label="Report history">
          <p className="mb-2 admin-label text-ax-subtle">Reports they filed</p>
          <ListOrEmpty items={reports.filed} empty="None.">
            {(item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="text-ax-text">
                  {item.reasonLabel} <span className="text-ax-subtle">· {targetLabel(item.targetType)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusPill kind="report" value={item.status} />
                  <TimeAgo value={item.createdAt} className="text-xs text-ax-subtle" />
                </span>
              </li>
            )}
          </ListOrEmpty>
          <p className="mt-5 mb-2 admin-label text-ax-subtle">Reports about them or their content</p>
          <ListOrEmpty items={reports.against} empty="None.">
            {(item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="text-ax-text">
                  {item.reasonLabel} <span className="text-ax-subtle">· {targetLabel(item.targetType)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusPill kind="priority" value={item.priority} />
                  <StatusPill kind="report" value={item.status} />
                </span>
              </li>
            )}
          </ListOrEmpty>
          <p className="mt-3 text-[11px] text-ax-subtle">Reporters are never identified.</p>
        </AdminPanel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
        <AdminPanel label="Gamification">
          {gamification ? (
            <div className="grid grid-cols-2 gap-3">
              <Counter label="Points" value={gamification.totalPoints} />
              <Counter label="Level" value={gamification.level} />
              <Counter label="Badges" value={gamification.badges} />
              <Counter label="Streak" value={gamification.streak} />
              <p className="col-span-2 flex items-center gap-1.5 text-xs text-ax-muted">
                {gamification.eligible ? <Trophy className="size-3.5 text-ax-neon" aria-hidden="true" /> : <Flame className="size-3.5" aria-hidden="true" />}
                {gamification.eligible ? 'Counted in rankings' : 'Not counted in rankings (inactive or not onboarded)'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ax-subtle">No points yet.</p>
          )}
        </AdminPanel>
        <AdminPanel label="Communities">
          <ListOrEmpty items={communities} empty="Not a member of any community.">
            {(item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="truncate text-ax-text">{item.name}</span>
                <Tag tone={item.role === 'owner' ? 'violet' : 'neutral'}>{item.role}</Tag>
              </li>
            )}
          </ListOrEmpty>
        </AdminPanel>
        <AdminPanel label="Projects">
          <ListOrEmpty items={projects} empty="No projects.">
            {(item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-ax-text">
                  <FolderKanban className="size-3.5 shrink-0 text-ax-subtle" aria-hidden="true" />
                  <span className="truncate">{item.title}</span>
                </span>
                <StatusPill kind="content" value={item.moderationStatus} />
              </li>
            )}
          </ListOrEmpty>
        </AdminPanel>
        <AdminPanel label="Achievements">
          <ListOrEmpty items={achievements} empty="No achievements.">
            {(item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-ax-text">
                  <Award className="size-3.5 shrink-0 text-ax-subtle" aria-hidden="true" />
                  <span className="truncate">{item.title}</span>
                </span>
                <Tag tone={item.verificationStatus === 'verified' ? 'violet' : 'neutral'}>{item.verificationStatus}</Tag>
              </li>
            )}
          </ListOrEmpty>
        </AdminPanel>
      </div>

      <ConfirmActionModal
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title={action ? `${action.label}: ${user.name}?` : ''}
        description={action?.description}
        confirmLabel={action?.label}
        danger={Boolean(action?.danger)}
        requireReason={Boolean(action?.danger)}
        onConfirm={change}
      />
    </div>
  );
}
