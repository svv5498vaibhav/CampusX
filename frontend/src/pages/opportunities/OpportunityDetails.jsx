import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  CalendarDays,
  CircleSlash,
  ExternalLink,
  Flag,
  IndianRupee,
  Megaphone,
  Pencil,
  SearchX,
  Share2,
  Trophy,
  X,
} from 'lucide-react';
import { Link, useParams } from 'react-router';
import { PageContainer } from '@/components/layout/PageContainer';
import { OpportunityDeadline, useDeadline } from '@/components/opportunities/OpportunityDeadline';
import { OpportunitySaveButton } from '@/components/opportunities/OpportunitySaveButton';
import { TrackingBadge, TrackingStatusSelect } from '@/components/opportunities/OpportunityStatus';
import { OpportunityTypeIcon } from '@/components/opportunities/OpportunityTypeIcon';
import { ReportModal } from '@/components/safety/ReportModal';
import { ShareToFeedDialog } from '@/components/showcase/ShareToFeedDialog';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Loader, Modal, Textarea } from '@/components/ui';
import {
  OPPORTUNITY_MODE_ICONS,
  applyLink,
  editOpportunityPath,
  formatDay,
  formatDeadline,
  modeLabel,
  opportunityStatusLabel,
  opportunityUrl,
  safeExternalUrl,
  typeLabel,
} from '@/constants/opportunities';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuthStore } from '@/store/authStore';
import { useOpportunityStore } from '@/store/opportunityStore';
import { toast } from '@/store/toastStore';

/** Opens the organizer's site in a new tab. CampusX never applies on the student's behalf. */
function ApplyButton({ link, onOpened, fullWidth = false }) {
  return (
    <Button as="a" href={link.url} target="_blank" rel="noopener noreferrer nofollow" rightIcon={ExternalLink} onClick={onOpened} fullWidth={fullWidth}>
      {link.label}
    </Button>
  );
}

