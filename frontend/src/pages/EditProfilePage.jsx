import { useEffect, useMemo, useState } from 'react';
import { Eye, ImagePlus, Camera, Lock, Save } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { InterestSelector } from '@/components/onboarding/InterestSelector';
import { SemesterSelector } from '@/components/onboarding/SemesterSelector';
import { SkillSelector } from '@/components/onboarding/SkillSelector';
import { ChangePasswordCard } from '@/components/profile/ChangePasswordCard';
import { ImageUploadDialog } from '@/components/profile/ImageUploadDialog';
import { ProfileView } from '@/components/profile/ProfileView';
import { ThemePicker } from '@/components/profile/ThemePicker';
import { PageContainer } from '@/components/layout/PageContainer';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { Alert, Avatar, Button, Card, ErrorState, Input, Loader, Modal, Select, Textarea } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useProfileStore } from '@/store/profileStore';
import { branchesForCollege, normaliseRollNumber, validateStep } from '@/utils/onboarding';
import { validateName } from '@/utils/validation';

const formFromProfile = (profile) => ({
  firstName: profile.firstName,
  lastName: profile.lastName,
  bio: profile.bio ?? '',
  skills: profile.skills,
  interests: profile.interests.map((interest) => interest.id),
  profileTheme: profile.theme,
  college: profile.college?.id ?? '',
  branch: profile.branch?.id ?? '',
  semester: profile.semester?.value ?? null,
  rollNumber: profile.rollNumber ?? '',
});

/** The profile as it will look once saved, with labels from the API options. */
function previewFrom(profile, form, options) {
  const find = (list, id) => list.find((item) => item.id === id);
  const college = find(options.colleges, form.college);
  const branch = find(options.branches, form.branch);
  const semester = options.semesters.find((item) => item.value === form.semester);
  return {
    ...profile,
    firstName: form.firstName.trim() || profile.firstName,
    lastName: form.lastName.trim() || profile.lastName,
    bio: form.bio.trim(),
    skills: form.skills,
    interests: form.interests.map((id) => find(options.interests, id)).filter(Boolean),
    theme: form.profileTheme,
    college: college ? { id: college.id, name: college.name } : null,
    branch: branch ? { id: branch.id, name: branch.name } : null,
    semester: semester ? { value: semester.value, label: semester.label } : null,
  };
}

function validateForm(form, options, profile) {
  const { rules, profileRules } = options;
  return {
    firstName: validateName(form.firstName, 'first name'),
    lastName: validateName(form.lastName, 'last name'),
    bio: form.bio.trim().length > profileRules.bio.maxLength ? `Bio must be ${profileRules.bio.maxLength} characters or fewer.` : undefined,
    interests: validateStep('interests', form, rules) || undefined,
    college: profile.campusIdentityLocked ? undefined : validateStep('college', form, rules) || undefined,
    branch: validateStep('branch', form, rules) || undefined,
    semester: validateStep('semester', form, rules) || undefined,
    rollNumber: profile.campusIdentityLocked ? undefined : validateStep('rollNumber', form, rules) || undefined,
  };
}

const FieldError = ({ message }) =>
  message ? (
    <p role="alert" className="text-xs font-medium text-danger-fg">
      {message}
    </p>
  ) : null;

