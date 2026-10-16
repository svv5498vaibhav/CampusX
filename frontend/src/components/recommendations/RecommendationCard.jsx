import { EyeOff } from 'lucide-react';
import { Link } from 'react-router';
import { PostMenu } from '@/components/feed/PostMenu';
import { EliteProfileFrame } from '@/components/elite/EliteProfileFrame';
import { EliteRankName } from '@/components/elite/EliteRankName';
import { Avatar, Button } from '@/components/ui';
import { memberCountLabel } from '@/constants/communities';
import { formatDay } from '@/constants/opportunities';
import { RECOMMENDATION_META, RECOMMENDATION_TYPES, recommendationPath } from '@/constants/recommendations';
import { useRecommendationStore } from '@/store/recommendationStore';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';
import { getFullName } from '@/utils/string';
import { RecommendationReason } from './RecommendationReason';

const T = RECOMMENDATION_TYPES;

/** What a recommended item is called, and one short line under it. */
export function describeRecommendation(item) {
  switch (item.recommendationType) {
    case T.OPPORTUNITIES:
      return { title: item.title, subtitle: [item.organizer, item.applicationDeadline && `Apply by ${formatDay(item.applicationDeadline)}`].filter(Boolean).join(' · ') };
    case T.PROJECTS:
      return { title: item.title, subtitle: (item.techStack ?? []).slice(0, 3).join(' · ') };
    case T.COMMUNITIES:
      return { title: item.name, subtitle: memberCountLabel(item.memberCount ?? 0) };
    case T.STUDENTS:
      return { title: getFullName(item), subtitle: [item.branch?.shortName, item.semester?.label, item.college?.shortName ?? item.college?.name].filter(Boolean).join(' • ') };
    case T.ACHIEVEMENTS:
      return { title: item.title, subtitle: [item.organization, item.eventName].filter(Boolean).join(' · ') };
    case T.POSTS:
      return item.anonymous
        ? { title: item.title, subtitle: 'Anonymous Zone' }
        : { title: (item.content ?? '').length > 90 ? `${item.content.slice(0, 90).trimEnd()}…` : item.content || 'Campus post', subtitle: item.author ? getFullName(item.author) : '' };
    default:
      return { title: item.title ?? item.name ?? '', subtitle: '' };
  }
}

/** "Not interested" for one recommendation: the card goes away at once; the server keeps it hidden. */
export function useDismissRecommendation() {
  return async (item) => {
    try {
      await useRecommendationStore.getState().dismissRecommendation(item.recommendationType, item.id);
      toast.success("Got it. You'll see less like this.");
    } catch (error) {
      toast.error(error.message || "We couldn't update your recommendations. Please try again.");
    }
  };
}

/** The quiet ⋮ menu on a recommendation (one item: "Not interested"). */
export function NotInterestedMenu({ item, title }) {
  const dismiss = useDismissRecommendation();
  return <PostMenu label={`Recommendation options: ${title}`} items={[{ id: 'not-interested', label: 'Not interested', icon: EyeOff, onSelect: () => dismiss(item) }]} />;
}

/** Records that a recommendation was opened when any link inside it is followed. */
export function RecommendationLink({ item, className, children }) {
  const onClickCapture = (event) => {
    if (event.target.closest?.('a[href]')) useRecommendationStore.getState().recordClick(item.recommendationType, item.id);
  };
  return (
    <div className={cn('h-full', className)} onClickCapture={onClickCapture} data-recommendation={item.recommendationType} data-recommendation-id={item.id}>
      {children}
    </div>
  );
}

/**
 * A compact recommendation of any kind: what it is, why it's recommended, and one action. Used where
 * kinds are mixed ("Recommended for you").
 */
export function RecommendationCard({ item, headingLevel = 'h3', className }) {
  const meta = RECOMMENDATION_META[item.recommendationType] ?? RECOMMENDATION_META.forYou;
  const Icon = meta.icon;
  const Heading = headingLevel;
  const path = recommendationPath(item);
  const { title, subtitle } = describeRecommendation(item);

  return (
    <RecommendationLink item={item}>
      <div className={cn('flex h-full flex-col glass-card rounded-3xl border border-line bg-surface p-4 shadow-soft transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-lift', className)}>
        <div className="flex items-start gap-3">
          {item.recommendationType === T.STUDENTS ? (
            <EliteProfileFrame eliteRank={item.eliteRank} size="md" shape="circle">
              <Avatar src={item.avatarUrl} name={title} size="md" shape="circle" />
            </EliteProfileFrame>
          ) : (
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary-soft-fg" aria-hidden="true">
              <Icon className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-wide text-primary uppercase">{item.anonymous ? 'Anonymous discussion' : meta.kind}</p>
            <Heading className="mt-0.5 line-clamp-2 font-display text-[15px] leading-snug font-bold break-words text-ink">
              <Link to={path} className="hover:underline">
                {item.recommendationType === T.STUDENTS ? <EliteRankName eliteRank={item.eliteRank}>{title}</EliteRankName> : title}
              </Link>
            </Heading>
            {subtitle && <p className="mt-0.5 truncate text-xs text-ink-muted">{subtitle}</p>}
          </div>
          <div className="-mt-1 -mr-1 shrink-0">
            <NotInterestedMenu item={item} title={title} />
          </div>
        </div>
        <RecommendationReason reasons={item.reasons} compact className="mt-3" />
        <div className="mt-auto pt-3">
          <Button as={Link} to={path} variant="outline" size="sm" fullWidth aria-label={`${meta.action}: ${title}`}>
            {meta.action}
          </Button>
        </div>
      </div>
    </RecommendationLink>
  );
}
