import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clapperboard, ImagePlus, SendHorizontal, UsersRound, X } from 'lucide-react';
import { Alert, Avatar, Button, Modal } from '@/components/ui';
import { COMPOSER_TYPES, FORMAT_TYPES, POST_TYPE_STYLES, VISIBILITY_ICONS, typeLabel } from '@/constants/posts';
import { useAuthStore } from '@/store/authStore';
import { useFeedStore } from '@/store/feedStore';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';
import { getFullName } from '@/utils/string';

const ACCEPT = { image: 'image/jpeg,image/png,image/webp', video: 'video/mp4,video/webm' };

let nextFileId = 1;

/** Checks a picked file against the server's limits so problems show before uploading. */
function checkFile(file, mediaRules) {
  const kind = mediaRules.image.mimeTypes.includes(file.type) ? 'image' : mediaRules.video.mimeTypes.includes(file.type) ? 'video' : null;
  if (!kind) return { error: 'Unsupported media type.' };
  if (file.size > mediaRules[kind].maxBytes) return { error: 'Media file is too large.', hint: `${kind === 'image' ? 'Photos' : 'Videos'} can be up to ${mediaRules[kind].maxMegabytes} MB.` };
  return { kind };
}

/**
 * Write or edit a campus post. Photos (up to 4) or one video, a category, and who can see it.
 * `picker` ('image' | 'video') opens the file chooser straight away (Photo/Video quick starts).
 * `community` ({ id, name }) posts inside that community: only its members see it, so there is no
 * visibility choice. Community posts keep their community when edited.
 */
