import { useEffect, useId, useRef, useState } from 'react';
import { EyeOff, ImagePlus, X } from 'lucide-react';
import { Alert, Button, Card, Input, Select, Textarea } from '@/components/ui';
import { ANONYMOUS_VISIBILITY_ICONS } from '@/constants/anonymous';
import { useAnonymousStore } from '@/store/anonymousStore';
import { useCommunityStore } from '@/store/communityStore';
import { cn } from '@/utils/cn';

let nextFileId = 1;

/**
 * Write or edit an anonymous post. New posts choose who can read them (their college, all of CampusX,
 * or one of their communities) and may add up to 4 photos; an edit changes the category, title and text
 * only. Nothing about the student is sent: the server takes the author from the session.
 * `onSaved(post)`.
 */
export function AnonymousPostForm({ post = null, onSaved, onCancel }) {
  const options = useAnonymousStore((state) => state.options);
  const { createAnonymousPost, updateAnonymousPost } = useAnonymousStore.getState();
  const myCommunities = useCommunityStore((state) => state.myCommunities);
  const fetchMyCommunities = useCommunityStore((state) => state.fetchMyCommunities);
  const editing = Boolean(post);
  const [values, setValues] = useState({
    category: post?.category ?? '',
    title: post?.title ?? '',
    content: post?.content ?? '',
    visibility: options?.defaultVisibility ?? 'college',
    community: '',
  });
  const [images, setImages] = useState([]); // [{ id, file, preview }]
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInput = useRef(null);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const visibilityName = useId();
  useEffect(() => () => imagesRef.current.forEach((item) => URL.revokeObjectURL(item.preview)), []);
  useEffect(() => {
    if (!editing) fetchMyCommunities();
  }, [editing, fetchMyCommunities]);

  if (!options) return null;
  const { rules } = options;
  const imageRules = options.media.image;
  const communities = myCommunities.filter((community) => community.status === 'active');
  const set = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const pick = (fileList) => {
    const picked = [...fileList];
    for (const file of picked) {
      if (!imageRules.mimeTypes.includes(file.type)) return setErrors((e) => ({ ...e, images: 'Only JPG, PNG, and WEBP images are supported.' }));
      if (file.size > imageRules.maxBytes) return setErrors((e) => ({ ...e, images: `Please choose images smaller than ${imageRules.maxMegabytes} MB.` }));
    }
    if (images.length + picked.length > imageRules.maxImages) return setErrors((e) => ({ ...e, images: `A post can have up to ${imageRules.maxImages} images.` }));
    setErrors((e) => ({ ...e, images: undefined }));
    setImages((current) => [...current, ...picked.map((file) => ({ id: `img-${nextFileId++}`, file, preview: URL.createObjectURL(file) }))]);
    return undefined;
  };
  const unpick = (id) =>
    setImages((current) => {
      const item = current.find((image) => image.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return current.filter((image) => image.id !== id);
    });

  const validate = () => {
    const found = {};
    if (!values.category) found.category = 'Please choose a category.';
    const length = (field, label, { min, max }) => {
      const size = values[field].trim().length;
      if (size < min || size > max) found[field] = `${label} must be ${min}–${max} characters.`;
    };
    length('title', 'Title', rules.title);
    length('content', 'Your post', rules.content);
    if (!editing && values.visibility === 'community' && !values.community) found.community = 'Choose one of your communities.';
    return found;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const found = validate();
    if (Object.keys(found).length) {
      setErrors(found);
      setFormError('Please fix the highlighted fields.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const fields = { category: values.category, title: values.title, content: values.content };
      const saved = editing
        ? await updateAnonymousPost(post.id, fields)
        : await createAnonymousPost({ ...fields, visibility: values.visibility, ...(values.visibility === 'community' && { community: values.community }) }, images.map((item) => item.file));
      onSaved(saved);
    } catch (requestError) {
      setErrors(Object.fromEntries((requestError.errors ?? []).filter((item) => item.field).map((item) => [item.field, item.message])));
      setFormError(requestError.errors?.length ? 'Please fix the highlighted fields.' : requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {formError && <Alert variant="danger">{formError}</Alert>}
      <Card as="section" className="flex flex-col gap-4">
        <Select
          label="Category"
          required
          value={values.category}
          placeholder="Choose a category"
          onChange={(event) => set('category', event.target.value)}
          options={options.categories.map((category) => ({ value: category.id, label: category.label }))}
          error={errors.category}
        />
        <Input label="Title" required value={values.title} maxLength={rules.title.max} onChange={(event) => set('title', event.target.value)} error={errors.title} placeholder="e.g. Library timing suggestion" />
        <Textarea
          label="Your post"
          required
          rows={7}
          maxLength={rules.content.max}
          value={values.content}
          onChange={(event) => set('content', event.target.value)}
          error={errors.content}
          hint={`${values.content.trim().length}/${rules.content.max} · Please leave out phone numbers, emails and other private details.`}
        />
      </Card>

      {!editing && (
        <Card as="section" className="flex flex-col gap-4">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">Who can read it?</legend>
            <div className="flex flex-col gap-2">
              {options.visibility.map((option) => {
                const Icon = ANONYMOUS_VISIBILITY_ICONS[option.id];
                const disabled = option.id === 'community' && communities.length === 0;
                return (
                  <label key={option.id} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-sm has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus', values.visibility === option.id ? 'border-primary bg-primary-soft' : 'border-line hover:border-line-strong', disabled && 'cursor-not-allowed opacity-60')}>
                    <input type="radio" name={visibilityName} value={option.id} checked={values.visibility === option.id} disabled={disabled} onChange={() => set('visibility', option.id)} className="mt-0.5 size-4 accent-[var(--cx-primary)]" />
                    {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />}
                    <span>
                      <span className="block font-semibold text-ink">{option.label}</span>
                      <span className="block text-ink-muted">{disabled ? 'Join a community first' : option.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {values.visibility === 'community' && (
            <Select
              label="Community"
              required
              value={values.community}
              placeholder="Choose one of your communities"
              onChange={(event) => set('community', event.target.value)}
              options={communities.map((community) => ({ value: community.id, label: community.name }))}
              error={errors.community}
            />
          )}

          <div>
            <p className="mb-1.5 text-sm font-semibold text-ink">Photos <span className="font-normal text-ink-subtle">(optional, up to {imageRules.maxImages})</span></p>
            {images.length > 0 && (
              <ul className="mb-2 grid grid-cols-4 gap-2" aria-label="Chosen photos">
                {images.map((item, index) => (
                  <li key={item.id} className="relative overflow-hidden rounded-xl border border-line">
                    <img src={item.preview} alt={`Photo ${index + 1}`} className="aspect-square w-full object-cover" />
                    <button type="button" onClick={() => unpick(item.id)} aria-label={`Remove photo ${index + 1}`} className="absolute top-1 right-1 grid size-7 place-items-center rounded-lg bg-surface/90 text-ink hover:text-danger-fg">
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input ref={fileInput} type="file" accept={imageRules.mimeTypes.join(',')} multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => { pick(event.target.files ?? []); event.target.value = ''; }} />
            <Button variant="outline" size="sm" leftIcon={ImagePlus} onClick={() => fileInput.current?.click()} disabled={images.length >= imageRules.maxImages}>Add photos</Button>
            <p className="mt-1.5 text-xs text-ink-subtle">JPG, PNG or WEBP up to {imageRules.maxMegabytes} MB. Location and camera details are removed before upload.</p>
            {errors.images && <p className="mt-1 text-sm font-medium text-danger-fg" role="alert">{errors.images}</p>}
          </div>
        </Card>
      )}
      {editing && <p className="text-sm text-ink-muted">Who can read it and the photos stay as they are; you can change the category, title and text.</p>}

      <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary-soft px-4 py-3 text-sm text-ink">
        <EyeOff className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p>Your identity will not be shown to other students.</p>
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>{editing ? 'Save changes' : 'Post Anonymously'}</Button>
      </div>
    </form>
  );
}
