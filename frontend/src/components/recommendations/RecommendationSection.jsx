import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { useRecommendationStore } from '@/store/recommendationStore';
import { cn } from '@/utils/cn';

/**
 * One section of recommendations: a heading, an optional "See all" link and the cards.
 *   layout="row"   a horizontal, snap-scrolling row (compact on phones; arrow buttons on wider screens)
 *   layout="grid"  a responsive grid (one column on phones)
 *   layout="list"  a vertical list (posts)
 * Cards leave smoothly when a student says "Not interested". Shown items are reported once per page
 * load for the server's light analytics.
 */
export function RecommendationSection({ title, description, icon: Icon, items, renderItem, seeAll, seeAllLabel = 'See all', layout = 'row', headingAs: Heading = 'h2', className, children }) {
  const headingId = useId();
  const rowRef = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const ids = items.map((item) => item.id).join(',');

  useEffect(() => {
    if (items.length) useRecommendationStore.getState().recordImpressions(items);
  }, [ids]);

  // Arrow buttons only when the row can scroll that way.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || layout !== 'row') return undefined;
    const update = () => setEdges({ start: row.scrollLeft <= 4, end: row.scrollLeft + row.clientWidth >= row.scrollWidth - 4 });
    update();
    row.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      row.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [layout, ids]);

  const scrollBy = (direction) => rowRef.current?.scrollBy({ left: direction * rowRef.current.clientWidth * 0.85, behavior: 'smooth' });

  // `relative`: absolutely positioned bits inside the cards (screen-reader text, menus) stay inside the
  // scrolling row instead of widening the page.
  const listClass = {
    row: 'relative -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pt-1 pb-3 sm:mx-0 sm:scroll-px-0 sm:px-0',
    grid: 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3',
    list: 'flex flex-col gap-4',
  }[layout];
  const itemClass = { row: 'w-[80%] max-w-[19rem] shrink-0 snap-start sm:w-72', grid: 'min-w-0', list: 'min-w-0' }[layout];

  return (
    <section aria-labelledby={headingId} className={cn('min-w-0', className)}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <Heading id={headingId} className="flex items-center gap-2 font-display text-lg font-bold text-ink">
            {Icon && <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />}
            {title}
          </Heading>
          {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {layout === 'row' && items.length > 1 && (
            <span className="hidden gap-1 sm:flex">
              <button type="button" onClick={() => scrollBy(-1)} disabled={edges.start} aria-label={`Previous: ${title}`} className="grid size-8 place-items-center rounded-xl border border-line text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent">
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => scrollBy(1)} disabled={edges.end} aria-label={`More: ${title}`} className="grid size-8 place-items-center rounded-xl border border-line text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent">
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </span>
          )}
          {seeAll && (
            <Link to={seeAll} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm font-semibold text-primary hover:underline" aria-label={`${seeAllLabel}: ${title}`}>
              {seeAllLabel} <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>

      {children}

      <ul ref={rowRef} className={listClass} aria-label={title}>
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.li
              key={`${item.recommendationType}:${item.id}`}
              layout="position"
              className={itemClass}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.18 } }}
            >
              {renderItem(item)}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
