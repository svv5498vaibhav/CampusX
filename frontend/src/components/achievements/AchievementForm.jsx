import { useState } from 'react';
import { ChipInput } from '@/components/common/ChipInput';
import { Alert, Button, Card, Input, Textarea } from '@/components/ui';
import { ACHIEVEMENT_TYPE_ICONS, SHOWCASE_VISIBILITY_ICONS, toDateInput } from '@/constants/showcase';
import { useAchievementStore } from '@/store/achievementStore';
import { cn } from '@/utils/cn';

const URL_PATTERN = /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]+$/i;
const today = () => new Date().toISOString().slice(0, 10);

const initialValues = (achievement) => ({
  title: achievement?.title ?? '',
  type: achievement?.type ?? 'hackathon',
  organization: achievement?.organization ?? '',
  eventName: achievement?.eventName ?? '',
  description: achievement?.description ?? '',
  date: toDateInput(achievement?.date) || today(),
  rank: achievement?.rank ?? '',
  skills: achievement?.skills ?? [],
  certificateUrl: achievement?.certificateUrl ?? '',
  visibility: achievement?.visibility ?? 'public',
});

/**
 * Create or edit an achievement ("My wins"). Verification is never chosen here: proof is added on
 * the achievement's page and reviewed by CampusX moderators.
 */
export function AchievementForm({ achievement = null, onSaved, onCancel }) {
  const options = useAchievementStore((state) => state.options);
  const { createAchievement, updateAchievement } = useAchievementStore.getState();
  const [values, setValues] = useState(() => initialValues(achievement));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  if (!options) return null;
  const rules = options.rules;

  const set = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const validate = () => {
    const found = {};
    const title = values.title.trim().length;
    if (title < rules.title.min || title > rules.title.max) found.title = `Title must be ${rules.title.min}–${rules.title.max} characters.`;
    if (!values.date || values.date > today()) found.date = 'Please choose a date that isn’t in the future.';
    if (values.certificateUrl.trim() && !URL_PATTERN.test(values.certificateUrl.trim())) found.certificateUrl = 'Please enter a full link starting with https://';
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
    const fields = { ...values, certificateUrl: values.certificateUrl.trim() };
    try {
      const saved = achievement
        ? await updateAchievement(achievement.id, fields)
        : await createAchievement({ ...fields, certificateUrl: fields.certificateUrl || undefined });
      onSaved(saved);
    } catch (requestError) {
      setErrors(Object.fromEntries((requestError.errors ?? []).filter((item) => item.field).map((item) => [item.field, item.message])));
      setFormError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {formError && <Alert variant="danger">{formError}</Alert>}
      {achievement && ['verified', 'pending'].includes(achievement.verificationStatus) && (
        <Alert variant="info">Changing the title, type, organization, event, date, result, description or certificate link sends this achievement back for review.</Alert>
      )}

      <Card as="section">
        <h2 className="font-display text-lg font-bold text-ink">The win</h2>
        <div className="mt-4 flex flex-col gap-4">
          <Input label="Achievement title" value={values.title} maxLength={rules.title.max} error={errors.title} placeholder="e.g. 2nd Runner-Up — AIXplore Hackathon" onChange={(event) => set('title', event.target.value)} />
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">Type</legend>
            <div className="flex flex-wrap gap-2">
              {options.types.map((type) => {
                const Icon = ACHIEVEMENT_TYPE_ICONS[type.id];
                const checked = values.type === type.id;
                return (
                  <label key={type.id} className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus', checked ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink')}>
                    <input type="radio" name="achievement-type" value={type.id} checked={checked} onChange={() => set('type', type.id)} className="sr-only" />
                    {Icon && <Icon className="size-4" aria-hidden="true" />}
                    {type.label}
                  </label>
                );
              })}
            </div>
            {errors.type && <p role="alert" className="mt-1.5 text-xs font-medium text-danger-fg">{errors.type}</p>}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Organization" value={values.organization} maxLength={rules.organization.max} error={errors.organization} placeholder="Who ran it?" onChange={(event) => set('organization', event.target.value)} />
            <Input label="Event name" value={values.eventName} maxLength={rules.eventName.max} error={errors.eventName} placeholder="e.g. Startup Arena 2026" onChange={(event) => set('eventName', event.target.value)} />
            <Input label="Date" type="date" value={values.date} max={today()} error={errors.date} onChange={(event) => set('date', event.target.value)} />
            <Input label="Result / rank" value={values.rank} maxLength={rules.rank.max} error={errors.rank} placeholder="e.g. Winner, Top 10, 92%" onChange={(event) => set('rank', event.target.value)} />
          </div>
          <Textarea label="The story (optional)" rows={4} value={values.description} maxLength={rules.description.max} error={errors.description} hint={`${values.description.trim().length}/${rules.description.max}`} onChange={(event) => set('description', event.target.value)} />
        </div>
      </Card>

      <Card as="section">
        <h2 className="font-display text-lg font-bold text-ink">Skills & certificate</h2>
        <div className="mt-4 flex flex-col gap-4">
          <ChipInput label="Skills you used" values={values.skills} onChange={(list) => set('skills', list)} max={rules.skills.max} maxLength={rules.skills.maxLength} placeholder="e.g. Python, Public speaking" error={errors.skills} />
          <Input label="Certificate link (optional)" type="url" value={values.certificateUrl} error={errors.certificateUrl} placeholder="https://…" hint="Uploading proof files happens on the achievement's page." onChange={(event) => set('certificateUrl', event.target.value)} />
        </div>
      </Card>

      <Card as="section">
        <h2 className="font-display text-lg font-bold text-ink">Who can see it</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {options.visibility.map((option) => {
            const Icon = SHOWCASE_VISIBILITY_ICONS[option.id];
            const checked = values.visibility === option.id;
            return (
              <label key={option.id} title={option.description} className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus', checked ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink')}>
                <input type="radio" name="achievement-visibility" value={option.id} checked={checked} onChange={() => set('visibility', option.id)} className="sr-only" />
                {Icon && <Icon className="size-4" aria-hidden="true" />}
                {option.label}
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-ink-subtle">{options.visibility.find((option) => option.id === values.visibility)?.description}</p>
      </Card>

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 flex justify-end gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-lift backdrop-blur-md md:bottom-4">
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>{achievement ? 'Save changes' : 'Save achievement'}</Button>
      </div>
    </form>
  );
}