const EditorCard = ({ id, title, description, children }) => (
  <Card id={id} className="scroll-mt-24">
    <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
    {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
    <div className="mt-5 flex flex-col gap-5">{children}</div>
  </Card>
);

export default function EditProfilePage() {
  useDocumentTitle('Edit profile');
  const navigate = useNavigate();
  const location = useLocation();
  const store = useProfileStore();
  const { ownProfile: profile, ownStatus, ownError, options, optionsStatus, optionsError } = store;

  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [dialog, setDialog] = useState(null); // 'avatar' | 'cover' | 'preview' | 'discard' | null

  useEffect(() => {
    store.fetchOwnProfile();
    store.loadOptions();
    // Load once on arrival; store actions are stable.
  }, []);

  // Start the form from the saved profile once it's available.
  useEffect(() => {
    if (profile && !form) setForm(formFromProfile(profile));
  }, [profile, form]);

  const isReady = Boolean(profile && form && options);

  // Jump to a section when linked with a hash, e.g. /profile/edit#style.
  useEffect(() => {
    if (!isReady || !location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [isReady, location.hash]);

  const preview = useMemo(() => (isReady ? previewFrom(profile, form, options) : null), [isReady, profile, form, options]);
  const isDirty = isReady && JSON.stringify(form) !== JSON.stringify(formFromProfile(profile));

  if (!isReady) {
    const failed = ownStatus === 'error' || optionsStatus === 'error';
    return (
      <PageContainer width="wide">
        {failed ? (
          <ErrorState
            title="We couldn't open the editor"
            description={ownError || optionsError}
            onRetry={() => {
              store.fetchOwnProfile();
              store.loadOptions();
            }}
          />
        ) : (
          <Loader centered label="Loading your profile" />
        )}
      </PageContainer>
    );
  }

  const set = (field) => (value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      // A new college may not offer the chosen branch.
      if (field === 'college' && value !== current.college) next.branch = '';
      return next;
    });
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };
  const setFromEvent = (field) => (event) => set(field)(event.target.value);

  const save = async (event) => {
    event.preventDefault();
    const nextErrors = validateForm(form, options, profile);
    setErrors(nextErrors);
    setFormError('');
    if (Object.values(nextErrors).some(Boolean)) {
      setFormError('Please fix the highlighted fields.');
      requestAnimationFrame(() => document.querySelector('[aria-invalid="true"], [role="alert"]')?.scrollIntoView({ block: 'center' }));
      return;
    }

    const changes = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      bio: form.bio.trim(),
      skills: form.skills,
      interests: form.interests,
      profileTheme: form.profileTheme,
      branch: form.branch,
      semester: form.semester,
      // Verified students can't change their campus identity; don't send it at all.
      ...(!profile.campusIdentityLocked && { college: form.college, rollNumber: normaliseRollNumber(form.rollNumber) }),
    };

    setIsSaving(true);
    try {
      await store.updateProfile(changes);
      navigate(ROUTES.PROFILE, { state: { saved: true } });
    } catch (error) {
      const fieldErrors = Object.fromEntries((error.errors ?? []).filter((item) => item.field).map((item) => [item.field, item.message]));
      setErrors(fieldErrors);
      setFormError(Object.keys(fieldErrors).length > 0 ? 'Please fix the highlighted fields.' : error.message);
      setIsSaving(false);
    }
  };

  const cancel = () => (isDirty ? setDialog('discard') : navigate(ROUTES.PROFILE));
  const fullName = `${profile.firstName} ${profile.lastName}`;
  const locked = profile.campusIdentityLocked;

  return (
    <PageContainer width="wide">
      <SectionHeader
        as="h1"
        eyebrow="My Profile"
        title="Edit your profile"
        description="The preview updates as you type. Photo and cover changes save right away; everything else saves when you press Save. Your password has its own section at the end."
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <form id="profile-form" noValidate onSubmit={save} className="flex min-w-0 flex-col gap-6">
            {formError && <Alert variant="danger">{formError}</Alert>}

            <EditorCard id="media" title="Photo & cover" description="These save as soon as you upload or remove them.">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-4">
                  <Avatar src={profile.avatarUrl} name={fullName} size="xl" shape="circle" />
                  <Button type="button" variant="outline" leftIcon={Camera} onClick={() => setDialog('avatar')}>
                    {profile.avatarUrl ? 'Change photo' : 'Add photo'}
                  </Button>
                </div>
                <Button type="button" variant="outline" leftIcon={ImagePlus} onClick={() => setDialog('cover')} className="sm:ml-auto">
                  {profile.coverImageUrl ? 'Change cover' : 'Add cover'}
                </Button>
              </div>
            </EditorCard>

            <EditorCard id="about" title="About you">
              <div className="grid gap-5 sm:grid-cols-2">
                <Input label="First name" autoComplete="given-name" value={form.firstName} onChange={setFromEvent('firstName')} error={errors.firstName} />
                <Input label="Last name" autoComplete="family-name" value={form.lastName} onChange={setFromEvent('lastName')} error={errors.lastName} />
              </div>
              <Textarea
                label="Bio"
                rows={5}
                placeholder="What do you study, build or care about? Clubs, goals, fun facts…"
                value={form.bio}
                onChange={setFromEvent('bio')}
                error={errors.bio}
                hint={`${form.bio.trim().length} / ${options.profileRules.bio.maxLength} characters`}
              />
            </EditorCard>

            <EditorCard id="campus" title="Campus" description="Your college, branch, semester and roll number.">
              {locked && (
                <Alert variant="info" title="Campus identity verified">
                  Your college and roll number are locked. Contact CampusX support if they need to change.
                </Alert>
              )}
              <Select
                label="College"
                value={form.college}
                onChange={setFromEvent('college')}
                options={options.colleges.map((college) => ({ value: college.id, label: college.name }))}
                placeholder="Select your college"
                error={errors.college}
                disabled={locked}
              />
              <Select
                label="Branch"
                value={form.branch}
                onChange={setFromEvent('branch')}
                options={branchesForCollege(options, form.college).map((branch) => ({ value: branch.id, label: branch.name }))}
                placeholder="Select your branch"
                error={errors.branch}
              />
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-ink">Semester</p>
                <SemesterSelector semesters={options.semesters} value={form.semester} onChange={set('semester')} />
                <FieldError message={errors.semester} />
              </div>
              <Input
                label="Roll number"
                autoCapitalize="characters"
                spellCheck={false}
                value={form.rollNumber}
                onChange={setFromEvent('rollNumber')}
                error={errors.rollNumber}
                disabled={locked}
                leftIcon={locked ? Lock : undefined}
                hint="Only you can see your roll number."
              />
            </EditorCard>

            <EditorCard id="skills" title="Skills" description="Optional. Tap a suggestion or type your own.">
              <SkillSelector suggestions={options.skillSuggestions} skills={form.skills} onChange={set('skills')} rules={options.rules} />
              <FieldError message={errors.skills} />
            </EditorCard>

            <EditorCard id="interests" title="Interests">
              <InterestSelector
                groups={options.interestGroups}
                interests={options.interests}
                selected={form.interests}
                onChange={set('interests')}
                rules={options.rules.interests}
              />
              <FieldError message={errors.interests} />
            </EditorCard>

            <EditorCard id="style" title="Choose your campus style" description="Pick a look for your profile. The preview changes instantly.">
              <ThemePicker themes={options.profileThemes} value={form.profileTheme} onChange={set('profileTheme')} />
              <FieldError message={errors.profileTheme} />
            </EditorCard>

            {/* Actions stay within reach while scrolling (above the phone tab bar). */}
            <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-2 rounded-2xl border border-line bg-surface/95 p-3 shadow-lift backdrop-blur-md md:bottom-4">
              <Button type="button" variant="ghost" onClick={cancel} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="button" variant="outline" leftIcon={Eye} onClick={() => setDialog('preview')} aria-label="Preview" className="lg:hidden">
                <span className="hidden sm:inline">Preview</span>
              </Button>
              <Button type="submit" leftIcon={Save} loading={isSaving} disabled={!isDirty && !isSaving} className="ml-auto">
                {isSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>

          {/* Its own form: a password change never waits for (or saves) the profile changes above. */}
          <ChangePasswordCard id="password" />
        </div>

        {/* Live preview beside the form on large screens. */}
        <aside className="hidden lg:block" aria-label="Live preview">
          <div className="sticky top-6">
            <p className="mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-ink-subtle uppercase">
              <Eye className="size-4" aria-hidden="true" /> Live preview
            </p>
            <div className="max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-[2rem] pb-2">
              <ProfileView profile={preview} headingAs="h2" showCompletion={false} animate={false} />
            </div>
          </div>
        </aside>
      </div>

      <Modal open={dialog === 'preview'} onClose={() => setDialog(null)} title="Preview" description="How your profile will look once saved." size="lg">
        <ProfileView profile={preview} headingAs="h3" showCompletion={false} animate={false} />
      </Modal>

      <Modal
        open={dialog === 'discard'}
        onClose={() => setDialog(null)}
        title="Discard your changes?"
        description="You have unsaved changes on this page."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={() => navigate(ROUTES.PROFILE)}>
              Discard
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">Photo and cover changes are already saved and won't be undone.</p>
      </Modal>

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
    </PageContainer>
  );
}
