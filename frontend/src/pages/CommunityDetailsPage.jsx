import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Lock, MessagesSquare, SearchX } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { CommunityAbout } from '@/components/communities/CommunityAbout';
import { CommunityCard } from '@/components/communities/CommunityCard';
import { CommunityHeader } from '@/components/communities/CommunityHeader';
import { CommunityJoinButton } from '@/components/communities/CommunityJoinButton';
import { CommunityMembers } from '@/components/communities/CommunityMembers';
import { EditCommunityModal } from '@/components/communities/EditCommunityModal';
import { CreatePost } from '@/components/feed/CreatePost';
import { PostCard } from '@/components/feed/PostCard';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button, Card, EmptyState, ErrorState, Loader } from '@/components/ui';
import { communityPath, ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import { useFeedStore } from '@/store/feedStore';
import { cn } from '@/utils/cn';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'posts', label: 'Posts' },
  { id: 'members', label: 'Members' },
  { id: 'about', label: 'About' },
];

/** The community's posts: the Phase 5 feed, scoped to this community (members only). */
function CommunityPosts({ community, limit }) {
  const posts = useFeedStore((state) => state.posts);
  const loading = useFeedStore((state) => state.loading);
  const loadingMore = useFeedStore((state) => state.loadingMore);
  const error = useFeedStore((state) => state.error);
  const hasMore = useFeedStore((state) => state.hasMore);
  const feedCommunity = useFeedStore((state) => state.communityId);
  const { fetchPosts, loadMore } = useFeedStore.getState();
  const isMember = community.membership?.status === 'active';

  useEffect(() => {
    if (isMember) fetchPosts('all', { communityId: community.id });
  }, [community.id, isMember, fetchPosts]);

  if (!isMember) {
    return (
      <EmptyState
        icon={Lock}
        title="Posts are for members"
        description={community.canJoin ? 'Join to read and share posts with this community.' : community.joinBlockedReason}
        action={community.canJoin && <CommunityJoinButton community={community} size="md" />}
        className="rounded-3xl border border-dashed border-line-strong"
      />
    );
  }

  const shown = feedCommunity === community.id ? (limit ? posts.slice(0, limit) : posts) : [];
  return (
    <div className="flex flex-col gap-4">
      {community.permissions?.canPost && <CreatePost community={{ id: community.id, name: community.name }} />}
      {shown.length === 0 && loading && <Loader centered label="Loading posts" className="min-h-40" />}
      {shown.length === 0 && !loading && error && <ErrorState title="We couldn't load the posts" description={error} onRetry={() => fetchPosts('all', { communityId: community.id })} />}
      {shown.length === 0 && !loading && !error && (
        <EmptyState icon={MessagesSquare} title="No posts yet" description="Start the first discussion: a question, an idea or something you built." className="rounded-3xl border border-dashed border-line-strong" />
      )}
      <ol className="flex flex-col gap-4" aria-label="Community posts">
        <AnimatePresence initial={false}>
          {shown.map((post) => (
            <motion.li key={post.id} layout="position" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.18 } }}>
              <PostCard post={post} showCommunity={false} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      {!limit && hasMore && shown.length > 0 && (
        <Button variant="outline" className="self-center" loading={loadingMore} onClick={loadMore}>
          Load more posts
        </Button>
      )}
    </div>
  );
}

