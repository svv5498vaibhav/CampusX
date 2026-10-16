import { CalendarDays, FileCheck2, Medal } from 'lucide-react';
import { Link } from 'react-router';
import { VerificationBadge } from '@/components/achievements/VerificationBadge';
import { Avatar, Badge, Button } from '@/components/ui';
import { labelOf, searchResultPath } from '@/constants/search';
import { ACHIEVEMENT_TYPE_ICONS, formatDate } from '@/constants/showcase';
import { useSearchStore } from '@/store/searchStore';
import { getFullName } from '@/utils/string';

/**
 * An achievement in search results: title, student, type, organization/event, date and verification.
 * Proof files are never part of search results; only whether proof was attached is shown.
 * Discover adds a recommendation `reason` and a `menu` (both optional).
 */
export function AchievementSearchCard({ achievement, headingLevel = 'h3', reason, menu }) {
  const types = useSearchStore((state) => state.options?.filters.achievementTypes);
  const Heading = headingLevel;
  const Icon = ACHIEVEMENT_TYPE_ICONS[achievement.type] ?? ACHIEVEMENT_TYPE_ICONS.other;
  const path = searchResultPath('achievements', achievement);
  const where = [achievement.organization, achievement.eventName].filter(Boolean).join(' · ');
  const owner = achievement.owner;

  return (
    <article className="flex h-full flex-col glass-card rounded-3xl border border-line bg-surface p-4 shadow-soft transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-lift" data-search-result="achievement" data-achievement-id={achievement.id}>
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-fg" aria-hidden="true">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Heading className="font-display text-base leading-snug font-bold text-ink">
            <Link to={path} className="hover:underline">{achievement.title}</Link>
          </Heading>
          {where && <p className="mt-0.5 truncate text-sm text-ink-muted">{where}</p>}
        </div>
        {menu && <div className="-mt-1.5 -mr-2 shrink-0">{menu}</div>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant="neutral" className="px-2 py-0.5 text-[11px]">{labelOf(types, achievement.type)}</Badge>
        <VerificationBadge status={achievement.verificationStatus} className="px-2 py-0.5 text-[11px]" />
        {achievement.proofCount > 0 && (
          <Badge variant="outline" icon={FileCheck2} className="px-2 py-0.5 text-[11px]">Proof attached</Badge>
        )}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        {achievement.rank && (
          <div className="inline-flex items-center gap-1"><dt><Medal className="size-3.5" aria-label="Result" /></dt><dd className="font-semibold text-ink">{achievement.rank}</dd></div>
        )}
        <div className="inline-flex items-center gap-1"><dt><CalendarDays className="size-3.5" aria-label="Date" /></dt><dd>{formatDate(achievement.date)}</dd></div>
      </dl>

      {reason && <div className="mt-3">{reason}</div>}

      <div className="mt-auto flex items-center gap-2 pt-4">
        {owner && (
          <>
            <Avatar src={owner.avatarUrl} name={getFullName(owner)} size="xs" />
            <p className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{getFullName(owner)}</p>
          </>
        )}
        <Button as={Link} to={path} variant="ghost" size="sm" className="ml-auto" aria-label={`View achievement: ${achievement.title}`}>
          View
        </Button>
      </div>
    </article>
  );
}
