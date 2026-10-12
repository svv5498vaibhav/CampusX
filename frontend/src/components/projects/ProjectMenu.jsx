import { useState } from 'react';
import { Flag, Link2, Megaphone, Pencil, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PostMenu } from '@/components/feed/PostMenu';
import { ReportModal } from '@/components/safety/ReportModal';
import { ShareToFeedDialog } from '@/components/showcase/ShareToFeedDialog';
import { Button, Modal } from '@/components/ui';
import { projectPath, projectUrl } from '@/constants/showcase';
import { useProjectStore } from '@/store/projectStore';
import { toast } from '@/store/toastStore';

/**
 * ⋮ for a project. Owners: Edit, Share to feed, Copy link, Delete (with confirmation). Everyone else:
 * Copy link. The server checks ownership again on every change.
 */
export function ProjectMenu({ project, onDeleted }) {
  const navigate = useNavigate();
  const deleting = useProjectStore((state) => state.deleting === project.id);
  const { deleteProject, shareProject } = useProjectStore.getState();
  const [dialog, setDialog] = useState(null); // 'delete' | 'share' | 'report'

  const copy = async () => {
    if (await shareProject(project.id)) toast.success('Project link copied!');
    else toast.error(`Couldn't copy automatically. The link is ${projectUrl(project.id)}`);
  };

  const confirmDelete = async () => {
    try {
      await deleteProject(project.id);
      setDialog(null);
      toast.success('Project deleted.');
      onDeleted?.(project.id);
    } catch (error) {
      if ([403, 404].includes(error.status)) setDialog(null);
      toast.error(error.status === 403 || error.status === 404 ? error.message : 'Unable to delete project. Please try again.');
    }
  };

  const items = project.isOwner
    ? [
        { id: 'edit', label: 'Edit project', icon: Pencil, onSelect: () => navigate(`${projectPath(project.id)}/edit`) },
        { id: 'share-feed', label: 'Share to feed', icon: Megaphone, onSelect: () => setDialog('share') },
        { id: 'copy', label: 'Copy link', icon: Link2, onSelect: copy },
        { id: 'delete', label: 'Delete project', icon: Trash2, onSelect: () => setDialog('delete'), danger: true },
      ]
    : [
        { id: 'copy', label: 'Copy link', icon: Link2, onSelect: copy },
        { id: 'report', label: 'Report project', icon: Flag, onSelect: () => setDialog('report'), danger: true },
      ];

  return (
    <>
      <PostMenu items={items} label={project.isOwner ? 'Your project options' : 'Project options'} />
      {!project.isOwner && <ReportModal target={{ type: 'project', id: project.id }} open={dialog === 'report'} onClose={() => setDialog(null)} />}
      {project.isOwner && (
        <>
          <Modal
            open={dialog === 'delete'}
            onClose={deleting ? () => {} : () => setDialog(null)}
            title="Delete this project?"
            description="It will be removed from CampusX with its images. This can't be undone."
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
            item={{ kind: 'project', title: project.title, url: projectUrl(project.id), visibility: project.visibility }}
          />
        </>
      )}
    </>
  );
}
