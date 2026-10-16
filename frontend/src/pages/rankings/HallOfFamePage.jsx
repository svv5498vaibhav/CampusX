import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Crown, History, Medal, Timer } from 'lucide-react';
import { Link } from 'react-router';
import { EliteProfileFrame } from '@/components/elite/EliteProfileFrame';
import { EliteRankName } from '@/components/elite/EliteRankName';
import { ReignRow } from '@/components/elite/EliteRankHistory';
import { RankTokenBadge } from '@/components/elite/RankTokenBadge';
import { campusLine } from '@/components/gamification/LeaderboardRow';
import { PageContainer } from '@/components/layout/PageContainer';
import { Avatar, Button, EmptyState, ErrorState } from '@/components/ui';
import { ELITE_TIER_ORDER, ELITE_TIERS, ELITE_TRANSFER_REASONS, formatReign, formatReignDate } from '@/constants/elite';
import { formatPoints } from '@/constants/gamification';
import { profilePath, ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNow } from '@/hooks/useNow';
import { useAuthStore } from '@/store/authStore';
import { useEliteStore } from '@/store/eliteStore';
import { cn } from '@/utils/cn';
import { fadeUp } from '@/utils/motion';
import { getFullName } from '@/utils/string';
import { formatDateTime, formatRelativeTime } from '@/utils/time';

const FORMER = 'A former CampusX student';

/** "just now", "5m ago", "on 12 Sep": when the ranking was last checked. */
function checkedText(value, now) {
  const relative = formatRelativeTime(value, now);
  if (relative === 'now') return 'just now';
  return /^\d+[mhd]$/.test(relative) ? `${relative} ago` : `on ${relative}`;
}

// Gold in the middle and raised from `sm` up (podium order); gold first for phones and screen readers.
const PLACE = { gold: 'sm:order-2 sm:mb-5', silver: 'sm:order-1', bronze: 'sm:order-3' };

/** A student's name linking to their profile, or "A former CampusX student" once the account is gone. */
function StudentName({ student, className }) {
  if (!student) return <span className={cn('text-ink-muted', className)}>{FORMER}</span>;
  return (
    <Link to={profilePath(student.id)} className={cn('font-semibold text-ink hover:underline', className)}>
      {getFullName(student)}
    </Link>
  );
}

/** A small round emblem in the token's colours (transfer history, empty token slots). */
function TokenEmblem({ tierId, className }) {
  const tier = ELITE_TIERS[tierId];
  const Icon = tier.icon;
  return (
    <span className={cn('grid size-9 shrink-0 place-items-center rounded-full shadow-soft', `elite-tier--${tierId}`, className)} style={{ background: 'var(--elite-emblem-bg)', color: 'var(--elite-emblem-ink)' }} aria-hidden="true">
      <Icon className="size-4" strokeWidth={2.3} />
    </span>
  );
}

