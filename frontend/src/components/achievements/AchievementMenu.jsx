import { useState } from 'react';
import { Flag, Link2, Megaphone, Pencil, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PostMenu } from '@/components/feed/PostMenu';
import { ReportModal } from '@/components/safety/ReportModal';
import { ShareToFeedDialog } from '@/components/showcase/ShareToFeedDialog';
import { Button, Modal } from '@/components/ui';
import { achievementPath, achievementUrl } from '@/constants/showcase';
import { useAchievementStore } from '@/store/achievementStore';
import { toast } from '@/store/toastStore';

/** ⋮ for an achievement. Owners: Edit, Share to feed, Copy link, Delete. Everyone else: Copy link. */
export function AchievementMenu({ achievement, onDeleted }) {
  const navigate = useNavigate();
  const deleting = useAchievementStore((state) => state.deleting === achievement.id);
  const { deleteAchievement, shareAchievement } = useAchievementStore.getState();
  const [dialog, setDialog] = useState(null); // 'delete' | 'share' | 'report'

  const copy = async () => {
    if (await shareAchievement(achievement.id)) toast.success('Achievement link copied!');
    else toast.error(`Couldn't copy automatically. The link is ${achievementUrl(achievement.id)}`);
  };

  const confirmDelete = async () => {
    try {
      await deleteAchievement(achievement.id);
      setDialog(null);
      toast.success('Achievement deleted.');
      onDeleted?.(achievement.id);
    } catch (error) {
      if ([403, 404].includes(error.status)) setDialog(null);
      toast.error(error.status === 403 || error.status === 404 ? error.message : 'Unable to delete achievement. Please try again.');
    }
  };

  const items = achievement.isOwner
    ? [
        { id: 'edit', label: 'Edit achievement', icon: Pencil, onSelect: () => navigate(`${achievementPath(achievement.id)}/edit`) },
        { id: 'share-feed', label: 'Share to feed', icon: Megaphone, onSelect: () => setDialog('share') },
        { id: 'copy', label: 'Copy link', icon: Link2, onSelect: copy },
        { id: 'delete', label: 'Delete achievement', icon: Trash2, onSelect: () => setDialog('delete'), danger: true },
      ]
    : [
        { id: 'copy', label: 'Copy link', icon: Link2, onSelect: copy },
        { id: 'report', label: 'Report achievement', icon: Flag, onSelect: () => setDialog('report'), danger: true },
      ];

  return (
    <>
      <PostMenu items={items} label={achievement.isOwner ? 'Your achievement options' : 'Achievement options'} />
      {!achievement.isOwner && <ReportModal target={{ type: 'achievement', id: achievement.id }} open={dialog === 'report'} onClose={() => setDialog(null)} />}
      {achievement.isOwner && (
        <>
          <Modal
            open={dialog === 'delete'}
            onClose={deleting ? () => {} : () => setDialog(null)}
            title="Delete this achievement?"
            description="It will be removed from CampusX with any proof you uploaded. This can't be undone."
            size="sm"
            footer={
              <>
                <Button variant="outline" onClick={() => setDialog(null)} disabled={deleting}>Cancel</Button>
                <Button variant="danger" leftIcon={Trash2} loading={deleting} onClick={confirmDelete}>Delete</Button>
              </>
            }
          />
          <ShareToFeedDialog
            open={dialog === 'share'}
            onClose={() => setDialog(null)}
            item={{ kind: 'achievement', title: achievement.title, url: achievementUrl(achievement.id), visibility: achievement.visibility }}
          />
        </>
      )}
    </>
  );
}
