import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, UserRoundSearch, UsersRound } from 'lucide-react';
import { Link } from 'react-router';
import { EliteProfileFrame } from '@/components/elite/EliteProfileFrame';
import { EliteRankName } from '@/components/elite/EliteRankName';
import { RankTokenBadge } from '@/components/elite/RankTokenBadge';
import { Avatar, Badge, Button, EmptyState, ErrorState, Input, Modal } from '@/components/ui';
import { profilePath, ROUTES } from '@/constants/routes';
import { followApi } from '@/services/socialApi';
import { useFollowStore } from '@/store/followStore';
import { cn } from '@/utils/cn';
import { getFullName } from '@/utils/string';
import { AnimatedCount } from './AnimatedCount';
import { FollowButton } from './FollowButton';

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;
const TABS = [
  { id: 'followers', label: 'Followers', countKey: 'followersCount' },
  { id: 'following', label: 'Following', countKey: 'followingCount' },
];
const EMPTY = { students: [], status: 'idle', hasMore: false, error: '', moreError: '' };

function RowSkeleton() {
  return (
    <li className="flex items-center gap-3 py-2.5" aria-hidden="true">
      <span className="size-10 shrink-0 animate-pulse rounded-full bg-surface-muted" />
      <span className="flex-1 space-y-2">
        <span className="block h-3.5 w-2/5 animate-pulse rounded bg-surface-muted" />
        <span className="block h-3 w-3/5 animate-pulse rounded bg-surface-muted" />
      </span>
      <span className="h-9 w-28 animate-pulse rounded-xl bg-surface-muted" />
    </li>
  );
}

function StudentRow({ student, index, onNavigate }) {
  const name = getFullName(student);
  const path = student.isYou ? ROUTES.PROFILE : profilePath(student.id);
  const campus = [[student.branch?.shortName, student.semester?.label].filter(Boolean).join(' · '), student.college?.shortName].filter(Boolean).join(' · ');
  return (
    <motion.li
      className="flex items-center gap-3 py-2.5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      // A short stagger for what's first on screen only; later rows (next pages) just appear.
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1], delay: index < 10 ? index * 0.03 : 0 }}
      data-student-id={student.id}
    >
      <Link to={path} onClick={onNavigate} tabIndex={-1} aria-hidden="true" className="shrink-0 rounded-full">
        <EliteProfileFrame eliteRank={student.eliteRank} size="md" shape="circle">
          <Avatar src={student.avatarUrl} name={name} size="md" shape="circle" />
        </EliteProfileFrame>
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link to={path} onClick={onNavigate} className="truncate text-sm font-semibold text-ink hover:underline">
            <EliteRankName eliteRank={student.eliteRank}>{name}</EliteRankName>
          </Link>
          <RankTokenBadge eliteRank={student.eliteRank} variant="icon" />
        </div>
        {campus && <p className="truncate text-xs text-ink-muted" title={student.college?.name}>{campus}</p>}
      </div>
      {student.isYou ? <Badge variant="primary">You</Badge> : <FollowButton userId={student.id} name={name} size="sm" />}
    </motion.li>
  );
}

/**
 * A student's followers and the students they follow, in one dialog with two tabs. Opens with a soft slide-up
 * (the shared Modal), rows come in with a short stagger. Pages of 20 load as the list scrolls (or with "Show
 * more"); a request for a list that's no longer shown (another tab, profile or search) is cancelled, so a slow
 * answer can never replace a newer one. Search matches the start of first or last names, on the server.
 */
