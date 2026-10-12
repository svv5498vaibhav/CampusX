import { useEffect, useId, useState } from 'react';
import { Megaphone, SendHorizontal, UsersRound } from 'lucide-react';
import { Alert, Button, Modal, Textarea } from '@/components/ui';
import { useCommunityStore } from '@/store/communityStore';
import { useFeedStore } from '@/store/feedStore';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';

const KINDS = {
  project: { type: 'project', title: 'Share this project with CampusX?', text: (item) => `I just shared a project on CampusX: ${item.title}\n${item.url}` },
  achievement: { type: 'achievement', title: 'Share this win with CampusX?', text: (item) => `New win: ${item.title}\n${item.url}` },
  opportunity: { type: 'opportunity', title: 'Tell your campus about this?', text: (item) => `Found an opportunity on CampusX: ${item.title}\n${item.url}` },
};

/**
 * Optional: tell campus about a project, an achievement or an opportunity. Creates an ordinary Phase 5
 * post (with a link back) in the campus feed or in one of the student's communities. Nothing is posted
 * unless the student presses "Share".
 *   item: { kind: 'project' | 'achievement' | 'opportunity', title, url, visibility }
 */
export function ShareToFeedDialog({ open, onClose, item }) {
  const myCommunities = useCommunityStore((state) => state.myCommunities);
  const fetchMyCommunities = useCommunityStore((state) => state.fetchMyCommunities);
  const createPost = useFeedStore((state) => state.createPost);
  const [destination, setDestination] = useState('campus');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const groupId = useId();
  const postable = myCommunities.filter((community) => community.status === 'active');
  const hidden = item.visibility === 'private';
  const kind = KINDS[item.kind] ?? KINDS.project;

  useEffect(() => {
    if (!open) return;
    fetchMyCommunities();
    setDestination('campus');
    setError('');
    setContent(kind.text(item));
  }, [open, item, kind, fetchMyCommunities]);

  const share = async () => {
    if (sending) return;
    setSending(true);
    setError('');
    try {
      const { type } = kind;
      await createPost(destination === 'campus' ? { content, type, visibility: 'campus' } : { content, type, community: destination }, []);
      toast.success(destination === 'campus' ? 'Posted to CampusX!' : 'Shared with your community!');
      onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSending(false);
    }
  };

  const option = (id, label, description, Icon) => (
    <label key={id} className={cn('flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus', destination === id ? 'border-primary bg-primary-soft' : 'border-line hover:border-line-strong')}>
      <input type="radio" name={groupId} value={id} checked={destination === id} onChange={() => setDestination(id)} className="sr-only" />
      <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{label}</span>
        <span className="block truncate text-xs text-ink-muted">{description}</span>
      </span>
    </label>
  );

  return (
    <Modal
      open={open}
      onClose={sending ? () => {} : onClose}
      title={kind.title}
      description="Optional. A post with a link is shared only if you press Share."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={sending}>Not now</Button>
          <Button leftIcon={SendHorizontal} onClick={share} loading={sending} disabled={hidden || !content.trim()}>Share</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {hidden && <Alert variant="info">This {item.kind} is set to “Only me”, so others couldn’t open the link. Change its visibility first.</Alert>}
        {error && <Alert variant="danger">{error}</Alert>}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Where?</legend>
          <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
            {option('campus', 'Campus feed', 'Students at your college', Megaphone)}
            {postable.map((community) => option(community.id, community.name, 'Community members', UsersRound))}
          </div>
        </fieldset>
        <Textarea label="Your post" rows={4} maxLength={3000} value={content} onChange={(event) => setContent(event.target.value)} />
      </div>
    </Modal>
  );
}
