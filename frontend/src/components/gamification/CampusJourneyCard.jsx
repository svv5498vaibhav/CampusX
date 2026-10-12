import { useEffect } from 'react';
import { ChevronRight, Flame, Sprout, TrendingUp, Trophy } from 'lucide-react';
import { Link } from 'react-router';
import { LevelProgress } from '@/components/gamification/LevelProgress';
import { ProfileSection } from '@/components/profile/ProfileSection';
import { formatPoints } from '@/constants/gamification';
import { ROUTES } from '@/constants/routes';
import { useAuthStore } from '@/store/authStore';
import { useGamificationStore } from '@/store/gamificationStore';
import { useRankingStore } from '@/store/rankingStore';

/** The owner's level, XP, badges, streak and campus rank on their profile, styled with their profile theme. */
export function CampusJourneyCard({ theme, headingAs = 'h2' }) {
  const userId = useAuthStore((state) => state.user?.id);
  const profile = useGamificationStore((state) => state.profile);
  const myRanks = useRankingStore((state) => state.myRanks);

  useEffect(() => {
    useGamificationStore.getState().forViewer(userId);
    useRankingStore.getState().forViewer(userId);
    useGamificationStore.getState().fetchProfile();
    useRankingStore.getState().fetchMyRanks();
  }, [userId]);

  const stats = profile && [
    { icon: Trophy, text: `${profile.badges.earnedCount} ${profile.badges.earnedCount === 1 ? 'Badge' : 'Badges'}` },
    { icon: Flame, text: `${profile.streak.current} Day Streak` },
    { icon: TrendingUp, text: myRanks?.ranks.overall.rank ? `#${myRanks.ranks.overall.rank} Campus Rank` : 'Not ranked yet' },
  ];

  return (
    <ProfileSection
      icon={Sprout}
      title="Campus Journey"
      theme={theme}
      headingAs={headingAs}
      action={<Link to={ROUTES.RANKINGS} className="inline-flex items-center gap-0.5 text-sm font-semibold text-primary hover:underline">View full ranking <ChevronRight className="size-4" aria-hidden="true" /></Link>}
    >
      {profile ? (
        <div>
          <p className="font-display text-2xl font-bold text-ink">Level {profile.level.level} <span className="text-base font-semibold text-ink-muted">· {profile.level.name}</span></p>
          <p className="text-sm font-semibold text-ink-muted">{formatPoints(profile.totalPoints)} XP</p>
          <LevelProgress level={profile.level} compact className="mt-2" />
          <ul className="mt-3 flex flex-col gap-1.5 text-sm text-ink">
            {stats.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2"><Icon className="size-4 text-primary" aria-hidden="true" /> {text}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Loading your journey…</p>
      )}
    </ProfileSection>
  );
}
