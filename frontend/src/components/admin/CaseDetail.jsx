import { useState } from 'react';
import { ExternalLink, EyeOff, FileText, Fingerprint, Lock, ShieldCheck, TriangleAlert, VenetianMask } from 'lucide-react';
import { Link } from 'react-router';
import { ACTOR_ROLE_LABELS, CASE_ACTIONS, PERMISSIONS, adminUserPath, auditActionLabel, casePath, targetLabel } from '@/constants/admin';
import { useAdminStore } from '@/store/adminStore';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/time';
import { ConfirmActionModal } from './ConfirmActionModal';
import { AdminButton, AdminPanel, KeyValues, PersonChip, StatusPill, Tag, TimeAgo, shortId } from './AdminUi';

function ScoreBar({ score }) {
  const color = score >= 85 ? 'var(--ax-danger)' : score >= 60 ? 'var(--ax-serious)' : score >= 30 ? 'var(--ax-warning)' : 'var(--ax-success)';
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] tracking-[0.16em] text-ax-subtle uppercase">Automated risk score</span>
        <span className="font-display text-xl font-bold text-ax-text tabular-nums">
          {score}
          <span className="text-xs font-normal text-ax-subtle">/100</span>
        </span>
      </div>
      <div className="relative mt-2 h-2 rounded-full bg-[var(--ax-chart-grid)]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-label="Automated risk score">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, score)}%`, backgroundColor: color }} />
        {[30, 60, 85].map((mark) => (
          <span key={mark} aria-hidden="true" className="absolute top-[-3px] h-3.5 w-px bg-ax-subtle/60" style={{ left: `${mark}%` }} />
        ))}
      </div>
      <p className="mt-1.5 flex justify-between font-mono text-[9.5px] text-ax-subtle" aria-hidden="true">
        <span>0</span>
        <span>medium 30 · high 60 · critical 85</span>
        <span>100</span>
      </p>
    </div>
  );
}