export function PostComposer({ open, onClose, mode = 'create', post = null, initialType = 'text', picker = null, community = null }) {
  const user = useAuthStore((state) => state.user);
  const options = useFeedStore((state) => state.options);
  const loadOptions = useFeedStore((state) => state.loadOptions);
  const createPost = useFeedStore((state) => state.createPost);
  const updatePost = useFeedStore((state) => state.updatePost);
  const isEdit = mode === 'edit';
  const inCommunity = community ?? post?.community ?? null;

  const [content, setContent] = useState(post?.content ?? '');
  const [type, setType] = useState(() => {
    const start = post?.type ?? initialType;
    return FORMAT_TYPES.includes(start) ? 'text' : start;
  });
  const [visibility, setVisibility] = useState(post?.visibility ?? null);
  const [keptMedia, setKeptMedia] = useState(post?.media ?? []);
  const [files, setFiles] = useState([]); // [{ id, file, kind, preview }]
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(null);

  const imageInput = useRef(null);
  const videoInput = useRef(null);
  const textareaRef = useRef(null);
  const textareaId = useId();
  const visibilityId = useId();
  const counterId = useId();

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  // Quick starts: open the file chooser as the composer opens (still within the click).
  useEffect(() => {
    if (!open) return;
    if (picker === 'image') imageInput.current?.click();
    else if (picker === 'video') videoInput.current?.click();
    else textareaRef.current?.focus();
  }, [open, picker]);

  // Previews are object URLs; release them when files are removed or the composer closes.
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => filesRef.current.forEach((item) => URL.revokeObjectURL(item.preview)), []);

  const [pendingFiles, setPendingFiles] = useState(null);
  useEffect(() => {
    if (options && pendingFiles) {
      setPendingFiles(null);
      addFiles(pendingFiles);
    }
    // addFiles reads the latest state on each render; re-run only when these change.
  }, [options, pendingFiles]);

  const maxLength = options?.rules.content.maxLength ?? 3000;
  const limits = options?.rules.media ?? { maxImages: 4, maxVideos: 1 };
  const chosenVisibility = visibility ?? options?.defaultVisibility ?? 'campus';
  const allMedia = useMemo(
    () => [...keptMedia.map((item) => ({ ...item, kind: item.type, preview: item.type === 'video' ? item.posterUrl : item.url, existing: true })), ...files],
    [keptMedia, files],
  );
  const hasVideo = allMedia.some((item) => item.kind === 'video');
  const imageCount = allMedia.filter((item) => item.kind === 'image').length;
  const canAddImages = !hasVideo && imageCount < limits.maxImages;
  const canAddVideo = allMedia.length === 0;
  const prompt = options?.types.find((item) => item.id === type)?.prompt ?? 'Share something with campus...';
  const isEmpty = !content.trim() && allMedia.length === 0;

  const addFiles = (fileList) => {
    const picked = [...fileList];
    if (!options) {
      // Limits still loading: keep the choice and apply it once they arrive.
      setPendingFiles(picked);
      return;
    }
    const accepted = [];
    for (const file of picked) {
      const { kind, error: fileError, hint } = checkFile(file, options.media);
      if (fileError) {
        setError(hint ? `${fileError} ${hint}` : `${fileError} Use JPG, PNG or WEBP photos, or MP4 / WEBM videos.`);
        return;
      }
      accepted.push({ id: `new-${nextFileId++}`, file, kind, preview: URL.createObjectURL(file) });
    }
    const kinds = [...allMedia, ...accepted].map((item) => item.kind);
    const images = kinds.filter((kind) => kind === 'image').length;
    const videos = kinds.length - images;
    if (images > limits.maxImages || videos > limits.maxVideos || (images && videos)) {
      accepted.forEach((item) => URL.revokeObjectURL(item.preview));
      setError(`Add up to ${limits.maxImages} photos, or ${limits.maxVideos} video, to a post.`);
      return;
    }
    setError('');
    setFiles((current) => [...current, ...accepted]);
  };

  const removeMedia = (item) => {
    if (item.existing) setKeptMedia((current) => current.filter((media) => media.id !== item.id));
    else {
      URL.revokeObjectURL(item.preview);
      setFiles((current) => current.filter((media) => media.id !== item.id));
    }
  };

  const close = () => {
    if (!submitting) onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    if (isEmpty) {
      setError('Post content cannot be empty.');
      return;
    }
    if (content.length > maxLength) {
      setError(`Posts can be up to ${maxLength} characters.`);
      return;
    }

    setSubmitting(true);
    setError('');
    const uploads = files.map((item) => item.file);
    const onProgress = uploads.length ? setProgress : undefined;
    const fields = inCommunity
      ? { content: content.trim(), type, ...(!isEdit && { community: inCommunity.id }) }
      : { content: content.trim(), type, visibility: chosenVisibility };
    let toastId;
    try {
      if (isEdit) {
        await updatePost(post.id, { ...fields, keepMedia: keptMedia.map((item) => item.id) }, uploads, onProgress);
        toast.success('Post updated.');
      } else {
        toastId = toast.loading('Posting...');
        await createPost(fields, uploads, onProgress);
        toast.success('Posted to CampusX!', { id: toastId });
      }
      onClose();
    } catch (requestError) {
      if (toastId) toast.dismiss(toastId);
      setError(requestError.errors?.[0]?.message && requestError.status === 422 ? requestError.errors[0].message : requestError.message);
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  const VisibilityIcon = VISIBILITY_ICONS[chosenVisibility] ?? VISIBILITY_ICONS.campus;
  const visibilityOption = options?.visibility.find((item) => item.id === chosenVisibility);

  return (
    <Modal
      open={open}
      onClose={close}
      closeOnOverlayClick={!submitting}
      title={isEdit ? 'Edit your post' : inCommunity ? `Post in ${inCommunity.name}` : 'Share with campus'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="post-composer" leftIcon={SendHorizontal} loading={submitting} disabled={isEmpty || !options}>
            {isEdit ? 'Save changes' : inCommunity ? 'Post to community' : 'Post to campus'}
          </Button>
        </>
      }
    >
      <form id="post-composer" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="flex items-center gap-3">
          <Avatar src={user?.avatarUrl} name={getFullName(user)} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">{getFullName(user)}</p>
            {inCommunity ? (
              <p className="mt-0.5 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary-soft px-2.5 text-xs font-semibold text-primary-soft-fg">
                <UsersRound className="size-3.5" aria-hidden="true" />
                Members of {inCommunity.name}
              </p>
            ) : (
              <>
                <label htmlFor={visibilityId} className="sr-only">
                  Who can see this post
                </label>
                <div className="relative mt-0.5 inline-flex items-center">
                  <VisibilityIcon className="pointer-events-none absolute left-2.5 size-3.5 text-primary-soft-fg" aria-hidden="true" />
                  <select
                    id={visibilityId}
                    value={chosenVisibility}
                    onChange={(event) => setVisibility(event.target.value)}
                    disabled={submitting}
                    className="h-8 appearance-none rounded-lg bg-primary-soft pr-3 pl-8 text-xs font-semibold text-primary-soft-fg focus:ring-4 focus:ring-focus focus:outline-none"
                  >
                    {(options?.visibility ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                {visibilityOption && <p className="mt-1 text-[11px] text-ink-subtle">{visibilityOption.description}</p>}
              </>
            )}
          </div>
        </div>

        {/* min-w-0: fieldsets default to min-content width, which would stop the chip row scrolling. */}
        <fieldset className="min-w-0">
          <legend className="sr-only">What kind of post is this?</legend>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
            {COMPOSER_TYPES.map((id) => {
              const { icon: Icon } = POST_TYPE_STYLES[id];
              const selected = type === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setType(id)}
                  disabled={submitting}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors',
                    selected ? 'border-primary bg-primary text-primary-fg' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {id === 'text' ? 'Post' : typeLabel(options, id)}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor={textareaId} className="sr-only">
            Post text
          </label>
          <textarea
            ref={textareaRef}
            id={textareaId}
            rows={5}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={prompt}
            maxLength={maxLength}
            disabled={submitting}
            aria-describedby={counterId}
            className="w-full resize-none rounded-2xl border border-line bg-surface-muted/60 px-4 py-3 text-[15px] leading-relaxed text-ink placeholder:text-ink-subtle focus:border-primary focus:bg-surface focus:ring-4 focus:ring-focus focus:outline-none"
          />
          <p id={counterId} className={cn('mt-1 text-right text-xs tabular-nums', content.length > maxLength * 0.9 ? 'text-accent-fg' : 'text-ink-subtle')}>
            {content.length}/{maxLength}
          </p>
        </div>

        {allMedia.length > 0 && (
          <ul className={cn('grid gap-2', hasVideo ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4')}>
            <AnimatePresence initial={false}>
              {allMedia.map((item, index) => (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="relative overflow-hidden rounded-2xl border border-line bg-surface-muted"
                >
                  {item.kind === 'video' ? (
                    item.existing ? (
                      <video src={item.url} poster={item.preview ?? undefined} controls preload="none" className="aspect-video w-full bg-black" aria-label="Attached video" />
                    ) : (
                      <video src={item.preview} controls preload="metadata" className="aspect-video w-full bg-black" aria-label={`Attached video: ${item.file.name}`} />
                    )
                  ) : (
                    <img src={item.preview} alt={`Attached photo ${index + 1}`} className="aspect-square w-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeMedia(item)}
                    disabled={submitting}
                    aria-label={`Remove ${item.kind === 'video' ? 'video' : `photo ${index + 1}`}`}
                    className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" leftIcon={ImagePlus} onClick={() => imageInput.current?.click()} disabled={submitting || !canAddImages || !options}>
            Photos
          </Button>
          <Button variant="secondary" size="sm" leftIcon={Clapperboard} onClick={() => videoInput.current?.click()} disabled={submitting || !canAddVideo || !options}>
            Video
          </Button>
          <p className="text-xs text-ink-subtle">
            {options
              ? `Up to ${limits.maxImages} photos (${options.media.image.maxMegabytes} MB each) or 1 video (${options.media.video.maxMegabytes} MB)`
              : 'Loading upload limits...'}
          </p>
          <input ref={imageInput} type="file" accept={ACCEPT.image} multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
          <input ref={videoInput} type="file" accept={ACCEPT.video} hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
        </div>

        {progress !== null && (
          <div role="progressbar" aria-label="Uploading" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${progress}%` }} transition={{ ease: 'easeOut' }} />
          </div>
        )}

        {error && <Alert variant="danger">{error}</Alert>}
      </form>
    </Modal>
  );
}