function HolderCard({ holder, youId, index }) {
  const now = useNow();
  const { tier, student } = holder;
  if (!student) {
    return (
      <motion.li {...fadeUp(index * 0.06)} className={cn('flex flex-col items-center gap-2 rounded-3xl border border-dashed border-line-strong p-5 text-center', PLACE[tier.id])} data-holder-tier={tier.id} data-holder="none">
        <TokenEmblem tierId={tier.id} className="size-14 opacity-70" />
        <p className="font-display text-lg font-bold text-ink">{tier.token}</p>
        <p className="text-sm text-ink-muted">Unclaimed for now: it goes to the student ranked #{tier.rank}.</p>
      </motion.li>
    );
  }
  const name = getFullName(student);
  const eliteRank = student.eliteRank ?? { tier: tier.id };
  return (
    <motion.li
      {...fadeUp(index * 0.06)}
      className={cn('glass-card elite-tier-surface flex flex-col items-center rounded-3xl border border-line bg-surface p-5 text-center shadow-soft', `elite-tier--${tier.id}`, PLACE[tier.id])}
      data-holder-tier={tier.id}
      data-student-id={student.id}
    >
      <EliteProfileFrame eliteRank={eliteRank} size="xl" shape="circle" glow>
        <Avatar src={student.avatarUrl} name={name} size="xl" shape="circle" />
      </EliteProfileFrame>
      <RankTokenBadge eliteRank={eliteRank} variant="full" className="mt-4" />
      <h3 className="mt-2 max-w-full font-display text-lg leading-snug font-bold break-words">
        <Link to={profilePath(student.id)} className="hover:underline">
          <EliteRankName eliteRank={eliteRank} shine>{name}</EliteRankName>
        </Link>
        {student.id === youId && <span className="ml-1.5 text-xs font-bold text-primary">You</span>}
      </h3>
      {campusLine(student) && <p className="max-w-full truncate text-xs text-ink-muted">{campusLine(student)}</p>}
      <dl className="mt-4 grid w-full grid-cols-2 gap-2 text-left">
        <div className="rounded-2xl bg-surface-muted px-3 py-2">
          <dt className="text-[11px] font-semibold text-ink-muted">Holding for</dt>
          <dd className="font-display text-sm font-bold text-ink">{formatReign(now - new Date(holder.since).getTime())}</dd>
        </div>
        <div className="rounded-2xl bg-surface-muted px-3 py-2">
          <dt className="text-[11px] font-semibold text-ink-muted">Total XP</dt>
          <dd className="font-display text-sm font-bold text-ink">{formatPoints(holder.points)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-ink-muted">
        Since {formatReignDate(holder.since)} · in the top three {holder.topThreeEntries} time{holder.topThreeEntries === 1 ? '' : 's'}
      </p>
    </motion.li>
  );
}

/** Previous holders of one token at a time (tabs; arrow keys move between them). */
function TokenHistory({ hall }) {
  const [tab, setTab] = useState('gold');
  const refs = useRef({});
  const reigns = hall.previousHolders?.[tab] ?? [];
  const onKeyDown = (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = ELITE_TIER_ORDER[(ELITE_TIER_ORDER.indexOf(tab) + step + ELITE_TIER_ORDER.length) % ELITE_TIER_ORDER.length];
    setTab(next);
    refs.current[next]?.focus();
  };
  return (
    <section aria-labelledby="previous-holders-title" className="glass-card min-w-0 rounded-3xl border border-line bg-surface p-5 shadow-soft">
      <h2 id="previous-holders-title" className="flex items-center gap-2 font-display text-lg font-bold text-ink">
        <History className="size-5 text-primary" aria-hidden="true" /> Previous holders
      </h2>
      <div role="tablist" aria-label="Token" onKeyDown={onKeyDown} className="mt-3 flex w-fit gap-1 rounded-xl bg-surface-muted p-1">
        {ELITE_TIER_ORDER.map((id) => (
          <button
            key={id}
            ref={(node) => {
              refs.current[id] = node;
            }}
            type="button"
            role="tab"
            id={`token-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="token-panel"
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors', tab === id ? 'bg-surface text-ink shadow-soft' : 'text-ink-muted hover:text-ink')}
          >
            {ELITE_TIERS[id].short}
          </button>
        ))}
      </div>
      <div id="token-panel" role="tabpanel" aria-labelledby={`token-tab-${tab}`} className="mt-3">
        {reigns.length ? (
          <ol className="flex flex-col gap-2">
            {reigns.map((reign) => (
              <ReignRow key={reign.id} reign={reign}>
                <StudentName student={reign.student} className="min-w-0 truncate text-sm" />
              </ReignRow>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-muted">Nobody has passed on the {ELITE_TIERS[tab].token} yet: its story starts with the current holder.</p>
        )}
      </div>
    </section>
  );
}

function Records({ hall }) {
  const longest = hall.records?.longestGoldReign;
  const most = hall.records?.mostTopThreeEntries ?? [];
  return (
    <section aria-labelledby="records-title" className="glass-card min-w-0 rounded-3xl border border-line bg-surface p-5 shadow-soft">
      <h2 id="records-title" className="flex items-center gap-2 font-display text-lg font-bold text-ink">
        <Medal className="size-5 text-primary" aria-hidden="true" /> Records
      </h2>
      <div className="elite-tier--gold elite-tier-surface mt-3 rounded-2xl border border-line p-4">
        <p className="flex items-center gap-1.5 text-xs font-bold text-ink-muted">
          <Timer className="size-3.5" aria-hidden="true" /> Longest Gold reign
        </p>
        {longest ? (
          <>
            <p className="mt-1 font-display text-2xl font-bold text-ink">{formatReign(longest.durationMs)}</p>
            <p className="mt-0.5 text-sm text-ink-muted">
              <StudentName student={longest.student} /> · {formatReignDate(longest.startedAt)} – {longest.current ? 'still reigning' : formatReignDate(longest.endedAt)}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">The Golden Token hasn’t been claimed yet.</p>
        )}
      </div>
      <h3 className="mt-4 text-xs font-bold text-ink-muted">Most times in the top three</h3>
      {most.length ? (
        <ol className="mt-2 flex flex-col gap-1.5">
          {most.map((row, index) => (
            <li key={row.student.id} className="flex items-center gap-2.5" data-record-student={row.student.id}>
              <span className="w-5 text-right font-display text-sm font-bold text-ink-muted">{index + 1}</span>
              <Avatar src={row.student.avatarUrl} name={getFullName(row.student)} size="sm" shape="circle" />
              <StudentName student={row.student} className="min-w-0 flex-1 truncate text-sm" />
              <span className="font-display text-sm font-bold text-ink">{row.entries}×</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-1 text-sm text-ink-muted">No entries yet.</p>
      )}
      <p className="mt-4 text-xs text-ink-muted">
        {hall.totals.holders} student{hall.totals.holders === 1 ? '' : 's'} have held a token · {hall.totals.transfers} token change{hall.totals.transfers === 1 ? '' : 's'}
      </p>
    </section>
  );
}

/** "The Golden Token passed from A to B." in words, for one transfer. */
function TransferSentence({ row }) {
  const token = ELITE_TIERS[row.tier].token;
  if (!row.from) return <>{row.to ? <StudentName student={row.to.student} /> : FORMER} claimed the {token}.</>;
  if (!row.to) return <>The {token} became unclaimed after <StudentName student={row.from.student} />.</>;
  return (
    <>
      The {token} passed from <StudentName student={row.from.student} /> to <StudentName student={row.to.student} />.
    </>
  );
}

function Transfers({ hall, loadingMore, onMore }) {
  return (
    <section aria-labelledby="transfers-title" className="mt-6">
      <h2 id="transfers-title" className="font-display text-lg font-bold text-ink">Token history</h2>
      {hall.transfers.length ? (
        <ol className="mt-3 flex flex-col gap-2">
          {hall.transfers.map((row) => (
            <li key={row.id} className="glass-card flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3" data-transfer-tier={row.tier}>
              <TokenEmblem tierId={row.tier} />
              <div className="min-w-0 flex-1">
                <p className="text-sm break-words text-ink">
                  <TransferSentence row={row} />
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  <time dateTime={row.at} title={formatDateTime(row.at)}>{formatDateTime(row.at)}</time> · {ELITE_TRANSFER_REASONS[row.reason] ?? 'Ranking change'}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">No token has changed hands yet.</p>
      )}
      {hall.pagination?.hasMore && (
        <div className="mt-3 flex justify-center">
          <Button variant="outline" loading={loadingMore} onClick={onMore}>Show older changes</Button>
        </div>
      )}
    </section>
  );
}

function HallSkeleton() {
  return (
    <div role="status" aria-label="Loading the Hall of Fame" className="mt-6 grid gap-3 sm:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex animate-pulse flex-col items-center gap-3 rounded-3xl border border-line bg-surface p-5">
          <span className="size-20 rounded-full bg-surface-muted" />
          <span className="h-4 w-28 rounded bg-surface-muted" />
          <span className="h-3 w-20 rounded bg-surface-muted" />
        </div>
      ))}
    </div>
  );
}

/**
 * /rankings/hall-of-fame: who holds the Golden, Silver and Bronze tokens now, who held them before (when they
 * gained and lost them), the records and every change of hands. Everything comes from the server's ranking
 * snapshots; "elite:updated" refreshes the page live.
 */
export default function HallOfFamePage() {
  useDocumentTitle('Hall of Fame');
  const now = useNow();
  const userId = useAuthStore((state) => state.user?.id);
  const hall = useEliteStore((state) => state.hall);
  const status = useEliteStore((state) => state.hallStatus);
  const error = useEliteStore((state) => state.hallError);
  const loadingMore = useEliteStore((state) => state.loadingMore);
  const { forViewer, fetchHall, loadMoreTransfers } = useEliteStore.getState();

  useEffect(() => {
    forViewer(userId);
    fetchHall();
  }, [userId]);

  const empty = hall && hall.holders.every((holder) => !holder.student) && !hall.transfers.length;

  return (
    <PageContainer width="wide">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-ink sm:text-3xl">
            <Crown className="size-7 shrink-0 text-primary" aria-hidden="true" /> CampusX Hall of Fame
          </h1>
          <p className="mt-1 max-w-2xl text-ink-muted">The Golden, Silver and Bronze tokens belong to the top three of the CampusX all-time ranking. They move by themselves as ranks change, and every holder is remembered here.</p>
        </div>
        <Button as={Link} to={ROUTES.RANKINGS} variant="outline" size="sm" leftIcon={ArrowLeft}>Campus Rankings</Button>
      </header>

      {!hall && status !== 'error' && <HallSkeleton />}
      {!hall && status === 'error' && <ErrorState className="mt-6" title="We couldn't load the Hall of Fame" description={error} onRetry={fetchHall} />}
      {empty && (
        <EmptyState
          icon={Crown}
          title="The first tokens are on their way"
          description="Gold, Silver and Bronze go to the top three of the CampusX ranking as soon as students earn XP."
          action={<Button as={Link} to={ROUTES.RANKINGS}>See the rankings</Button>}
          className="mt-6 rounded-3xl border border-dashed border-line-strong"
        />
      )}
      {hall && !empty && (
        <>
          <section aria-labelledby="holders-title" className="mt-6">
            <h2 id="holders-title" className="sr-only">Current token holders</h2>
            <ol className="grid gap-3 sm:grid-cols-3 sm:items-end sm:pt-5">
              {hall.holders.map((holder, index) => <HolderCard key={holder.tier.id} holder={holder} youId={userId} index={index} />)}
            </ol>
            {hall.updatedAt && (
              <p className="mt-3 text-xs text-ink-muted">
                Ranking checked {checkedText(hall.updatedAt, now)} · the tokens follow every change of the top three
              </p>
            )}
          </section>
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <TokenHistory hall={hall} />
            <Records hall={hall} />
          </div>
          <Transfers hall={hall} loadingMore={loadingMore} onMore={loadMoreTransfers} />
        </>
      )}
    </PageContainer>
  );
}
