import { ArrowRight } from 'lucide-react';
import { AchievementSearchCard } from '@/components/search/AchievementSearchCard';
import { CommunitySearchCard } from '@/components/search/CommunitySearchCard';
import { OpportunitySearchCard } from '@/components/search/OpportunitySearchCard';
import { PostSearchResult } from '@/components/search/PostSearchResult';
import { ProjectSearchCard } from '@/components/search/ProjectSearchCard';
import { StudentSearchCard } from '@/components/search/StudentSearchCard';
import { Button } from '@/components/ui';
import { SEARCH_TYPE_META, countLabel } from '@/constants/search';

const CARDS = {
  students: (item, headingLevel) => <StudentSearchCard student={item} headingLevel={headingLevel} />,
  projects: (item, headingLevel) => <ProjectSearchCard project={item} headingLevel={headingLevel} />,
  communities: (item, headingLevel) => <CommunitySearchCard community={item} headingLevel={headingLevel} />,
  opportunities: (item, headingLevel) => <OpportunitySearchCard opportunity={item} headingLevel={headingLevel} />,
  achievements: (item, headingLevel) => <AchievementSearchCard achievement={item} headingLevel={headingLevel} />,
  posts: (item, headingLevel) => <PostSearchResult post={item} headingLevel={headingLevel} />,
};

/** Results of one kind: cards in a grid, or posts in a single column like the feed. */
export function SearchResultList({ type, items, headingLevel = 'h3', label }) {
  const render = CARDS[type];
  if (type === 'posts') {
    return (
      <ul className="mx-auto flex max-w-2xl flex-col gap-4" aria-label={label}>
        {items.map((item) => <li key={item.id}>{render(item, headingLevel)}</li>)}
      </ul>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={label}>
      {items.map((item) => <li key={item.id}>{render(item, headingLevel)}</li>)}
    </ul>
  );
}

/** One group in "All" results: heading, how many there are, a few results and "View all" (with filters and sorting). */
export function SearchResultSection({ type, items, total, onViewAll }) {
  const { label, icon: Icon } = SEARCH_TYPE_META[type];
  const titleId = `search-section-${type}`;
  if (!items?.length) return null;

  return (
    <section aria-labelledby={titleId} className="scroll-mt-24" data-search-section={type}>
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-fg" aria-hidden="true">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="font-display text-xl font-bold text-ink">{label}</h2>
          <p className="text-sm text-ink-muted">{countLabel(type, total)}</p>
        </div>
        <Button variant="ghost" size="sm" rightIcon={ArrowRight} onClick={onViewAll} aria-label={`View all ${countLabel(type, total)}`}>
          View all
        </Button>
      </div>
      <SearchResultList type={type} items={items} label={label} />
    </section>
  );
}