function ContentPanel({ target, targetType }) {
  if (!target || !target.exists) {
    return (
      <AdminPanel label="Content under review">
        <p className="text-sm text-ax-subtle italic">This {targetLabel(targetType).toLowerCase()} no longer exists.</p>
      </AdminPanel>
    );
  }
  const extra = target.extra ?? {};
  return (
    <AdminPanel
      label="Content under review"
      actions={
        target.link && (
          <AdminButton as="a" href={target.link} target="_blank" rel="noreferrer" size="sm" icon={ExternalLink}>
            Open in CampusX
          </AdminButton>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="violet">{targetLabel(targetType)}</Tag>
        {targetType === 'user' ? <StatusPill kind="account" value={target.status} /> : targetType === 'opportunity' ? <Tag>{target.status}</Tag> : <StatusPill kind="content" value={target.status} />}
        {target.createdAt && (
          <span className="text-xs text-ax-subtle">
            posted <TimeAgo value={target.createdAt} />
          </span>
        )}
      </div>
      {target.title && <h3 className="mt-3 font-display text-lg font-bold text-ax-text">{target.title}</h3>}
      {target.text ? (
        <p className="mt-2 rounded-lg border border-ax-border bg-ax-bg-2/70 p-3 text-sm leading-relaxed whitespace-pre-wrap text-ax-text">{target.text}</p>
      ) : (
        <p className="mt-2 text-sm text-ax-subtle italic">No text.</p>
      )}
      {target.media?.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Attached media">
          {target.media.map((item) => (
            <li key={item.url}>
              <a href={item.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-ax-border hover:border-ax-violet">
                {item.type === 'image' ? (
                  <img src={item.url} alt="Attached image (opens in a new tab)" className="size-24 object-cover" loading="lazy" />
                ) : (
                  <span className="grid size-24 place-items-center gap-1 text-xs text-ax-muted">
                    <FileText className="size-5" aria-hidden="true" />
                    {item.type}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
      {extra.links?.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {extra.links.map((link) => (
            <li key={link} className="truncate font-mono text-ax-muted">
              ↳ {link}
            </li>
          ))}
        </ul>
      )}
      {extra.verificationStatus && <p className="mt-3 text-xs text-ax-muted">Achievement proof: {extra.verificationStatus}</p>}
    </AdminPanel>
  );
}

function ReportsPanel({ reports }) {
  return (
    <AdminPanel label="Reports" actions={<Tag>{reports.total} total</Tag>}>
      {reports.total === 0 ? (
        <p className="text-sm text-ax-subtle">No student reports: this case came from the automated checks.</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2">
            {reports.byReason.map((reason) => (
              <li key={reason.reason} className="rounded-lg border border-ax-border bg-ax-bg-2 px-2.5 py-1 text-xs text-ax-text">
                {reason.label} <span className="font-mono text-ax-neon">×{reason.count}</span>
              </li>
            ))}
          </ul>
          <ul className="mt-4 divide-y divide-ax-border/50">
            {reports.items.map((report) => (
              <li key={report.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-ax-text">{report.reasonLabel}</p>
                  {report.description && <p className="mt-0.5 text-xs break-words text-ax-muted">“{report.description}”</p>}
                  {report.suspicious && (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-ax-warning">
                      <TriangleAlert className="size-3" aria-hidden="true" /> Sent during a burst of reports (possible report abuse)
                    </p>
                  )}
                </div>
                <span className="flex shrink-0 items-center gap-1.5">
                  <StatusPill kind="report" value={report.status} />
                  <span className="text-xs text-ax-subtle">
                    <TimeAgo value={report.createdAt} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ax-subtle">
            <Lock className="size-3" aria-hidden="true" /> Who reported this is never shown, to anyone.
          </p>
        </>
      )}
    </AdminPanel>
  );
}

export function AuditTimeline({ entries, emptyText = 'Nothing recorded yet.' }) {
  if (!entries?.length) return <p className="text-sm text-ax-subtle">{emptyText}</p>;
  return (
    <ol className="relative space-y-4 border-l border-ax-border pl-5">
      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          <span aria-hidden="true" className={cn('absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-ax-bg', entry.actorRole === 'system' ? 'bg-ax-subtle' : 'bg-ax-neon')} />
          <p className="text-sm text-ax-text">
            <span className="font-semibold">{auditActionLabel(entry.action)}</span>
            {entry.previousStatus && entry.newStatus && (
              <span className="ml-2 font-mono text-xs text-ax-muted">
                {entry.previousStatus} → {entry.newStatus}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-ax-subtle">
            {entry.actor ? `${entry.actor.name} (${ACTOR_ROLE_LABELS[entry.actorRole] ?? entry.actorRole})` : ACTOR_ROLE_LABELS[entry.actorRole] ?? 'CampusX'} · <span title={formatDateTime(entry.createdAt)}>{formatDateTime(entry.createdAt)}</span>
          </p>
          {entry.reason && <p className="mt-1 text-xs break-words text-ax-muted">“{entry.reason}”</p>}
        </li>
      ))}
    </ol>
  );
}

function RevealedAuthor({ author, onHide }) {
  return (
    <div className="rounded-xl border border-ax-warning/40 bg-ax-warning/5 p-3">
      <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.16em] text-ax-warning uppercase">
        <Fingerprint className="size-3.5" aria-hidden="true" /> Revealed for this investigation
      </p>
      {author.deleted ? (
        <p className="mt-2 text-sm text-ax-text">The author’s account no longer exists.</p>
      ) : (
        <KeyValues
          columns={1}
          className="mt-3"
          items={[
            { label: 'Name', value: `${author.firstName} ${author.lastName}` },
            { label: 'Email', value: <span className="break-all">{author.email}</span> },
            { label: 'Campus', value: [author.collegeName ?? author.college, author.branchName ?? author.branch, author.semester && `Sem ${author.semester}`].filter(Boolean).join(' · ') || '—' },
            { label: 'Roll number', value: author.rollNumber ?? '—' },
            { label: 'Account', value: <StatusPill kind="account" value={author.accountStatus} /> },
          ]}
        />
      )}
      <p className="mt-3 text-[11px] text-ax-muted">This lookup is in the audit log. Don’t share it outside the investigation.</p>
      <AdminButton size="sm" tone="neutral" icon={EyeOff} className="mt-2" onClick={onHide}>
        Hide identity
      </AdminButton>
    </div>
  );
}

function OwnerPanel({ owner, canReveal, onReveal }) {
  const canManageUsers = useAdminStore((state) => state.can(PERMISSIONS.MANAGE_USERS));
  const [revealing, setRevealing] = useState(false);
  const [revealed, setRevealed] = useState(null);

  if (!owner) {
    return (
      <AdminPanel label="Owner">
        <p className="text-sm text-ax-subtle">This content has no student owner (CampusX staff or an official community).</p>
      </AdminPanel>
    );
  }
  if (owner.anonymous) {
    return (
      <AdminPanel label="Author">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-ax-border bg-ax-bg-2 text-ax-neon">
            <VenetianMask className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold text-ax-text">Anonymous Student</p>
            <p className="mt-1 text-xs text-ax-muted">Anonymous Zone authors stay hidden from everyone, staff included. Their account history is hidden here too.</p>
          </div>
        </div>
        {revealed ? (
          <div className="mt-4">
            <RevealedAuthor author={revealed} onHide={() => setRevealed(null)} />
          </div>
        ) : (
          canReveal && (
            <AdminButton tone="warning" size="sm" icon={Fingerprint} className="mt-4" onClick={() => setRevealing(true)}>
              Reveal author for investigation
            </AdminButton>
          )
        )}
        <ConfirmActionModal
          open={revealing}
          onClose={() => setRevealing(false)}
          title="Reveal the anonymous author?"
          description="Only for investigating abuse in this case. Your name, the time and your reason are written to the audit log. The identity is shown once and never saved."
          confirmLabel="Reveal author"
          danger
          requireReason
          minReason={10}
          maxReason={300}
          reasonLabel="Why you need to know (audit log)"
          onConfirm={async (reason) => setRevealed(await onReveal(reason))}
        />
      </AdminPanel>
    );
  }
  const { person, trust, previousViolations } = owner;
  return (
    <AdminPanel label="Owner record" actions={canManageUsers && person && <AdminButton as={Link} to={adminUserPath(person.id)} size="sm">Profile</AdminButton>}>
      <PersonChip person={person} meta={[person?.college?.shortName, person?.branch?.shortName].filter(Boolean).join(' · ')} />
      <KeyValues
        className="mt-4"
        items={[
          { label: 'Account risk', value: <StatusPill kind="risk" value={trust.riskLevel} /> },
          { label: 'Risk score', value: `${trust.riskScore}/100` },
          { label: 'Warnings', value: trust.warningCount },
          { label: 'Violations', value: `${trust.violationCount} (${trust.recentViolations} in 30 days)` },
          { label: 'Posting paused until', value: trust.restrictedUntil ? formatDateTime(trust.restrictedUntil) : 'Not paused' },
          { label: 'Account', value: <StatusPill kind="account" value={person?.status} /> },
        ]}
      />
      <p className="mt-4 font-mono text-[10px] tracking-[0.16em] text-ax-subtle uppercase">Previous violations</p>
      {previousViolations.length === 0 ? (
        <p className="mt-1 text-sm text-ax-subtle">None on record.</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {previousViolations.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
              <Link to={casePath(item.id)} className="text-ax-neon hover:underline">
                {targetLabel(item.targetType)} · {auditActionLabel(item.action)}
              </Link>
              <TimeAgo value={item.resolvedAt} className="text-ax-subtle" />
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}

function DecisionPanel({ data, onDecide }) {
  const [pending, setPending] = useState(null);
  const { case: moderationCase, actions } = data;
  const action = pending ? CASE_ACTIONS[pending] : null;

  return (
    <AdminPanel label="Decision" className={cn(moderationCase.status !== 'resolved' && moderationCase.status !== 'dismissed' && 'border-ax-violet/50')}>
      {actions.length === 0 ? (
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 text-ax-success" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-semibold text-ax-text">Case {moderationCase.status}</p>
            <p className="mt-0.5 text-ax-muted">
              {moderationCase.action ? `${auditActionLabel(moderationCase.action)}` : 'Closed'}
              {moderationCase.assignedTo ? ` by ${moderationCase.assignedTo.name}` : ''}
              {moderationCase.resolvedAt ? ` · ${formatDateTime(moderationCase.resolvedAt)}` : ''}
            </p>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {actions.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => setPending(id)}
                className={cn(
                  'flex h-full w-full flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition-colors',
                  CASE_ACTIONS[id].danger ? 'border-ax-danger/35 hover:bg-ax-danger/10' : 'border-ax-border hover:border-ax-violet/50 hover:bg-ax-card-hover',
                )}
              >
                <span className={cn('text-sm font-semibold', CASE_ACTIONS[id].danger ? 'text-ax-danger' : 'text-ax-text')}>{CASE_ACTIONS[id].label}</span>
                <span className="text-[11px] leading-snug text-ax-subtle">{CASE_ACTIONS[id].description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmActionModal
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title={action ? `${action.label}: case ${shortId(moderationCase.id)}` : ''}
        description={action?.description}
        confirmLabel={action?.label}
        danger={Boolean(action?.danger)}
        requireReason={Boolean(action?.danger)}
        reasonLabel={action?.danger ? 'Reason (kept in the audit log)' : 'Note for the team'}
        onConfirm={(note) => onDecide(pending, note)}
      />
    </AdminPanel>
  );
}

/**
 * Everything about one moderation case. `onDecide(decision, note)` and `onReveal(reason)` call the API;
 * the page reloads the case afterwards.
 */
export function CaseDetail({ data, onDecide, onReveal }) {
  const { case: moderationCase, target, reports, owner, history, previousCases, canRevealAuthor } = data;
  return (
    <div className="space-y-5">
      <AdminPanel bodyClassName="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.18em] text-ax-subtle uppercase">Case ID</p>
          <p className="font-mono text-lg font-bold text-ax-neon" title={moderationCase.id}>
            {shortId(moderationCase.id)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="violet">{targetLabel(moderationCase.targetType)}</Tag>
          <StatusPill kind="case" value={moderationCase.status} />
          <StatusPill kind="risk" value={moderationCase.riskLevel} prefix="Risk" />
          <StatusPill kind="priority" value={moderationCase.priority} prefix="Priority" />
        </div>
        <dl className="ml-auto flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <div>
            <dt className="text-ax-subtle">Reports</dt>
            <dd className="font-mono text-ax-text">{moderationCase.reportCount}</dd>
          </div>
          <div>
            <dt className="text-ax-subtle">Opened</dt>
            <dd className="text-ax-text">{formatDateTime(moderationCase.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-ax-subtle">Updated</dt>
            <dd className="text-ax-text">
              <TimeAgo value={moderationCase.updatedAt} />
            </dd>
          </div>
        </dl>
      </AdminPanel>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <div className="min-w-0 space-y-5">
          <ContentPanel target={target} targetType={moderationCase.targetType} />
          <ReportsPanel reports={reports} />
          <AdminPanel label="Moderation history">
            <AuditTimeline entries={history} />
          </AdminPanel>
        </div>
        <div className="min-w-0 space-y-5">
          <DecisionPanel data={data} onDecide={onDecide} />
          <AdminPanel label="Risk analysis">
            <ScoreBar score={moderationCase.automatedScore} />
            <p className="mt-4 font-mono text-[10px] tracking-[0.16em] text-ax-subtle uppercase">Signals</p>
            {moderationCase.flags.length ? (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {moderationCase.flags.map((flag) => (
                  <li key={flag}>
                    <Tag>{flag.replace(/_/g, ' ')}</Tag>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ax-subtle">None.</p>
            )}
            {moderationCase.reasons.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-ax-muted">
                {moderationCase.reasons.map((reason) => (
                  <li key={reason}>› {reason}</li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-ax-subtle">Found by: {moderationCase.sources.join(' and ') || '—'}</p>
          </AdminPanel>
          <OwnerPanel owner={owner} canReveal={canRevealAuthor} onReveal={onReveal} />
          {moderationCase.notes.length > 0 && (
            <AdminPanel label="Team notes">
              <ul className="space-y-3">
                {moderationCase.notes.map((note) => (
                  <li key={`${note.createdAt}-${note.text.slice(0, 12)}`} className="text-sm">
                    <p className="break-words text-ax-text">{note.text}</p>
                    <p className="mt-0.5 text-xs text-ax-subtle">
                      {note.authorName} · <TimeAgo value={note.createdAt} />
                    </p>
                  </li>
                ))}
              </ul>
            </AdminPanel>
          )}
          {previousCases.length > 0 && (
            <AdminPanel label="Earlier cases on this content">
              <ul className="space-y-2">
                {previousCases.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link to={casePath(item.id)} className="font-mono text-xs text-ax-neon hover:underline">
                      {shortId(item.id)}
                    </Link>
                    <StatusPill kind="case" value={item.status} />
                    <TimeAgo value={item.createdAt} className="text-xs text-ax-subtle" />
                  </li>
                ))}
              </ul>
            </AdminPanel>
          )}
        </div>
      </div>
    </div>
  );
}

