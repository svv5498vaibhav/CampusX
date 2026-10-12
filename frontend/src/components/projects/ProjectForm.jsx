import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, Search, Star, UserPlus, X } from 'lucide-react';
import { ChipInput } from '@/components/common/ChipInput';
import { Alert, Avatar, Button, Card, Input, Textarea } from '@/components/ui';
import { SHOWCASE_VISIBILITY_ICONS } from '@/constants/showcase';
import { useProjectStore } from '@/store/projectStore';
import { cn } from '@/utils/cn';
import { getFullName } from '@/utils/string';

const URL_PATTERN = /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]+$/i;
let nextFileId = 1;

function Section({ title, description, children }) {
  return (
    <Card as="section">
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </Card>
  );
}

function ChoiceChips({ legend, name, options, value, onChange }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const Icon = option.icon;
          const checked = value === option.id;
          return (
            <label key={option.id} title={option.description} className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus', checked ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink')}>
              <input type="radio" name={name} value={option.id} checked={checked} onChange={() => onChange(option.id)} className="sr-only" />
              {Icon && <Icon className="size-4" aria-hidden="true" />}
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Find classmates by name and add them with a role. They join the team once they accept. */
function TeamPicker({ team, onChange, roles, max }) {
  const searchTeamCandidates = useProjectStore((state) => state.searchTeamCandidates);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef(null);
  const inputId = useId();

  useEffect(() => () => clearTimeout(timer.current), []);
  const onSearch = (value) => {
    setSearch(value);
    clearTimeout(timer.current);
    if (value.trim().length < 2) return setResults([]);
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await searchTeamCandidates(value.trim()));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return undefined;
  };

  const add = (student) => {
    if (team.length >= max || team.some((member) => member.student.id === student.id)) return;
    onChange([...team, { student, role: 'developer', status: 'new' }]);
    setSearch('');
    setResults([]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-ink">Add a teammate <span className="font-normal text-ink-subtle">({team.length}/{max})</span></label>
        <Input id={inputId} leftIcon={Search} value={search} placeholder="Search CampusX students by name" onChange={(event) => onSearch(event.target.value)} disabled={team.length >= max} />
        {searching && <p className="mt-1.5 text-xs text-ink-subtle" role="status">Searching…</p>}
        {results.length > 0 && (
          <ul className="mt-2 flex flex-col divide-y divide-line rounded-2xl border border-line" aria-label="Matching students">
            {results.map((student) => {
              const added = team.some((member) => member.student.id === student.id);
              return (
                <li key={student.id} className="flex items-center gap-3 px-3 py-2">
                  <Avatar src={student.avatarUrl} name={getFullName(student)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{getFullName(student)}</p>
                    <p className="truncate text-xs text-ink-subtle">{[student.college?.name, student.branch?.shortName].filter(Boolean).join(' · ')}</p>
                  </div>
                  <Button size="sm" variant="secondary" leftIcon={UserPlus} disabled={added} onClick={() => add(student)}>{added ? 'Added' : 'Add'}</Button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-1.5 text-xs text-ink-subtle">Teammates see an invitation and appear on the project once they accept.</p>
      </div>
      {team.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Team">
          {team.map((member) => (
            <li key={member.student.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-muted px-3 py-2">
              <Avatar src={member.student.avatarUrl} name={getFullName(member.student)} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{getFullName(member.student)}</p>
                <p className="text-xs text-ink-subtle">{member.status === 'accepted' ? 'On the team' : 'Invited'}</p>
              </div>
              <label className="sr-only" htmlFor={`role-${member.student.id}`}>Role for {getFullName(member.student)}</label>
              <select
                id={`role-${member.student.id}`}
                value={member.role}
                onChange={(event) => onChange(team.map((item) => (item.student.id === member.student.id ? { ...item, role: event.target.value } : item)))}
                className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink focus:ring-4 focus:ring-focus focus:outline-none"
              >
                {roles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
              </select>
              <button type="button" onClick={() => onChange(team.filter((item) => item.student.id !== member.student.id))} aria-label={`Remove ${getFullName(member.student)}`} className="grid size-8 place-items-center rounded-lg text-ink-subtle hover:bg-surface hover:text-danger-fg">
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const initialValues = (project) => ({
  title: project?.title ?? '',
  shortDescription: project?.shortDescription ?? '',
  description: project?.description ?? '',
  category: project?.category ?? 'web',
  techStack: project?.techStack ?? [],
  githubUrl: project?.githubUrl ?? '',
  liveUrl: project?.liveUrl ?? '',
  demoUrl: project?.demoUrl ?? '',
  status: project?.status ?? 'in-progress',
  visibility: project?.visibility ?? 'public',
  featured: project?.featured ?? false,
  team: project?.team?.filter((member) => member.student) ?? [],
});

function validate(values, rules) {
  const errors = {};
  const length = (field, label, { min, max }) => {
    const size = values[field].trim().length;
    if (size < min || size > max) errors[field] = `${label} must be ${min}–${max} characters.`;
  };
  length('title', 'Project title', rules.title);
  length('shortDescription', 'Short description', rules.shortDescription);
  length('description', 'Description', rules.description);
  for (const [field, label] of [['githubUrl', 'GitHub'], ['liveUrl', 'Live site'], ['demoUrl', 'Demo']]) {
    if (values[field].trim() && !URL_PATTERN.test(values[field].trim())) errors[field] = `Please enter a full link for ${label}, starting with https://`;
  }
  return errors;
}

/**
 * Create or edit a project ("Things I've built"). New images are uploaded after the project is
 * saved, so a failed upload never leaves a broken project. `onSaved(project, { imageError })`.
 */
export function ProjectForm({ project = null, onSaved, onCancel }) {
  const options = useProjectStore((state) => state.options);
  const { createProject, updateProject, addImages, removeImage } = useProjectStore.getState();
  const [values, setValues] = useState(() => initialValues(project));
  const [existingImages, setExistingImages] = useState(project?.images ?? []);
  const [cover, setCover] = useState(project?.images?.[0]?.id ?? null);
  const [newFiles, setNewFiles] = useState([]); // [{ id, file, preview }]
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null);
  const fileInput = useRef(null);
  const filesRef = useRef(newFiles);
  filesRef.current = newFiles;
  useEffect(() => () => filesRef.current.forEach((item) => URL.revokeObjectURL(item.preview)), []);

  if (!options) return null;
  const rules = options.rules;
  const set = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };
  const imageRules = options.media.image;
  const totalImages = existingImages.length + newFiles.length;

  const pickImages = (fileList) => {
    const picked = [...fileList];
    for (const file of picked) {
      if (!imageRules.mimeTypes.includes(file.type)) return setErrors((e) => ({ ...e, images: 'Only JPG, PNG, and WEBP images are supported.' }));
      if (file.size > imageRules.maxBytes) return setErrors((e) => ({ ...e, images: `Please choose images smaller than ${imageRules.maxMegabytes} MB.` }));
    }
    if (totalImages + picked.length > rules.images.max) return setErrors((e) => ({ ...e, images: `A project can have up to ${rules.images.max} images.` }));
    setErrors((e) => ({ ...e, images: undefined }));
    setNewFiles((current) => [...current, ...picked.map((file) => ({ id: `new-${nextFileId++}`, file, preview: URL.createObjectURL(file) }))]);
    return undefined;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const found = validate(values, rules);
    if (Object.keys(found).length) {
      setErrors(found);
      setFormError('Please fix the highlighted fields.');
      return;
    }
    setSaving(true);
    setFormError('');
    const fields = {
      title: values.title,
      shortDescription: values.shortDescription,
      description: values.description,
      category: values.category,
      techStack: values.techStack,
      githubUrl: values.githubUrl.trim(),
      liveUrl: values.liveUrl.trim(),
      demoUrl: values.demoUrl.trim(),
      status: values.status,
      visibility: values.visibility,
      featured: values.featured,
      teamMembers: values.team.map((member) => ({ user: member.student.id, role: member.role })),
    };
    try {
      let saved;
      if (project) {
        const removed = (project.images ?? []).filter((image) => !existingImages.some((kept) => kept.id === image.id));
        for (const image of removed) await removeImage(project.id, image.id);
        saved = await updateProject(project.id, { ...fields, ...(cover && existingImages.some((image) => image.id === cover) && cover !== existingImages[0]?.id && { thumbnailImageId: cover }) });
      } else {
        saved = await createProject({ ...fields, githubUrl: fields.githubUrl || undefined, liveUrl: fields.liveUrl || undefined, demoUrl: fields.demoUrl || undefined });
      }
      let imageError = '';
      if (newFiles.length) {
        try {
          setProgress(0);
          saved = await addImages(saved.id, newFiles.map((item) => item.file), setProgress);
        } catch (uploadError) {
          imageError = uploadError.message;
        }
      }
      onSaved(saved, { imageError });
    } catch (requestError) {
      const fieldErrors = Object.fromEntries((requestError.errors ?? []).filter((item) => item.field).map((item) => [item.field === 'teamMembers' ? 'team' : item.field, item.message]));
      setErrors(fieldErrors);
      setFormError(requestError.message);
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  const visibilityOptions = options.visibility.map((option) => ({ ...option, icon: SHOWCASE_VISIBILITY_ICONS[option.id] }));

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {formError && <Alert variant="danger">{formError}</Alert>}

      <Section title="Project basics">
        <Input label="Project title" value={values.title} maxLength={rules.title.max} error={errors.title} placeholder="e.g. Campus Lost & Found Bot" onChange={(event) => set('title', event.target.value)} />
        <Input label="Short description" value={values.shortDescription} maxLength={rules.shortDescription.max} error={errors.shortDescription} hint={`${values.shortDescription.trim().length}/${rules.shortDescription.max} · one line about what it does`} onChange={(event) => set('shortDescription', event.target.value)} />
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
          Category
          <select value={values.category} onChange={(event) => set('category', event.target.value)} className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm font-normal text-ink focus:border-primary focus:ring-4 focus:ring-focus focus:outline-none">
            {options.categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
          </select>
        </label>
      </Section>

      <Section title="About the project" description="What problem does it solve, how did you build it, what did you learn?">
        <Textarea label="Description" rows={7} value={values.description} maxLength={rules.description.max} error={errors.description} hint={`${values.description.trim().length}/${rules.description.max}`} onChange={(event) => set('description', event.target.value)} />
      </Section>

      <Section title="Technology">
        <ChipInput label="Tech stack" values={values.techStack} onChange={(list) => set('techStack', list)} max={rules.techStack.max} maxLength={rules.techStack.maxLength} suggestions={options.techSuggestions} placeholder="e.g. React, Node.js, MongoDB" error={errors.techStack} />
      </Section>

      <Section title="Links" description="Optional. Full links starting with https://">
        <Input label="GitHub" type="url" value={values.githubUrl} error={errors.githubUrl} placeholder="https://github.com/you/project" onChange={(event) => set('githubUrl', event.target.value)} />
        <Input label="Live site" type="url" value={values.liveUrl} error={errors.liveUrl} placeholder="https://your-project.example.com" onChange={(event) => set('liveUrl', event.target.value)} />
        <Input label="Demo" type="url" value={values.demoUrl} error={errors.demoUrl} placeholder="A video or slides link" onChange={(event) => set('demoUrl', event.target.value)} />
      </Section>

      <Section title="Project images" description={`Up to ${rules.images.max} JPG, PNG or WEBP images, ${imageRules.maxMegabytes} MB each. The cover shows on cards.`}>
        {(existingImages.length > 0 || newFiles.length > 0) && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {existingImages.map((image, index) => (
              <li key={image.id} className="relative overflow-hidden rounded-2xl border border-line">
                <img src={image.url} alt={`Project image ${index + 1}`} className="aspect-square w-full object-cover" />
                <button type="button" onClick={() => setCover(image.id)} aria-pressed={cover === image.id} className={cn('absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold backdrop-blur-sm', cover === image.id ? 'bg-primary text-primary-fg' : 'bg-black/55 text-white')}>
                  <Star className="size-3" aria-hidden="true" /> {cover === image.id ? 'Cover' : 'Make cover'}
                </button>
                <button type="button" onClick={() => setExistingImages((list) => list.filter((item) => item.id !== image.id))} aria-label={`Remove image ${index + 1}`} className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
            {newFiles.map((item, index) => (
              <li key={item.id} className="relative overflow-hidden rounded-2xl border border-dashed border-primary">
                <img src={item.preview} alt={`New image ${index + 1}`} className="aspect-square w-full object-cover" />
                <button type="button" onClick={() => { URL.revokeObjectURL(item.preview); setNewFiles((list) => list.filter((file) => file.id !== item.id)); }} aria-label={`Remove new image ${index + 1}`} className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Button variant="secondary" leftIcon={ImagePlus} onClick={() => fileInput.current?.click()} disabled={totalImages >= rules.images.max}>Add images</Button>
          <input ref={fileInput} type="file" accept={imageRules.mimeTypes.join(',')} multiple hidden onChange={(event) => { pickImages(event.target.files); event.target.value = ''; }} />
          {errors.images && <p role="alert" className="mt-1.5 text-xs font-medium text-danger-fg">{errors.images}</p>}
        </div>
      </Section>

      <Section title="Status & visibility">
        <ChoiceChips legend="Status" name="project-status" options={options.statuses} value={values.status} onChange={(value) => set('status', value)} />
        <ChoiceChips legend="Who can see it" name="project-visibility" options={visibilityOptions} value={values.visibility} onChange={(value) => set('visibility', value)} />
        <p className="-mt-2 text-xs text-ink-subtle">{options.visibility.find((option) => option.id === values.visibility)?.description}</p>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
          <input type="checkbox" checked={values.featured} onChange={(event) => set('featured', event.target.checked)} className="size-4 accent-[var(--cx-primary)]" />
          Feature it first on my profile
        </label>
      </Section>

      <Section title="Team" description="Optional. Add the classmates you built it with.">
        <TeamPicker team={values.team} onChange={(team) => set('team', team)} roles={options.teamRoles} max={rules.team.max} />
        {errors.team && <p role="alert" className="text-xs font-medium text-danger-fg">{errors.team}</p>}
      </Section>

      {progress !== null && (
        <div role="progressbar" aria-label="Uploading images" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 flex justify-end gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-lift backdrop-blur-md md:bottom-4">
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>{project ? 'Save changes' : 'Save Project'}</Button>
      </div>
    </form>
  );
}
