import { useEffect } from 'react';
import { UserRoundX } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ProfileView } from '@/components/profile/ProfileView';
import { ReportButton } from '@/components/safety/ReportButton';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button, Card, EmptyState, ErrorState, Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { RedirectTo } from '@/routes/RedirectTo';
import { useAuthStore } from '@/store/authStore';
import { useProfileStore } from '@/store/profileStore';

/** Another student's profile: public information only, read-only. */
export default function PublicProfilePage() {
  const { userId } = useParams();
  const myId = useAuthStore((state) => state.user?.id);
  const { viewedProfile: profile, viewedStatus, viewedError, fetchPublicProfile } = useProfileStore();
  const isMine = userId === myId;
  useDocumentTitle(profile ? `${profile.firstName} ${profile.lastName}` : 'Student profile');

  useEffect(() => {
    if (!isMine) fetchPublicProfile(userId);
  }, [userId, isMine, fetchPublicProfile]);

  if (isMine) return <RedirectTo to={ROUTES.PROFILE} fullScreen={false} />;

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

  return (
    <PageContainer width="wide">
      <ProfileView profile={profile} actions={<ReportButton target={{ type: 'user', id: profile.id }} label="Report" variant="outline" aria-label={`Report ${profile.firstName} ${profile.lastName}`} />} />
    </PageContainer>
  );
}