export function FollowListModal({ userId, name, kind, onKindChange, onClose }) {
  const open = TABS.some((tab) => tab.id === kind);
  const counts = useFollowStore((state) => state.counts[userId]);
  const seedStudents = useFollowStore((state) => state.seedStudents);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [list, setList] = useState(EMPTY);
  const cursorRef = useRef(null);
  const requestRef = useRef(null);
  const sentinelRef = useRef(null);
  const baseId = useId();

  // Typing settles before searching.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async ({ more = false } = {}) => {
      if (!open) return;
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      if (!more) cursorRef.current = null;
      setList((current) => (more ? { ...current, status: 'loading-more', moreError: '' } : { ...EMPTY, status: 'loading' }));
      try {
        const result = await followApi.list(userId, kind, { cursor: more ? cursorRef.current : undefined, search: query, limit: PAGE_SIZE }, { signal: controller.signal });
        if (controller.signal.aborted) return;
        seedStudents(result.students);
        cursorRef.current = result.pagination.nextCursor;
        setList((current) => ({
          students: more ? [...current.students, ...result.students.filter((student) => !current.students.some((shown) => shown.id === student.id))] : result.students,
          status: 'ready',
          hasMore: result.pagination.hasMore,
          error: '',
          moreError: '',
        }));
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'CanceledError') return;
        setList((current) => (more ? { ...current, status: 'ready', moreError: error.message } : { ...EMPTY, status: 'error', error: error.message }));
      }
    },
    [open, userId, kind, query, seedStudents],
  );

  useEffect(() => {
    if (open) load();
    return () => requestRef.current?.abort();
  }, [load, open]);

  // A new tab or profile starts with an empty search.
  useEffect(() => {
    setSearch('');
    setQuery('');
  }, [userId, kind]);

  // Infinite scroll: the next page loads when the end of the list comes into view.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || list.status !== 'ready' || !list.hasMore || list.moreError) return undefined;
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && load({ more: true }), { rootMargin: '120px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [list.status, list.hasMore, list.moreError, load]);

  const onTabKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = TABS.findIndex((tab) => tab.id === kind);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    onKindChange(TABS[next].id);
    document.getElementById(`${baseId}-tab-${TABS[next].id}`)?.focus();
  };

  const activeTab = TABS.find((tab) => tab.id === kind) ?? TABS[0];
  const emptyText =
    kind === 'followers'
      ? { title: 'No followers yet', description: `When students follow ${name}, they'll show up here.` }
      : { title: 'Not following anyone yet', description: `Students ${name} follows will show up here.` };

  return (
    <Modal open={open} onClose={onClose} title={name} description="Followers and following" size="md">
      <div role="tablist" aria-label={`${name}'s connections`} className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-muted p-1" onKeyDown={onTabKeyDown}>
        {TABS.map((tab) => {
          const selected = tab.id === activeTab.id;
          return (
            <button
              key={tab.id}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onKindChange(tab.id)}
              className={cn(
                'relative isolate flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors',
                selected ? 'text-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              {selected && <motion.span layoutId={`${baseId}-tab`} className="absolute inset-0 -z-10 rounded-xl bg-surface shadow-soft" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
              {tab.label}
              {counts && <AnimatedCount value={counts[tab.countKey]} className="text-ink-muted" />}
            </button>
          );
        })}
      </div>

      <Input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={`Search ${activeTab.label.toLowerCase()} by name`}
        aria-label={`Search ${activeTab.label.toLowerCase()} by name`}
        leftIcon={Search}
        maxLength={60}
        containerClassName="mt-4"
      />

      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${activeTab.id}`} aria-busy={list.status === 'loading' || undefined} className="mt-2 min-h-64">
        {list.status === 'loading' && (
          <ul className="divide-y divide-line">
            {Array.from({ length: 6 }, (_, index) => (
              <RowSkeleton key={index} />
            ))}
          </ul>
        )}

        {list.status === 'error' && <ErrorState title="We couldn't load this list" description={list.error} onRetry={() => load()} className="py-8" />}

        {['ready', 'loading-more'].includes(list.status) && list.students.length === 0 && (
          query ? (
            <EmptyState icon={UserRoundSearch} title="No one matches that name" description={`Nobody in ${name}'s ${activeTab.label.toLowerCase()} list starts with “${query}”.`} className="py-8" />
          ) : (
            <EmptyState icon={UsersRound} title={emptyText.title} description={emptyText.description} className="py-8" />
          )
        )}

        {list.students.length > 0 && (
          <ul className="divide-y divide-line" aria-label={activeTab.label}>
            {list.students.map((student, index) => (
              <StudentRow key={student.id} student={student} index={index} onNavigate={onClose} />
            ))}
          </ul>
        )}

        {list.status === 'loading-more' && (
          <ul className="divide-y divide-line">
            <RowSkeleton />
            <RowSkeleton />
          </ul>
        )}
        {list.moreError && (
          <div className="flex flex-col items-center gap-2 py-4 text-center" role="alert">
            <p className="text-sm text-danger-fg">{list.moreError}</p>
            <Button variant="outline" size="sm" onClick={() => load({ more: true })}>
              Try again
            </Button>
          </div>
        )}
        {list.status === 'ready' && list.hasMore && !list.moreError && (
          <div ref={sentinelRef} className="flex justify-center py-3">
            <Button variant="ghost" size="sm" onClick={() => load({ more: true })}>
              Show more
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
