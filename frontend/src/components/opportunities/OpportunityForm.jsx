import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, Search, Trash2, X } from 'lucide-react';
import { ChipInput } from '@/components/common/ChipInput';
import { Alert, Button, Card, Input, Select, Textarea } from '@/components/ui';
import { fromLocalInput, toLocalDateInput, toLocalDateTimeInput } from '@/constants/opportunities';
import { useOpportunityStore } from '@/store/opportunityStore';
import { cn } from '@/utils/cn';

const URL_PATTERN = /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]+$/i;

function Section({ title, description, children }) {
  return (
    <Card as="section">
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </Card>
  );
}

/** Toggle chips for a short list (branches, semesters). */
function ToggleChips({ legend, hint, options, value, onChange }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold text-ink">{legend}</legend>
      {hint && <p className="mb-2 text-xs text-ink-subtle">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = value.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((item) => item !== option.value) : [...value, option.value])}
              className={cn('rounded-xl border px-3 py-1.5 text-sm font-semibold transition-colors', on ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink')}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Pick eligible colleges from the CampusX list (search by name or short name). */
function CollegePicker({ colleges, value, onChange, max, error }) {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const needle = query.trim().toLowerCase();
  const shown = colleges.filter((college) => !needle || `${college.name} ${college.shortName}`.toLowerCase().includes(needle));
  const byId = new Map(colleges.map((college) => [college.id, college]));
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold text-ink">Colleges <span className="font-normal text-ink-subtle">({value.length}/{max}) · none selected = any college</span></legend>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Selected colleges">
          {value.map((id) => (
            <li key={id} className="inline-flex items-center gap-1 rounded-lg bg-primary-soft py-1 pr-1 pl-2.5 text-sm font-semibold text-primary-soft-fg">
              {byId.get(id)?.shortName ?? id}
              <button type="button" onClick={() => onChange(value.filter((item) => item !== id))} aria-label={`Remove ${byId.get(id)?.name ?? id}`} className="grid size-6 place-items-center rounded-md hover:bg-surface/60">
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor={searchId} className="sr-only">Find a college</label>
      <Input id={searchId} leftIcon={Search} value={query} placeholder="Find a college" onChange={(event) => setQuery(event.target.value)} />
      <ul className="mt-2 max-h-48 overflow-y-auto rounded-2xl border border-line" aria-label="Colleges">
        {shown.map((college) => {
          const checked = value.includes(college.id);
          return (
            <li key={college.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-ink hover:bg-surface-muted">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && value.length >= max}
                  onChange={() => onChange(checked ? value.filter((item) => item !== college.id) : [...value, college.id])}
                  className="size-4 accent-[var(--cx-primary)]"
                />
                <span className="min-w-0 truncate">{college.name}</span>
              </label>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-3 py-2 text-sm text-ink-subtle">No college matches “{query}”.</li>}
      </ul>
      {error && <p className="mt-1.5 text-sm font-medium text-danger-fg" role="alert">{error}</p>}
    </fieldset>
  );
}

/** One image slot (cover image or organizer logo): preview, choose, remove. Uploaded after saving. */
function ImageSlot({ label, hint, rules, current, picked, onPick, onRemove, error, wide = false }) {
  const input = useRef(null);
  const preview = picked?.preview ?? (picked === null ? null : current);
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-ink">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className={cn('grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-line-strong bg-surface-muted text-ink-subtle', wide ? 'aspect-[5/2] w-full max-w-sm' : 'size-20')}>
          {preview ? <img src={preview} alt={`${label} preview`} className={cn('size-full', wide ? 'object-cover' : 'object-contain')} /> : <ImagePlus className="size-6" aria-hidden="true" />}
        </div>
        <div className="flex flex-col gap-2">
          <input ref={input} type="file" accept={rules.mimeTypes.join(',')} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => { onPick(event.target.files?.[0]); event.target.value = ''; }} />
          <Button variant="outline" size="sm" leftIcon={ImagePlus} onClick={() => input.current?.click()}>{preview ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}</Button>
          {preview && <Button variant="ghost" size="sm" leftIcon={Trash2} onClick={onRemove}>Remove</Button>}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-ink-subtle">{hint}</p>
      {error && <p className="mt-1 text-sm font-medium text-danger-fg" role="alert">{error}</p>}
    </div>
  );
}

const initialValues = (opportunity) => ({
  title: opportunity?.title ?? '',
  shortDescription: opportunity?.shortDescription ?? '',
  description: opportunity?.description ?? '',
  type: opportunity?.type ?? 'hackathon',
  organizer: opportunity?.organizer ?? '',
  mode: opportunity?.mode ?? 'online',
  location: opportunity?.location ?? '',
  startDate: toLocalDateInput(opportunity?.startDate),
  endDate: toLocalDateInput(opportunity?.endDate),
  applicationDeadline: toLocalDateTimeInput(opportunity?.applicationDeadline),
  applicationUrl: opportunity?.applicationUrl ?? '',
  registrationUrl: opportunity?.registrationUrl ?? '',
  eligibility: opportunity?.eligibility ?? '',
  eligibleColleges: opportunity?.eligibleFor?.colleges.map((college) => college.id) ?? [],
  eligibleBranches: opportunity?.eligibleFor?.branches.map((branch) => branch.id) ?? [],
  eligibleSemesters: opportunity?.eligibleFor?.semesters ?? [],
  skills: opportunity?.skills ?? [],
  tags: opportunity?.tags ?? [],
  prize: opportunity?.prize ?? '',
  fee: opportunity?.fee ?? '',
  visibility: opportunity?.visibility ?? 'public',
  featured: opportunity?.featured ?? false,
});

function validate(values, rules, { creating }) {
  const errors = {};
  const length = (field, label, { min, max }) => {
    const size = values[field].trim().length;
    if (size < min || size > max) errors[field] = `${label} must be ${min}–${max} characters.`;
  };
  length('title', 'Title', rules.title);
  length('shortDescription', 'Short description', rules.shortDescription);
  length('description', 'Description', rules.description);
  length('organizer', 'Organizer', rules.organizer);
  if (values.mode !== 'online' && !values.location.trim()) errors.location = 'Please add a location for offline or hybrid opportunities.';
  for (const [field, label] of [['applicationUrl', 'the application link'], ['registrationUrl', 'the registration link']]) {
    if (values[field].trim() && !URL_PATTERN.test(values[field].trim())) errors[field] = `Please enter a full link for ${label}, starting with https://`;
  }
  if (values.startDate && values.endDate && values.endDate < values.startDate) errors.endDate = 'The end date can’t be before the start date.';
  if (creating && values.applicationDeadline && new Date(values.applicationDeadline) <= new Date()) errors.applicationDeadline = 'The application deadline has already passed.';
  if (values.visibility === 'college' && values.eligibleColleges.length === 0) errors.eligibleColleges = 'Choose at least one eligible college, or show it to every CampusX student.';
  return errors;
}

/**
 * Create or edit an opportunity (moderators and admins). Images are uploaded after the opportunity is
 * saved, so a failed upload never loses the form. `onSaved(opportunity, { imageError })`.
 */
export function OpportunityForm({ opportunity = null, onSaved, onCancel }) {
  const options = useOpportunityStore((state) => state.options);
  const { createOpportunity, updateOpportunity, uploadImage, removeImage } = useOpportunityStore.getState();
  const [values, setValues] = useState(() => initialValues(opportunity));
  // undefined = unchanged · null = remove · { file, preview } = new file
  const [images, setImages] = useState({ image: undefined, logo: undefined });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(null); // 'draft' | 'published' | 'save'
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => () => Object.values(imagesRef.current).forEach((item) => item?.preview && URL.revokeObjectURL(item.preview)), []);

  if (!options) return null;
  const rules = options.rules;
  const creating = !opportunity;
  const set = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const pick = (kind, file) => {
    if (!file) return;
    const media = options.media[kind];
    if (!media.mimeTypes.includes(file.type)) return setErrors((e) => ({ ...e, [kind]: 'Only JPG, PNG, and WEBP images are supported.' }));
    if (file.size > media.maxBytes) return setErrors((e) => ({ ...e, [kind]: `Please choose an image smaller than ${media.maxMegabytes} MB.` }));
    setErrors((e) => ({ ...e, [kind]: undefined }));
    setImages((current) => {
      if (current[kind]?.preview) URL.revokeObjectURL(current[kind].preview);
      return { ...current, [kind]: { file, preview: URL.createObjectURL(file) } };
    });
    return undefined;
  };
  const unpick = (kind) =>
    setImages((current) => {
      if (current[kind]?.preview) URL.revokeObjectURL(current[kind].preview);
      return { ...current, [kind]: null };
    });

  const submit = async (status) => {
    if (saving) return;
    const found = validate(values, rules, { creating });
    if (Object.keys(found).length) {
      setErrors(found);
      setFormError('Please fix the highlighted fields.');
      return;
    }
    setSaving(status ?? 'save');
    setFormError('');
    const fields = {
      title: values.title,
      shortDescription: values.shortDescription,
      description: values.description,
      type: values.type,
      organizer: values.organizer,
      mode: values.mode,
      location: values.location.trim(),
      startDate: fromLocalInput(values.startDate) || null,
      endDate: fromLocalInput(values.endDate) || null,
      applicationDeadline: fromLocalInput(values.applicationDeadline) || null,
      applicationUrl: values.applicationUrl.trim(),
      registrationUrl: values.registrationUrl.trim(),
      eligibility: values.eligibility,
      eligibleColleges: values.eligibleColleges,
      eligibleBranches: values.eligibleBranches,
      eligibleSemesters: values.eligibleSemesters,
      skills: values.skills,
      tags: values.tags,
      prize: values.prize,
      fee: values.fee,
      visibility: values.visibility,
      featured: values.featured,
      ...(status && { status }),
    };
    try {
      let saved = creating ? await createOpportunity(fields) : await updateOpportunity(opportunity.id, fields);
      const imageErrors = [];
      for (const kind of ['image', 'logo']) {
        const change = images[kind];
        try {
          if (change?.file) saved = await uploadImage(saved.id, kind, change.file);
          else if (change === null && (kind === 'image' ? saved.image : saved.organizerLogo)) saved = await removeImage(saved.id, kind);
        } catch (uploadError) {
          imageErrors.push(uploadError.message);
        }
      }
      onSaved(saved, { imageError: imageErrors.join(' ') });
    } catch (requestError) {
      const fieldErrors = Object.fromEntries((requestError.errors ?? []).filter((item) => item.field).map((item) => [item.field, item.message]));
      setErrors(fieldErrors);
      setFormError(requestError.message);
    } finally {
      setSaving(null);
    }
  };

  const toOptions = (list) => list.map((item) => ({ value: item.id, label: item.label }));
  const branchOptions = options.branches.map((branch) => ({ value: branch.id, label: branch.shortName }));
  const semesterOptions = options.semesters.map((semester) => ({ value: semester.value, label: String(semester.value) }));

  return (
    <form onSubmit={(event) => { event.preventDefault(); submit(creating ? 'published' : undefined); }} className="flex flex-col gap-5" noValidate>
      {formError && <Alert variant="danger">{formError}</Alert>}

      <Section title="The basics" description="What it is and who runs it.">
        <Input label="Title" required value={values.title} onChange={(event) => set('title', event.target.value)} error={errors.title} maxLength={rules.title.max} placeholder="Campus Innovation Hackathon" />
        <Textarea label="Short description" required rows={2} hint={`${values.shortDescription.trim().length}/${rules.shortDescription.max} · shown on cards`} value={values.shortDescription} onChange={(event) => set('shortDescription', event.target.value)} error={errors.shortDescription} maxLength={rules.shortDescription.max} />
        <Textarea label="Description" required rows={7} hint={`${values.description.trim().length}/${rules.description.max}`} value={values.description} onChange={(event) => set('description', event.target.value)} error={errors.description} maxLength={rules.description.max} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Type" value={values.type} onChange={(event) => set('type', event.target.value)} options={toOptions(options.types)} error={errors.type} />
          <Input label="Organizer" required value={values.organizer} onChange={(event) => set('organizer', event.target.value)} error={errors.organizer} maxLength={rules.organizer.max} placeholder="ABC Innovation Foundation" />
        </div>
      </Section>

      <Section title="When and where">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Mode" value={values.mode} onChange={(event) => set('mode', event.target.value)} options={toOptions(options.modes)} error={errors.mode} />
          <Input label="Location" required={values.mode !== 'online'} value={values.location} onChange={(event) => set('location', event.target.value)} error={errors.location} maxLength={rules.location.max} placeholder={values.mode === 'online' ? 'Optional for online' : 'e.g. PBCOE Seminar Hall, Nagpur'} />
          <Input label="Start date" type="date" value={values.startDate} onChange={(event) => set('startDate', event.target.value)} error={errors.startDate} />
          <Input label="End date" type="date" value={values.endDate} onChange={(event) => set('endDate', event.target.value)} error={errors.endDate} />
        </div>
        <Input label="Application deadline" type="datetime-local" hint="Leave empty for rolling applications. After this moment students see it as closed." value={values.applicationDeadline} onChange={(event) => set('applicationDeadline', event.target.value)} error={errors.applicationDeadline} />
      </Section>

      <Section title="Links" description="Students open these on the organizer’s site. Only https:// or http:// links are accepted.">
        <Input label="Application link" type="url" inputMode="url" value={values.applicationUrl} onChange={(event) => set('applicationUrl', event.target.value)} error={errors.applicationUrl} placeholder="https://" />
        <Input label="Registration link" type="url" inputMode="url" hint="Optional, e.g. for events and workshops" value={values.registrationUrl} onChange={(event) => set('registrationUrl', event.target.value)} error={errors.registrationUrl} placeholder="https://" />
      </Section>

      <Section title="Eligibility" description="Students see “Eligible” or “Not eligible” from the college, branch and semester on their own profile.">
        <Textarea label="Eligibility notes" rows={2} hint="Optional, e.g. “Teams of 2–4 students”" value={values.eligibility} onChange={(event) => set('eligibility', event.target.value)} error={errors.eligibility} maxLength={rules.eligibility.max} />
        <CollegePicker colleges={options.colleges} value={values.eligibleColleges} onChange={(list) => set('eligibleColleges', list)} max={rules.eligibleColleges.max} error={errors.eligibleColleges} />
        <ToggleChips legend="Branches" hint="None selected = any branch" options={branchOptions} value={values.eligibleBranches} onChange={(list) => set('eligibleBranches', list)} />
        {errors.eligibleBranches && <p className="text-sm font-medium text-danger-fg" role="alert">{errors.eligibleBranches}</p>}
        <ToggleChips legend="Semesters" hint="None selected = any semester" options={semesterOptions} value={values.eligibleSemesters} onChange={(list) => set('eligibleSemesters', [...list].sort((a, b) => a - b))} />
        {errors.eligibleSemesters && <p className="text-sm font-medium text-danger-fg" role="alert">{errors.eligibleSemesters}</p>}
      </Section>

      <Section title="Details">
        <ChipInput label="Skills" values={values.skills} onChange={(list) => set('skills', list)} max={rules.skills.max} maxLength={rules.skills.maxLength} suggestions={options.skillSuggestions} placeholder="e.g. React (press Enter)" error={errors.skills} />
        <ChipInput label="Tags" values={values.tags} onChange={(list) => set('tags', list)} max={rules.tags.max} maxLength={rules.tags.maxLength} placeholder="e.g. AI, Web (press Enter)" error={errors.tags} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Prize" value={values.prize} onChange={(event) => set('prize', event.target.value)} error={errors.prize} maxLength={rules.prize.max} placeholder="Optional, e.g. ₹1,00,000 prize pool" />
          <Input label="Fee" value={values.fee} onChange={(event) => set('fee', event.target.value)} error={errors.fee} maxLength={rules.fee.max} placeholder="Optional, e.g. Free" />
        </div>
      </Section>

      <Section title="Images" description="Optional. JPG, PNG or WEBP.">
        <ImageSlot label="Image" wide hint={`Banner on the opportunity page · up to ${options.media.image.maxMegabytes} MB`} rules={options.media.image} current={opportunity?.image} picked={images.image} onPick={(file) => pick('image', file)} onRemove={() => unpick('image')} error={errors.image} />
        <ImageSlot label="Organizer logo" hint={`Square works best · up to ${options.media.logo.maxMegabytes} MB`} rules={options.media.logo} current={opportunity?.organizerLogo} picked={images.logo} onPick={(file) => pick('logo', file)} onRemove={() => unpick('logo')} error={errors.logo} />
      </Section>

      <Section title="Who can see it">
        <fieldset>
          <legend className="sr-only">Visibility</legend>
          <div className="flex flex-col gap-2">
            {options.visibility.map((option) => (
              <label key={option.id} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-sm has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus', values.visibility === option.id ? 'border-primary bg-primary-soft' : 'border-line hover:border-line-strong')}>
                <input type="radio" name="visibility" value={option.id} checked={values.visibility === option.id} onChange={() => set('visibility', option.id)} className="mt-0.5 size-4 accent-[var(--cx-primary)]" />
                <span>
                  <span className="block font-semibold text-ink">{option.label}</span>
                  <span className="block text-ink-muted">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-ink">
          <input type="checkbox" checked={values.featured} onChange={(event) => set('featured', event.target.checked)} className="size-4 accent-[var(--cx-primary)]" />
          Feature it (a “Featured” label on the page)
        </label>
      </Section>

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap justify-end gap-3 rounded-2xl border border-line bg-overlay/95 p-3 shadow-lift backdrop-blur-md md:bottom-4">
        <Button variant="ghost" onClick={onCancel} disabled={Boolean(saving)}>Cancel</Button>
        {creating ? (
          <>
            <Button variant="outline" onClick={() => submit('draft')} loading={saving === 'draft'} disabled={Boolean(saving)}>Save draft</Button>
            <Button type="submit" loading={saving === 'published'} disabled={Boolean(saving)}>Publish</Button>
          </>
        ) : (
          <Button type="submit" loading={saving === 'save'} disabled={Boolean(saving)}>Save changes</Button>
        )}
      </div>
    </form>
  );
}
