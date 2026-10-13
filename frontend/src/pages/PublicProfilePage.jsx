import { useEffect, useState } from 'react';
import { Ban, Flag, ShieldCheck, UserRoundX } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { PostMenu } from '@/components/feed/PostMenu';
import { ProfileView } from '@/components/profile/ProfileView';
import { ReportModal } from '@/components/safety/ReportModal';
import { BlockDialog } from '@/components/social/BlockDialog';
import { FollowButton } from '@/components/social/FollowButton';
import { FollowListModal } from '@/components/social/FollowListModal';
import { FollowStats } from '@/components/social/FollowStats';
import { MessageButton } from '@/components/social/MessageButton';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button, Card, EmptyState, ErrorState, Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { RedirectTo } from '@/routes/RedirectTo';
import { useAuthStore } from '@/store/authStore';
import { useFollowStore } from '@/store/followStore';
import { useProfileStore } from '@/store/profileStore';

const LISTS = ['followers', 'following'];

/**
 * Another student's profile: public information only. Follow and Message sit with the profile actions;
 * the follower counts open the followers/following list (?list=followers|following, so it can be linked).
 * A student you blocked shows Unblock instead; one who can't be followed or messaged shows neither.
 */
export default function PublicProfilePage() {
  const { userId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const myId = useAuthStore((state) => state.user?.id);
  const { viewedProfile: profile, viewedStatus, viewedError, fetchPublicProfile } = useProfileStore();
  const relation = useFollowStore((state) => state.relations[userId]);
  const celebratedAt = useFollowStore((state) => state.celebrations[userId]);
  const [dialog, setDialog] = useState(null); // 'block' | 'report' | null
  const isMine = userId === myId;
  const list = LISTS.includes(searchParams.get('list')) ? searchParams.get('list') : null;
  useDocumentTitle(profile ? `${profile.firstName} ${profile.lastName}` : 'Student profile');

  useEffect(() => {
    if (!isMine) fetchPublicProfile(userId);
  }, [userId, isMine, fetchPublicProfile]);

  // Counts and relationship from the profile feed the shared follow state (buttons and lists everywhere).
  useEffect(() => {
    if (profile?.id === userId) useFollowStore.getState().seedProfile(profile);
  }, [profile, userId]);

  if (isMine) return <RedirectTo to={`${ROUTES.PROFILE}${list ? `?list=${list}` : ''}`} fullScreen={false} />;

  if (viewedStatus === 'not-found') {
    return (
      <PageContainer width="narrow">
        <Card className="campus-grid">
          <EmptyState
            titleAs="h1"
            icon={UserRoundX}
            title="We couldn't find that student"
            description="The link may be wrong, or the account may no longer be active."
            action={
              <Button as={Link} to={ROUTES.HOME}>
                Back to campus home
              </Button>
            }
          />
        </Card>
      </PageContainer>
    );
  }

  if (viewedStatus === 'error') {
    return (
      <PageContainer width="narrow">
        <ErrorState title="We couldn't load this profile" description={viewedError} onRetry={() => fetchPublicProfile(userId)} />
      </PageContainer>
    );
  }

  if (!profile || profile.id !== userId) {
    return <Loader centered label="Loading profile" />;
  }

  const fullName = `${profile.firstName} ${profile.lastName}`;
  const blockedByYou = Boolean(relation?.blockedByYou);
  const openList = (kind) => setSearchParams(kind ? { list: kind } : {}, { replace: true, preventScrollReset: true });

  const actions = (
    <>
      {blockedByYou ? (
        <Button variant="outline" leftIcon={ShieldCheck} onClick={() => setDialog('block')}>
          Unblock
        </Button>
      ) : (
        <>
          {relation?.canFollow !== false && <FollowButton userId={profile.id} name={fullName} />}
          {relation?.canMessage && <MessageButton userId={profile.id} name={fullName} />}
        </>
      )}
    </>
  );
  // Report and Block live in one ⋮ menu so Follow and Message stay the clear main actions.
  const menu = (
    <PostMenu
      label={`More options for ${fullName}`}
      triggerClassName="size-11 rounded-xl border border-line-strong bg-surface text-ink-muted hover:border-primary hover:text-primary aria-expanded:border-primary aria-expanded:text-primary"
      items={[
        { id: 'report', label: 'Report', icon: Flag, onSelect: () => setDialog('report') },
        { id: 'block', label: blockedByYou ? 'Unblock' : 'Block', icon: blockedByYou ? ShieldCheck : Ban, onSelect: () => setDialog('block'), danger: !blockedByYou },
      ]}
    />
  );

  return (
    <PageContainer width="wide">
      <ProfileView profile={profile} actions={actions} menu={menu} stats={<FollowStats userId={profile.id} onOpen={openList} />} celebrateAt={celebratedAt} />
      <FollowListModal userId={profile.id} name={fullName} kind={list} onKindChange={openList} onClose={() => openList(null)} />
      <BlockDialog open={dialog === 'block'} onClose={() => setDialog(null)} userId={profile.id} name={fullName} />
      <ReportModal target={{ type: 'user', id: profile.id }} open={dialog === 'report'} onClose={() => setDialog(null)} />
    </PageContainer>
  );
}
