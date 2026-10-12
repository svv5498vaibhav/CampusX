import { useEffect, useState } from 'react';
import { Camera, Palette, Pencil } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { CampusJourneyCard } from '@/components/gamification/CampusJourneyCard';
import { DangerZoneCard } from '@/components/profile/DangerZoneCard';
import { ImageUploadDialog } from '@/components/profile/ImageUploadDialog';
import { ProfileView } from '@/components/profile/ProfileView';
import { RoadmapProfileCard } from '@/components/roadmap/RoadmapProfileCard';
import { PageContainer } from '@/components/layout/PageContainer';
import { Alert, Button, ErrorState, Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useProfileStore } from '@/store/profileStore';

// Where each completeness item is edited.
const EDIT_SECTION = { name: 'about', bio: 'about', skills: 'skills', interests: 'interests', college: 'campus', branch: 'campus', semester: 'campus' };

/** The signed-in student's own profile (always loaded from the session, never by id). */
export default function ProfilePage() {
  useDocumentTitle('My Profile');
  const navigate = useNavigate();
  const location = useLocation();
  const store = useProfileStore();
  const { ownProfile: profile, ownStatus, ownError, options } = store;
  const [dialog, setDialog] = useState(null); // 'avatar' | 'cover' | null
  // "Profile updated" after saving the editor. Read once, then cleared so a reload won't repeat it.
  const [justSaved] = useState(() => Boolean(location.state?.saved));

  useEffect(() => {
    store.fetchOwnProfile();
    store.loadOptions();
    if (location.state?.saved) navigate(location.pathname, { replace: true, state: null });
    // Load once on arrival; store actions are stable.
  }, []);

  if (!profile) {
    return (
      <PageContainer width="wide">
        {ownStatus === 'error' ? (
          <ErrorState title="We couldn't load your profile" description={ownError} onRetry={store.fetchOwnProfile} />
        ) : (
          <Loader centered label="Loading your profile" />
        )}
      </PageContainer>
    );
  }

  const fullName = `${profile.firstName} ${profile.lastName}`;
  const goToEditor = (section) => navigate(section ? `${ROUTES.PROFILE_EDIT}#${section}` : ROUTES.PROFILE_EDIT);

  return (
    <PageContainer width="wide">
      {justSaved && (
        <Alert variant="success" title="Profile updated" className="mb-6">
          Your changes are live.
        </Alert>
      )}

      <ProfileView
        profile={profile}
        isOwner
        onChangePhoto={() => setDialog('avatar')}
        onChangeCover={() => setDialog('cover')}
        renderAside={(theme, headingAs) => <CampusJourneyCard theme={theme} headingAs={headingAs} />}
        banner={<RoadmapProfileCard />}
        onCompletionAction={(item) => (item === 'photo' ? setDialog('avatar') : goToEditor(EDIT_SECTION[item]))}
        actions={
          <>
            <Button as={Link} to={ROUTES.PROFILE_EDIT} leftIcon={Pencil}>
              Edit profile
            </Button>
            <Button variant="outline" leftIcon={Camera} onClick={() => setDialog('avatar')}>
              Change photo
            </Button>
            <Button variant="outline" leftIcon={Palette} onClick={() => goToEditor('style')}>
              Choose style
            </Button>
          </>
        }
      />

      {/* Last on the page, after every profile section and setting. */}
      <DangerZoneCard />

      {options && (
        <>
          <ImageUploadDialog
            open={dialog === 'avatar'}
            onClose={() => setDialog(null)}
            kind="avatar"
            name={fullName}
            currentUrl={profile.avatarUrl}
            rules={options.media.avatar}
            onUpload={store.uploadAvatar}
            onRemove={store.deleteAvatar}
          />
          <ImageUploadDialog
            open={dialog === 'cover'}
            onClose={() => setDialog(null)}
            kind="cover"
            name={fullName}
            currentUrl={profile.coverImageUrl}
            rules={options.media.cover}
            onUpload={store.uploadCover}
            onRemove={store.deleteCover}
          />
        </>
      )}
    </PageContainer>
  );
}
