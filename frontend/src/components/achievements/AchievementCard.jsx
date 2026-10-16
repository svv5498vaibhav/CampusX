import { motion } from 'framer-motion';
import { CalendarDays, Medal, Share2 } from 'lucide-react';
import { Link } from 'react-router';
import { AchievementMenu } from '@/components/achievements/AchievementMenu';
import { VerificationBadge } from '@/components/achievements/VerificationBadge';
import { ModerationNotice } from '@/components/safety/ModerationNotice';
import { Avatar, Badge } from '@/components/ui';
import { ACHIEVEMENT_TYPE_ICONS, achievementPath, achievementTypeLabel, achievementUrl, formatDate } from '@/constants/showcase';
import { useAchievementStore } from '@/store/achievementStore';
import { toast } from '@/store/toastStore';
import { getFullName } from '@/utils/string';

/** "My wins": icon, title, type, organization, date, result, verification and skills. */
export function AchievementCard({ achievement, headingLevel = 'h3', showOwner = true }) {
  const options = useAchievementStore((state) => state.options);
  const shareAchievement = useAchievementStore((state) => state.shareAchievement);
  const Icon = ACHIEVEMENT_TYPE_ICONS[achievement.type] ?? ACHIEVEMENT_TYPE_ICONS.other;
  const Heading = headingLevel;
  const where = [achievement.organization, achievement.eventName].filter(Boolean).join(' · ');

  const share = async () => {
    if (await shareAchievement(achievement.id)) toast.success('Achievement link copied!');
    else toast.error(`Couldn't copy automatically. The link is ${achievementUrl(achievement.id)}`);
  };

  return (
    <motion.article
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="flex h-full flex-col glass-card rounded-3xl border border-line bg-surface p-4 shadow-soft"
      data-achievement-id={achievement.id}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-fg">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <Heading className="font-display text-base leading-snug font-bold text-ink">
            <Link to={achievementPath(achievement.id)} className="hover:underline">{achievement.title}</Link>
          </Heading>
          {where && <p className="mt-0.5 truncate text-sm text-ink-muted">{where}</p>}
        </div>
        <AchievementMenu achievement={achievement} />
      </div>

      {achievement.moderation && <ModerationNotice status={achievement.moderation.status} noun="achievement" className="mt-3" />}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant="neutral" className="px-2 py-0.5 text-[11px]">{achievementTypeLabel(options, achievement.type)}</Badge>
        <VerificationBadge status={achievement.verificationStatus} className="px-2 py-0.5 text-[11px]" />
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        {achievement.rank && (
          <div className="inline-flex items-center gap-1"><dt><Medal className="size-3.5" aria-label="Result" /></dt><dd className="font-semibold text-ink">{achievement.rank}</dd></div>
        )}
        <div className="inline-flex items-center gap-1"><dt><CalendarDays className="size-3.5" aria-label="Date" /></dt><dd>{formatDate(achievement.date)}</dd></div>
      </dl>

      {achievement.skills.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1" aria-label="Skills">
          {achievement.skills.slice(0, 4).map((skill) => <li key={skill} className="rounded-md bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-muted">{skill}</li>)}
        </ul>
      )}

      <div className="mt-auto flex items-center gap-2 pt-4">
        {showOwner && achievement.owner && (
          <>
            <Avatar src={achievement.owner.avatarUrl} name={getFullName(achievement.owner)} size="xs" />
            <p className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{getFullName(achievement.owner)}</p>
          </>
        )}
        {!showOwner && <div className="flex-1" />}
        <Link to={achievementPath(achievement.id)} className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary-soft">View</Link>
        <button type="button" onClick={share} aria-label={`Share ${achievement.title}: copy link`} className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink">
          <Share2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    </motion.article>
  );
}