function ClosedNotice({ fullWidth = false }) {
  return (
    <span className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-surface-muted px-5 text-sm font-semibold text-ink-muted ${fullWidth ? 'w-full' : ''}`}>
      <CircleSlash className="size-4" aria-hidden="true" /> Application closed
    </span>
  );
}

function Detail({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-ink-subtle">{label}</dt>
        <dd className="text-sm font-semibold break-words text-ink">{children}</dd>
      </div>
    </div>
  );
}

/** The student's own record: status, private notes, remove. */
function MyTrackingCard({ opportunity }) {
  const { updateApplicationStatus, removeTracking } = useOpportunityStore.getState();
  const busy = useOpportunityStore((state) => Boolean(state.busy[opportunity.id]));
  const maxNotes = useOpportunityStore((state) => state.options?.rules.notes.max ?? 1000);
  const [notes, setNotes] = useState(opportunity.tracking.notes ?? '');
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setNotes(opportunity.tracking.notes ?? ''), [opportunity.tracking.notes]);

  const saveNotes = async () => {
    try {
      await updateApplicationStatus(opportunity.id, undefined, notes.trim());
      toast.success('Notes saved.');
    } catch (error) {
      toast.error(error.message);
    }
  };
  const remove = async () => {
    try {
      await removeTracking(opportunity.id);
      setConfirming(false);
      toast.info('Removed from My Opportunities.');
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Card padding="sm" aria-labelledby="my-tracking-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="my-tracking-title" className="text-sm font-semibold text-ink-muted">Your progress</h2>
        <TrackingBadge status={opportunity.tracking.status} />
      </div>
      <div className="mt-3">
        <TrackingStatusSelect opportunity={opportunity} label="Status" />
      </div>
      <p className="mt-2 text-xs text-ink-subtle">Only you can see this. CampusX can’t see applications on other sites, so you keep it up to date.</p>
      <Textarea label="Private notes" containerClassName="mt-3" rows={3} maxLength={maxNotes} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Interview on Friday, team name, what to prepare…" />
      <div className="mt-2 flex flex-wrap justify-between gap-2">
        <Button variant="ghost" size="sm" leftIcon={X} onClick={() => setConfirming(true)} className="-ml-2">Remove from my list</Button>
        <Button variant="secondary" size="sm" onClick={saveNotes} loading={busy} disabled={notes.trim() === (opportunity.tracking.notes ?? '')}>Save notes</Button>
      </div>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Remove from My Opportunities?"
        description="Your status and notes for this opportunity will be deleted."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(false)}>Keep it</Button>
            <Button variant="danger" onClick={remove} loading={busy}>Remove</Button>
          </>
        }
      />
    </Card>
  );
}

/** /opportunities/:opportunityId: everything about one opportunity, and the student's own progress. */
export default function OpportunityDetails() {
  const { opportunityId } = useParams();
  const userId = useAuthStore((state) => state.user?.id);
  const opportunity = useOpportunityStore((state) => state.selectedOpportunity);
  const status = useOpportunityStore((state) => state.selectedStatus);
  const error = useOpportunityStore((state) => state.selectedError);
  const options = useOpportunityStore((state) => state.options);
  const busy = useOpportunityStore((state) => Boolean(state.busy[opportunityId]));
  const { forViewer, loadOptions, fetchOpportunity, shareOpportunity, updateApplicationStatus } = useOpportunityStore.getState();
  const [askApplied, setAskApplied] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [posting, setPosting] = useState(false);
  const current = opportunity?.id === opportunityId ? opportunity : null;
  const deadline = useDeadline(current ?? {});
  useDocumentTitle(current?.title ?? 'Opportunity');
  const shareItem = useMemo(() => current && { kind: 'opportunity', title: current.title, url: opportunityUrl(current.id), visibility: 'public' }, [current?.id, current?.title]);

  useEffect(() => {
    forViewer(userId);
    loadOptions();
  }, [userId]);
  useEffect(() => {
    setAskApplied(false);
    fetchOpportunity(opportunityId);
  }, [opportunityId, userId]);

  if (!current) {
    return (
      <PageContainer width="default">
        {status === 'not-found' ? (
          <EmptyState icon={SearchX} titleAs="h1" title="Opportunity not found." description="It may have been removed, or it isn't open to your college." action={<Button as={Link} to={ROUTES.OPPORTUNITIES}>Explore opportunities</Button>} />
        ) : status === 'error' ? (
          <ErrorState title="We couldn't load this opportunity" description={error} onRetry={() => fetchOpportunity(opportunityId)} />
        ) : (
          <Loader centered label="Loading opportunity" />
        )}
      </PageContainer>
    );
  }

  const link = applyLink(current);
  const open = current.acceptingApplications && deadline.state !== 'closed';
  const tracking = current.tracking;
  const alreadyApplied = Boolean(tracking?.appliedAt);
  const ModeIcon = OPPORTUNITY_MODE_ICONS[current.mode] ?? OPPORTUNITY_MODE_ICONS.online;
  const registration = link?.verb === 'apply' ? safeExternalUrl(current.registrationUrl) : null;
  const eligibility = current.viewerEligibility ?? { eligible: true, reasons: [] };
  const eligibleFor = current.eligibleFor ?? { colleges: [], branches: [], semesters: [] };
  const hasRules = eligibleFor.colleges.length + eligibleFor.branches.length + eligibleFor.semesters.length > 0;

  const share = async () => {
    if (await shareOpportunity(current.id)) toast.success('Opportunity link copied!');
    else toast.error(`Couldn't copy automatically. The link is ${opportunityUrl(current.id)}`);
  };
  const opened = () => {
    if (!alreadyApplied) setAskApplied(true);
  };
  const markApplied = async () => {
    try {
      await updateApplicationStatus(current.id, 'applied');
      setAskApplied(false);
      toast.success('Marked as applied. Good luck!');
    } catch (requestError) {
      toast.error(requestError.message);
    }
  };

  const applyHint = `The ${link?.verb === 'register' ? 'registration' : 'application'} happens on the organizer’s site, so CampusX can’t tell. Mark it here to keep track.`;
  const primaryAction = (fullWidth) => (open ? link ? <ApplyButton link={link} onOpened={opened} fullWidth={fullWidth} /> : null : <ClosedNotice fullWidth={fullWidth} />);

  return (
    <PageContainer width="default" className="pb-28 md:pb-10">
      <Button as={Link} to={ROUTES.OPPORTUNITIES} variant="ghost" size="sm" leftIcon={ArrowLeft} className="-ml-2 mb-3">All opportunities</Button>

      {current.canManage && current.status !== 'published' && (
        <Alert variant="info" className="mb-4" title={`${opportunityStatusLabel(options, current.status)}: students ${current.status === 'closed' ? 'see it as closed' : 'can’t see this'}`}>
          Change it from the management page.
        </Alert>
      )}

      <article className="flex flex-col gap-5" aria-labelledby="opportunity-title">
        {current.image && <img src={current.image} alt="" className="aspect-[5/2] w-full rounded-3xl border border-line object-cover" />}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <OpportunityTypeIcon opportunity={current} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold tracking-wide text-primary uppercase">{typeLabel(options, current.type)}</p>
              <OpportunityDeadline opportunity={current} />
              {current.featured && <Badge variant="accent" className="px-2 py-0.5 text-[11px]">Featured</Badge>}
            </div>
            <h1 id="opportunity-title" className="mt-1 font-display text-2xl leading-tight font-bold text-ink sm:text-3xl">{current.title}</h1>
            <p className="mt-1 font-semibold text-ink-muted">{current.organizer}</p>
            <p className="mt-2 text-ink">{current.shortDescription}</p>
          </div>
        </div>

        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {primaryAction(false)}
          <OpportunitySaveButton opportunity={current} size="md" showStatus={false} />
          <Button variant="outline" leftIcon={Share2} onClick={share}>Share</Button>
          <Button variant="ghost" leftIcon={Megaphone} onClick={() => setPosting(true)}>Post to campus</Button>
          <Button variant="ghost" leftIcon={Flag} onClick={() => setReporting(true)} className="ml-auto">Report</Button>
          {current.canManage && <Button as={Link} to={editOpportunityPath(current.id)} variant="outline" leftIcon={Pencil}>Edit</Button>}
        </div>
        <div className="flex flex-wrap gap-2 md:hidden">
          <Button variant="outline" size="sm" leftIcon={Share2} onClick={share}>Share</Button>
          <Button variant="ghost" size="sm" leftIcon={Megaphone} onClick={() => setPosting(true)}>Post</Button>
          <Button variant="ghost" size="sm" leftIcon={Flag} onClick={() => setReporting(true)}>Report</Button>
          {current.canManage && <Button as={Link} to={editOpportunityPath(current.id)} variant="outline" size="sm" leftIcon={Pencil}>Edit</Button>}
        </div>

        {askApplied && open && (
          <div role="status" className="hidden items-center gap-3 rounded-2xl border border-primary/40 bg-primary-soft px-4 py-3 md:flex">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">Did you {link?.verb ?? 'apply'}?</p>
              <p className="text-sm text-ink-muted">{applyHint}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setAskApplied(false)}>Not yet</Button>
              <Button size="sm" leftIcon={BadgeCheck} onClick={markApplied} loading={busy}>Yes, mark as applied</Button>
            </div>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="flex min-w-0 flex-col gap-5">
            <Card>
              <h2 className="font-display text-lg font-bold text-ink">About</h2>
              <p className="mt-2 text-[15px] leading-relaxed break-words whitespace-pre-line text-ink">{current.description}</p>
            </Card>

            <Card aria-labelledby="eligibility-title">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="eligibility-title" className="font-display text-lg font-bold text-ink">Eligibility</h2>
                {eligibility.eligible ? (
                  <Badge variant="primary" icon={BadgeCheck}>You’re eligible</Badge>
                ) : (
                  <Badge variant="neutral" icon={CircleSlash}>Not eligible</Badge>
                )}
              </div>
              {!eligibility.eligible && (
                <ul className="mt-3 flex flex-col gap-1 text-sm text-ink-muted" aria-label="Why you're not eligible">
                  {eligibility.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
                </ul>
              )}
              <p className="mt-2 text-xs text-ink-subtle">Checked against the college, branch and semester on your CampusX profile.</p>
              {current.eligibility && <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-ink">{current.eligibility}</p>}
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-semibold text-ink-subtle">Colleges</dt>
                  <dd className="text-ink">{eligibleFor.colleges.length ? eligibleFor.colleges.map((college) => college.shortName).join(', ') : 'Any college'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-ink-subtle">Branches</dt>
                  <dd className="text-ink">{eligibleFor.branches.length ? eligibleFor.branches.map((branch) => branch.shortName).join(', ') : 'Any branch'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-ink-subtle">Semesters</dt>
                  <dd className="text-ink">{eligibleFor.semesters.length ? eligibleFor.semesters.join(', ') : 'Any semester'}</dd>
                </div>
              </dl>
              {!hasRules && !current.eligibility && <p className="sr-only">Open to every student.</p>}
            </Card>

            {(current.skills.length > 0 || current.tags.length > 0) && (
              <Card>
                {current.skills.length > 0 && (
                  <>
                    <h2 className="font-display text-lg font-bold text-ink">Skills</h2>
                    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Skills">
                      {current.skills.map((skill) => <li key={skill} className="rounded-lg bg-primary-soft px-2.5 py-1 text-sm font-semibold text-primary-soft-fg">{skill}</li>)}
                    </ul>
                  </>
                )}
                {current.tags.length > 0 && (
                  <>
                    <h2 className="mt-4 text-sm font-semibold text-ink-muted first:mt-0">Tags</h2>
                    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Tags">
                      {current.tags.map((tag) => <li key={tag} className="rounded-md bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-muted">#{tag}</li>)}
                    </ul>
                  </>
                )}
              </Card>
            )}
          </div>

          <aside className="flex flex-col gap-4" aria-label="Key details">
            {tracking && <MyTrackingCard opportunity={current} />}
            <Card padding="sm">
              <h2 className="text-sm font-semibold text-ink-muted">Key details</h2>
              <dl className="mt-3 flex flex-col gap-3">
                <Detail icon={CalendarClock} label="Application deadline">
                  {current.applicationDeadline ? formatDeadline(current.applicationDeadline) : 'No fixed deadline'}
                  <span className="mt-1 block"><OpportunityDeadline opportunity={current} /></span>
                </Detail>
                <Detail icon={ModeIcon} label="Mode">{modeLabel(options, current.mode)}</Detail>
                {current.location && <Detail icon={OPPORTUNITY_MODE_ICONS.offline} label="Location">{current.location}</Detail>}
                {current.startDate && <Detail icon={CalendarDays} label="Starts">{formatDay(current.startDate)}</Detail>}
                {current.endDate && <Detail icon={CalendarDays} label="Ends">{formatDay(current.endDate)}</Detail>}
                {current.prize && <Detail icon={Trophy} label="Prize">{current.prize}</Detail>}
                {current.fee && <Detail icon={IndianRupee} label="Fee">{current.fee}</Detail>}
              </dl>
              {registration && open && (
                <a href={registration} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-primary hover:bg-primary-soft">
                  <ExternalLink className="size-4" aria-hidden="true" /> Registration page
                </a>
              )}
            </Card>
          </aside>
        </div>
      </article>

      <div role="group" aria-label="Apply and save" className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 mt-6 rounded-2xl border border-line bg-overlay/95 p-3 shadow-lift backdrop-blur-md md:hidden">
        {askApplied && open ? (
          <div role="status" className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-ink">Did you {link?.verb ?? 'apply'}? <span className="font-normal text-ink-muted">{applyHint}</span></p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" fullWidth onClick={() => setAskApplied(false)}>Not yet</Button>
              <Button size="sm" fullWidth leftIcon={BadgeCheck} onClick={markApplied} loading={busy}>Yes, mark as applied</Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">{primaryAction(true) ?? <p className="text-center text-sm text-ink-muted">See the description to take part</p>}</div>
            <OpportunitySaveButton opportunity={current} size="md" />
          </div>
        )}
      </div>

      <ReportModal target={{ type: 'opportunity', id: current.id }} open={reporting} onClose={() => setReporting(false)} />
      {shareItem && <ShareToFeedDialog open={posting} onClose={() => setPosting(false)} item={shareItem} />}
    </PageContainer>
  );
}
