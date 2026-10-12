import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, ImageUp, Save } from 'lucide-react';
import { CommunityIcon } from '@/components/communities/CommunityIcon';
import { RulesInput, TagInput } from '@/components/communities/CommunityFormFields';
import { ImageUploadDialog } from '@/components/profile/ImageUploadDialog';
import { Alert, Button, Input, Modal, Textarea } from '@/components/ui';
import { useCommunityStore } from '@/store/communityStore';
import { toast } from '@/store/toastStore';

/**
 * Owner settings: name, description, tags, rules, icon and cover, archive / restore. Type and who
 * can join are fixed once a community exists. The server checks ownership on every change.
 */
export function EditCommunityModal({ community, open, onClose }) {
  const options = useCommunityStore((state) => state.options);
  const { updateCommunity, archiveCommunity, uploadImage, removeImage } = useCommunityStore.getState();
  const [values, setValues] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [imageDialog, setImageDialog] = useState(null); // 'icon' | 'cover' | null
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues({ name: community.name, description: community.description, tags: community.tags, rules: community.rules ?? [] });
    setErrors({});
    setFormError('');
    setConfirmArchive(false);
    // Reset only when the dialog opens: a new icon or cover must not wipe unsaved text edits.
  }, [open, community.id]);

  if (!values || !options) return null;
  const rules = options.rules;
  const set = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError('');
    try {
      await updateCommunity(community.id, values);
      toast.success('Community updated.');
      onClose();
    } catch (error) {
      setErrors(Object.fromEntries((error.errors ?? []).filter((item) => item.field).map((item) => [item.field, item.message])));
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (status) => {
    setSaving(true);
    try {
      if (status === 'archived') await archiveCommunity(community.id);
      else await updateCommunity(community.id, { status });
      toast.success(status === 'archived' ? 'Community archived.' : 'Community restored.');
      onClose();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const archived = community.status === 'archived';

  return (
    <>
      <Modal
        open={open && !imageDialog}
        onClose={saving ? () => {} : onClose}
        title="Community settings"
        description="Only owners can change these. Type and who can join stay as they were created."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="edit-community" leftIcon={Save} loading={saving}>
              Save changes
            </Button>
          </>
        }
      >
        <form id="edit-community" onSubmit={save} className="flex flex-col gap-5" noValidate>
          {formError && <Alert variant="danger">{formError}</Alert>}

          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-muted p-3">
            <CommunityIcon community={community} size="md" />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" leftIcon={ImageUp} onClick={() => setImageDialog('icon')}>
                {community.iconUrl ? 'Change icon' : 'Add icon'}
              </Button>
              <Button variant="outline" size="sm" leftIcon={ImageUp} onClick={() => setImageDialog('cover')}>
                {community.coverImageUrl ? 'Change cover' : 'Add cover'}
              </Button>
            </div>
          </div>

          <Input label="Community name" value={values.name} maxLength={rules.name.max} error={errors.name} onChange={(event) => set('name', event.target.value)} />
          <Textarea
            label="Description"
            rows={4}
            value={values.description}
            maxLength={rules.description.max}
            hint={`${values.description.trim().length}/${rules.description.max}`}
            error={errors.description}
            onChange={(event) => set('description', event.target.value)}
          />
          <TagInput tags={values.tags} onChange={(tags) => set('tags', tags)} max={rules.tags.max} maxLength={rules.tags.maxLength} error={errors.tags} />
          <RulesInput rules={values.rules} onChange={(list) => set('rules', list)} max={rules.rules.max} maxLength={rules.rules.maxLength} error={errors.rules} />

          <div className="rounded-2xl border border-line p-4">
            <h3 className="text-sm font-semibold text-ink">{archived ? 'Restore community' : 'Archive community'}</h3>
            <p className="mt-1 text-xs text-ink-muted">
              {archived
                ? 'Members can post again and other students can find and join it.'
                : 'Posts and members stay, but nobody can join or post. You can restore it later.'}
            </p>
            {archived ? (
              <Button variant="outline" size="sm" leftIcon={ArchiveRestore} className="mt-3" onClick={() => setStatus('active')} disabled={saving}>
                Restore community
              </Button>
            ) : confirmArchive ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmArchive(false)} disabled={saving}>
                  Keep it active
                </Button>
                <Button variant="danger" size="sm" leftIcon={Archive} onClick={() => setStatus('archived')} loading={saving}>
                  Yes, archive it
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" leftIcon={Archive} className="mt-3" onClick={() => setConfirmArchive(true)}>
                Archive community
              </Button>
            )}
          </div>
        </form>
      </Modal>

      <ImageUploadDialog
        open={Boolean(imageDialog)}
        onClose={() => setImageDialog(null)}
        kind={imageDialog === 'icon' ? 'communityIcon' : 'communityCover'}
        currentUrl={imageDialog === 'icon' ? community.iconUrl : community.coverImageUrl}
        name={community.name}
        rules={imageDialog === 'icon' ? options.media.icon : options.media.cover}
        onUpload={(file, onProgress) => uploadImage(community.id, imageDialog, file, onProgress)}
        onRemove={() => removeImage(community.id, imageDialog)}
      />
    </>
  );
}
