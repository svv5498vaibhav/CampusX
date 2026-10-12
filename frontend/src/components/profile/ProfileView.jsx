import { motion } from 'framer-motion';
import { FolderKanban, Sparkles, Trophy, UserRound, Wrench } from 'lucide-react';
import { Link } from 'react-router';
import { themeStyles } from '@/constants/profileThemes';
import { ROUTES } from '@/constants/routes';
import { ProfileCompletionCard } from './ProfileCompletionCard';
import { ProfileHeader } from './ProfileHeader';
import { ProfileAchievements, ProfileProjects } from './ProfileShowcase';
import { ProfileSection, TagList } from './ProfileSection';

const EmptyNote = ({ children, action }) => (
  <div className="flex flex-col items-start gap-3">
    <p className="text-sm leading-relaxed text-ink-muted">{children}</p>
    {action}
  </div>
);

const editLink = (hash, label) => (
  <Link to={`${ROUTES.PROFILE_EDIT}#${hash}`} className="text-sm font-semibold text-primary hover:underline">
    {label}
  </Link>
);

/**
 * A student's digital campus identity: header card plus About / Skills / Interests /
 * Things I've Built / My Wins, styled by their chosen theme. Used for the owner's profile, other
 * students' profiles and the live preview while editing.
 *
 * Responds to its own width (container queries): two columns when wide, one stacked column when
 * narrow, so it looks right on a phone and in the editor's preview panel alike. Document order is
 * the reading order everywhere (completeness, main sections, skills, interests), so screen readers
 * and keyboard focus follow what's on screen; the wide layout only places those blocks in columns.
 */
export function ProfileView({
  profile,
  isOwner = false,
  actions,
  onChangePhoto,
  onChangeCover,
  onCompletionAction,
  headingAs = 'h1',
  showCompletion = isOwner,
  animate = true,
  // Optional block at the top of the side column (the owner's Campus Journey); gets the profile theme.
  renderAside,
  // Optional full-width block right under the header (the owner's Semester Roadmap entry).
  banner,
}) {
  const theme = themeStyles(profile.theme);
  const sectionHeading = headingAs === 'h1' ? 'h2' : 'h3';
  const firstName = profile.firstName;

  const main = {
    about: (
      <ProfileSection icon={UserRound} title="About" theme={theme} headingAs={sectionHeading} action={isOwner && profile.bio ? editLink('about', 'Edit') : null}>
        {profile.bio ? (
          <p className="text-[15px] leading-relaxed break-words whitespace-pre-line text-ink">{profile.bio}</p>
        ) : isOwner ? (
          <EmptyNote action={editLink('about', 'Add a bio')}>Tell your campus who you are: what you study, what you build, what you’re curious about.</EmptyNote>
        ) : (
          <EmptyNote>{firstName} hasn’t written a bio yet.</EmptyNote>
        )}
      </ProfileSection>
    ),
    // Loaded by reference from the projects/achievements APIs, which apply each item's visibility.
    projects: (
      <ProfileSection icon={FolderKanban} title={isOwner ? 'Things I’ve Built' : `Things ${firstName} built`} theme={theme} headingAs={sectionHeading} action={isOwner ? <Link to={ROUTES.PROJECT_CREATE} className="text-sm font-semibold text-primary hover:underline">Add</Link> : null}>
        <ProfileProjects userId={profile.id} isOwner={isOwner} />
      </ProfileSection>
    ),
    achievements: (
      <ProfileSection icon={Trophy} title={isOwner ? 'My Wins' : `${firstName}’s wins`} theme={theme} headingAs={sectionHeading} action={isOwner ? <Link to={ROUTES.ACHIEVEMENT_CREATE} className="text-sm font-semibold text-primary hover:underline">Add</Link> : null}>
        <ProfileAchievements userId={profile.id} isOwner={isOwner} />
      </ProfileSection>
    ),
  };

  const completion = showCompletion && profile.completion;

  return (
    <motion.div
      className="@container"
      initial={animate ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <ProfileHeader
        profile={profile}
        theme={theme}
        isOwner={isOwner}
        onChangePhoto={onChangePhoto}
        onChangeCover={onChangeCover}
        actions={actions}
        headingAs={headingAs}
      />

      {banner && <div className="mt-6">{banner}</div>}

      {/*
        Wide: main sections on the left (spanning both rows); completeness top-right, skills and
        interests below it. Narrow: the same blocks stacked in document order.
      */}
      <div className="mt-6 flex flex-col gap-6 @3xl:grid @3xl:grid-cols-[minmax(0,1fr)_18rem] @3xl:grid-rows-[auto_1fr] @3xl:items-start">
        {completion && (
          <div className="@3xl:col-start-2 @3xl:row-start-1">
            <ProfileCompletionCard completion={profile.completion} theme={theme} onAction={onCompletionAction} />
          </div>
        )}

        <div className="flex flex-col gap-6 @3xl:col-start-1 @3xl:row-span-2 @3xl:row-start-1">
          {theme.mainOrder.map((key) => (
            <div key={key}>{main[key]}</div>
          ))}
        </div>

        <div className={completion ? 'flex flex-col gap-6 @3xl:col-start-2 @3xl:row-start-2' : 'flex flex-col gap-6 @3xl:col-start-2 @3xl:row-span-2 @3xl:row-start-1'}>
          {renderAside?.(theme, sectionHeading)}
          <ProfileSection icon={Wrench} title="Skills" theme={theme} headingAs={sectionHeading}>
            {profile.skills.length > 0 ? (
              <TagList items={profile.skills} theme={theme} />
            ) : (
              <EmptyNote action={isOwner ? editLink('skills', 'Add skills') : null}>
                {isOwner ? 'Show what you’re good at.' : 'No skills added yet.'}
              </EmptyNote>
            )}
          </ProfileSection>
          <ProfileSection icon={Sparkles} title="Interests" theme={theme} headingAs={sectionHeading}>
            {profile.interests.length > 0 ? (
              <TagList items={profile.interests.map((interest) => interest.name)} theme={theme} />
            ) : (
              <EmptyNote>No interests added yet.</EmptyNote>
            )}
          </ProfileSection>
        </div>
      </div>
    </motion.div>
  );
}
