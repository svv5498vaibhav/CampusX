import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, CalendarDays, ExternalLink, Medal, Pencil, SearchX, Share2, Sparkles } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { AchievementMenu } from '@/components/achievements/AchievementMenu';
import { AchievementProof } from '@/components/achievements/AchievementProof';
import { VerificationBadge } from '@/components/achievements/VerificationBadge';
import { PageContainer } from '@/components/layout/PageContainer';
import { ModerationNotice } from '@/components/safety/ModerationNotice';
import { ShareToFeedDialog } from '@/components/showcase/ShareToFeedDialog';
import { Alert, Avatar, Badge, Button, Card, EmptyState, ErrorState, Loader } from '@/components/ui';
import { profilePath, ROUTES } from '@/constants/routes';
import { ACHIEVEMENT_TYPE_ICONS, achievementPath, achievementTypeLabel, achievementUrl, formatDate, visibilityLabel } from '@/constants/showcase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuthStore } from '@/store/authStore';
import { useAchievementStore } from '@/store/achievementStore';
import { toast } from '@/store/toastStore';
import { getFullName } from '@/utils/string';
import { safeExternalUrl } from '@/utils/url';

/** One achievement: what, where, when, result, skills, proof and its verification status. */
export default function AchievementDetailsPage() {
  const { achievementId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id);
  const achievement = useAchievementStore((state) => state.selectedAchievement);
  const status = useAchievementStore((state) => state.selectedStatus);
  const error = useAchievementStore((state) => state.selectedError);
  const options = useAchievementStore((state) => state.options);
  const { forViewer, loadOptions, fetchAchievement, shareAchievement } = useAchievementStore.getState();
  const [offerShare, setOfferShare] = useState(Boolean(location.state?.justCreated));
  const [sharing, setSharing] = useState(false);
  const current = achievement?.id === achievementId ? achievement : null;
  useDocumentTitle(current?.title ?? 'Achievement');

  useEffect(() => {
    forViewer(userId);
    loadOptions();
  }, [userId]);
  useEffect(() => {
    fetchAchievement(achievementId);
    if (location.state?.justCreated) navigate(location.pathname, { replace: true, state: null });
  }, [achievementId, userId]);

  if (!current) {
    return (
      <PageContainer width="narrow">
        {status === 'not-found' ? (
          <EmptyState icon={SearchX} titleAs="h1" title="Achievement not found." description="It may have been deleted, or it isn't shared with you." action={<Button as={Link} to={ROUTES.ACHIEVEMENTS}>Browse achievements</Button>} />
        ) : status === 'error' ? (
          <ErrorState title="We couldn't load this achievement" description={error} onRetry={() => fetchAchievement(achievementId)} />
        ) : (
          <Loader centered label="Loading achievement" />
        )}
      </PageContainer>
    );
  }

  const Icon = ACHIEVEMENT_TYPE_ICONS[current.type] ?? ACHIEVEMENT_TYPE_ICONS.other;
  const owner = current.owner;
  const share = async () => {
    if (await shareAchievement(current.id)) toast.success('Achievement link copied!');
    else toast.error(`Couldn't copy automatically. The link is ${achievementUrl(current.id)}`);
  };

  return (
    <PageContainer width="narrow">
      <Button as={Link} to={ROUTES.ACHIEVEMENTS} variant="ghost" size="sm" leftIcon={ArrowLeft} className="-ml-2 mb-3">All achievements</Button>

      {offerShare && current.isOwner && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/40 bg-primary-soft px-4 py-3">
          <Sparkles className="size-5 text-primary" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm font-semibold text-ink">Achievement added! Share your win with CampusX?</p>
          <Button size="sm" variant="outline" onClick={() => setOfferShare(false)}>Not now</Button>
          <Button size="sm" onClick={() => { setOfferShare(false); setSharing(true); }}>Share</Button>
        </div>
      )}

      <article className="flex flex-col gap-5" aria-labelledby="achievement-title">
        <Card className="campus-grid">
          <div className="flex items-start gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-fg">
              <Icon className="size-7" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="neutral">{achievementTypeLabel(options, current.type)}</Badge>
                {current.isOwner && <Badge variant="outline">{visibilityLabel(options, current.visibility)}</Badge>}
              </div>
              <h1 id="achievement-title" className="mt-2 font-display text-2xl leading-tight font-bold text-ink sm:text-3xl">{current.title}</h1>
              {current.moderation && <ModerationNotice status={current.moderation.status} noun="achievement" className="mt-3" />}
            </div>
            <AchievementMenu achievement={current} onDeleted={() => navigate(ROUTES.ACHIEVEMENTS, { replace: true })} />
          </div>

          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            {current.organization && <div className="flex items-start gap-2"><Building2 className="mt-0.5 size-4 text-primary" aria-hidden="true" /><div><dt className="text-xs text-ink-subtle">Organization</dt><dd className="font-semibold text-ink">{current.organization}</dd></div></div>}
            {current.eventName && <div className="flex items-start gap-2"><Sparkles className="mt-0.5 size-4 text-primary" aria-hidden="true" /><div><dt className="text-xs text-ink-subtle">Event</dt><dd className="font-semibold text-ink">{current.eventName}</dd></div></div>}
            <div className="flex items-start gap-2"><CalendarDays className="mt-0.5 size-4 text-primary" aria-hidden="true" /><div><dt className="text-xs text-ink-subtle">Date</dt><dd className="font-semibold text-ink">{formatDate(current.date)}</dd></div></div>
            {current.rank && <div className="flex items-start gap-2"><Medal className="mt-0.5 size-4 text-primary" aria-hidden="true" /><div><dt className="text-xs text-ink-subtle">Result</dt><dd className="font-semibold text-ink">{current.rank}</dd></div></div>}
          </dl>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {current.isOwner && <Button as={Link} to={`${achievementPath(current.id)}/edit`} variant="outline" size="sm" leftIcon={Pencil}>Edit</Button>}
            <Button variant="outline" size="sm" leftIcon={Share2} onClick={share}>Share</Button>
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-bold text-ink">Verification</h2>
          <div className="mt-3"><VerificationBadge status={current.verificationStatus} showHint /></div>
          {current.isOwner && current.verificationStatus === 'rejected' && current.verification?.note && (
            <Alert variant="info" className="mt-3" title="Moderator note">{current.verification.note}</Alert>
          )}
        </Card>

        {current.description && (
          <Card>
            <h2 className="font-display text-lg font-bold text-ink">The story</h2>
            <p className="mt-2 text-[15px] leading-relaxed break-words whitespace-pre-line text-ink">{current.description}</p>
          </Card>
        )}

        {current.skills.length > 0 && (
          <Card>
            <h2 className="font-display text-lg font-bold text-ink">Skills</h2>
            <ul className="mt-3 flex flex-wrap gap-1.5">{current.skills.map((skill) => <li key={skill} className="rounded-lg bg-primary-soft px-2.5 py-1 text-sm font-semibold text-primary-soft-fg">{skill}</li>)}</ul>
          </Card>
        )}

        <Card>
          <h2 className="font-display text-lg font-bold text-ink">Proof & certificate</h2>
          {safeExternalUrl(current.certificateUrl) && (
            <a href={safeExternalUrl(current.certificateUrl)} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
              <ExternalLink className="size-4" aria-hidden="true" /> Online certificate
            </a>
          )}
          <div className="mt-3"><AchievementProof achievement={current} /></div>
        </Card>

        {owner && (
          <Card padding="sm">
            <Link to={profilePath(owner.id)} className="flex items-center gap-3 rounded-xl hover:bg-surface-muted">
              <Avatar src={owner.avatarUrl} name={getFullName(owner)} size="md" />
              <div className="min-w-0">
                <p className="truncate font-bold text-ink">{getFullName(owner)}</p>
                <p className="truncate text-xs text-ink-muted">{[owner.branch?.shortName, owner.semester?.label, owner.college?.name].filter(Boolean).join(' • ')}</p>
              </div>
            </Link>
          </Card>
        )}
      </article>

      {current.isOwner && (
        <ShareToFeedDialog open={sharing} onClose={() => setSharing(false)} item={{ kind: 'achievement', title: current.title, url: achievementUrl(current.id), visibility: current.visibility }} />
      )}
    </PageContainer>
  );
}