/** Tabs: arrow keys move between them; the choice lives in the URL so a refresh keeps it. */
function Tabs({ active, onChange }) {
  const refs = useRef({});
  const onKeyDown = (event) => {
    const index = TABS.findIndex((tab) => tab.id === active);
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length].id;
    onChange(next);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label="Community sections" className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0" onKeyDown={onKeyDown}>
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(node) => { refs.current[tab.id] = node; }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn('relative isolate h-11 shrink-0 rounded-xl px-4 text-sm font-semibold transition-colors', selected ? 'text-primary-soft-fg' : 'text-ink-muted hover:text-ink')}
          >
            {selected && <motion.span layoutId="community-tab" className="absolute inset-0 -z-10 rounded-xl bg-primary-soft" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** One community: header, Overview / Posts / Members / About, and a side column on wide screens. */
export default function CommunityDetailsPage() {
  const { communityId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((item) => item.id === searchParams.get('tab')) ? searchParams.get('tab') : 'overview';
  const userId = useAuthStore((state) => state.user?.id);
  const community = useCommunityStore((state) => state.selectedCommunity);
  const status = useCommunityStore((state) => state.selectedStatus);
  const error = useCommunityStore((state) => state.selectedError);
  const recommended = useCommunityStore((state) => state.recommendedCommunities);
  const { fetchCommunity, loadOptions, forViewer, fetchRecommended } = useCommunityStore.getState();
  const [editing, setEditing] = useState(false);
  const current = community?.id === communityId ? community : null;
  useDocumentTitle(current?.name ?? 'Community');

  useEffect(() => {
    forViewer(userId);
    useFeedStore.getState().forViewer(userId);
    loadOptions();
    useFeedStore.getState().loadOptions();
    fetchRecommended();
  }, [userId]);

  useEffect(() => {
    fetchCommunity(communityId);
  }, [communityId, userId]);

  const chooseTab = (next) => setSearchParams(next === 'overview' ? {} : { tab: next }, { replace: true });

  if (!current) {
    return (
      <PageContainer width="wide">
        {status === 'not-found' ? (
          <EmptyState icon={SearchX} titleAs="h1" title="Community not found." description="It may have been archived, or the link is wrong." action={<Button as={Link} to={ROUTES.COMMUNITIES}>Browse communities</Button>} />
        ) : status === 'forbidden' ? (
          <EmptyState icon={Lock} titleAs="h1" title="This community isn't open to you" description={error} action={<Button as={Link} to={ROUTES.COMMUNITIES}>Find your communities</Button>} />
        ) : status === 'error' ? (
          <ErrorState title="We couldn't load this community" description={error} onRetry={() => fetchCommunity(communityId)} />
        ) : (
          <Loader centered label="Loading community" />
        )}
      </PageContainer>
    );
  }

  const related = recommended.filter((item) => item.id !== current.id).slice(0, 3);
  return (
    <PageContainer width="wide">
      <Button as={Link} to={ROUTES.COMMUNITIES} variant="ghost" size="sm" leftIcon={ArrowLeft} className="-ml-2 mb-3">
        All communities
      </Button>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <CommunityHeader community={current} onEdit={() => setEditing(true)} />
          <Tabs active={tab} onChange={chooseTab} />

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} className="outline-none">
            {tab === 'overview' && (
              <div className="flex flex-col gap-4">
                <Card>
                  <h2 className="font-display text-lg font-bold text-ink">Welcome</h2>
                  <p className="mt-2 line-clamp-4 text-sm leading-relaxed whitespace-pre-line text-ink-muted">{current.description}</p>
                  {current.rules?.length > 0 && (
                    <p className="mt-3 text-xs text-ink-subtle">
                      {current.rules.length} community {current.rules.length === 1 ? 'rule' : 'rules'} ·{' '}
                      <button type="button" className="font-semibold text-primary hover:underline" onClick={() => chooseTab('about')}>Read them</button>
                    </p>
                  )}
                </Card>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-ink">Latest posts</h2>
                  {current.membership?.status === 'active' && (
                    <button type="button" className="text-sm font-semibold text-primary hover:underline" onClick={() => chooseTab('posts')}>See all</button>
                  )}
                </div>
                <CommunityPosts community={current} limit={3} />
              </div>
            )}
            {tab === 'posts' && <CommunityPosts community={current} />}
            {tab === 'members' && (
              <Card>
                <h2 className="font-display text-lg font-bold text-ink">Members</h2>
                <CommunityMembers community={current} />
              </Card>
            )}
            {tab === 'about' && <CommunityAbout community={current} />}
          </div>
        </div>

        <aside aria-label="Community info" className="hidden xl:block">
          <div className="sticky top-10 flex flex-col gap-4">
            <Card padding="sm">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-ink">Members</h2>
                <Link to={communityPath(current.id, 'members')} className="text-sm font-semibold text-primary hover:underline" onClick={(event) => { event.preventDefault(); chooseTab('members'); }}>
                  See all
                </Link>
              </div>
              <CommunityMembers community={current} compact />
            </Card>
            {related.length > 0 && (
              <div>
                <h2 className="mb-2 font-display text-base font-bold text-ink">Related communities</h2>
                <div className="flex flex-col gap-3">
                  {related.map((item) => <CommunityCard key={item.id} community={item} reason={item.reason} />)}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {current.permissions?.canEdit && <EditCommunityModal community={current} open={editing} onClose={() => setEditing(false)} />}
    </PageContainer>
  );
}
