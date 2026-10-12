import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useNavigate } from 'react-router';
import { CommunityCard } from '@/components/communities/CommunityCard';
import { RulesInput, TagInput } from '@/components/communities/CommunityFormFields';
import { Alert, Button, Input, Modal, Textarea } from '@/components/ui';
import { COMMUNITY_TYPE_STYLES, COMMUNITY_VISIBILITY_ICONS } from '@/constants/communities';
import { communityPath } from '@/constants/routes';
import { useCommunityStore } from '@/store/communityStore';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';

const STEPS = ['Details', 'Type & visibility', 'Rules & tags', 'Preview'];
const STEP_FIELDS = { name: 0, description: 0, type: 1, visibility: 1, tags: 2, rules: 2 };

const EMPTY = { name: '', description: '', type: 'student-created', visibility: 'public', tags: [], rules: [] };

/** Quick checks per step, mirroring the server (which checks everything again). */
function validateStep(step, values, rules) {
  const errors = {};
  if (step === 0) {
    const name = values.name.replace(/\s+/g, ' ').trim();
    if (name.length < rules.name.min || name.length > rules.name.max) errors.name = `Community names are ${rules.name.min}–${rules.name.max} characters.`;
    const description = values.description.trim();
    if (description.length < rules.description.min || description.length > rules.description.max) {
      errors.description = `Descriptions are ${rules.description.min}–${rules.description.max} characters.`;
    }
  }
  if (step === 2 && values.tags.length < rules.tags.min) errors.tags = `Add at least ${rules.tags.min} tag.`;
  return errors;
}

/**
 * Create a community in four short steps: details → type & visibility → rules & tags → preview.
 * The campus scope always comes from the creator's profile, shown here for clarity.
 */
export function CreateCommunityModal({ open, onClose }) {
  const navigate = useNavigate();
  const options = useCommunityStore((state) => state.options);
  const loadOptions = useCommunityStore((state) => state.loadOptions);
  const createCommunity = useCommunityStore((state) => state.createCommunity);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    if (open) {
      setStep(0);
      setValues(EMPTY);
      setErrors({});
      setFormError('');
    }
  }, [open]);

  const allowedVisibility = options?.visibilityForType[values.type] ?? [];
  const set = (field, value) => {
    setValues((current) => {
      const next = { ...current, [field]: value };
      // Changing the type keeps the visibility valid for it.
      if (field === 'type' && !(options?.visibilityForType[value] ?? []).includes(next.visibility)) {
        next.visibility = options.visibilityForType[value][0];
      }
      return next;
    });
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  // What the community will look like. The real scope (college, branch, semester) is filled in by
  // the server from the creator's profile; the preview names the level chosen.
  const preview = useMemo(() => {
    const scoped = values.visibility !== 'public';
    const level = options?.visibility.find((option) => option.id === values.visibility)?.label;
    return {
      id: 'preview',
      name: values.name.replace(/\s+/g, ' ').trim() || 'Your community',
      description: values.description.trim() || 'Your description',
      type: values.type,
      visibility: values.visibility,
      college: scoped && level ? { name: `Limited to ${level.toLowerCase()}` } : null,
      branch: null,
      semester: null,
      tags: values.tags,
      memberCount: 1,
      official: false,
      status: 'active',
      membership: { status: 'active', role: 'owner' },
    };
  }, [values, options]);

  if (!options) {
    return (
      <Modal open={open} onClose={onClose} title="Create a community" size="lg">
        <p className="text-sm text-ink-muted">Loading…</p>
      </Modal>
    );
  }

  const next = () => {
    const stepErrors = validateStep(step, values, options.rules);
    if (Object.values(stepErrors).some(Boolean)) {
      setErrors(stepErrors);
      return;
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const create = async () => {
    if (submitting) return;
    setSubmitting(true);
    setFormError('');
    try {
      const community = await createCommunity({
        name: values.name,
        description: values.description,
        type: values.type,
        visibility: values.visibility,
        tags: values.tags,
        rules: values.rules,
      });
      toast.success('Community created!');
      onClose();
      navigate(communityPath(community.id));
    } catch (error) {
      const fieldErrors = Object.fromEntries((error.errors ?? []).filter((item) => item.field).map((item) => [item.field, item.message]));
      setErrors(fieldErrors);
      setFormError(error.message);
      const firstField = Object.keys(fieldErrors)[0];
      if (firstField in STEP_FIELDS) setStep(STEP_FIELDS[firstField]);
    } finally {
      setSubmitting(false);
    }
  };

  const isLast = step === STEPS.length - 1;

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      closeOnOverlayClick={!submitting}
      title="Create a community"
      description={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" leftIcon={step > 0 ? ArrowLeft : undefined} onClick={step > 0 ? () => setStep(step - 1) : onClose} disabled={submitting}>
            {step > 0 ? 'Back' : 'Cancel'}
          </Button>
          {isLast ? (
            <Button leftIcon={Check} loading={submitting} onClick={create}>
              Create community
            </Button>
          ) : (
            <Button rightIcon={ArrowRight} onClick={next}>
              Next
            </Button>
          )}
        </>
      }
    >
      <ol className="mb-5 grid grid-cols-4 gap-1.5" aria-label="Progress">
        {STEPS.map((label, index) => (
          <li key={label} aria-current={index === step ? 'step' : undefined} className="flex flex-col gap-1.5">
            <span className={cn('h-1.5 rounded-full transition-colors', index <= step ? 'bg-primary' : 'bg-surface-muted')} />
            <span className={cn('hidden text-[11px] font-semibold sm:block', index === step ? 'text-ink' : 'text-ink-subtle')}>{label}</span>
          </li>
        ))}
      </ol>

      {formError && <Alert variant="danger" className="mb-4">{formError}</Alert>}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.16 }}>
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <Input
                label="Community name"
                value={values.name}
                maxLength={options.rules.name.max}
                placeholder="e.g. Robotics Club, CampusX Developers"
                hint={`${options.rules.name.min}–${options.rules.name.max} characters`}
                error={errors.name}
                onChange={(event) => set('name', event.target.value)}
                autoFocus
              />
              <Textarea
                label="What is it about?"
                value={values.description}
                rows={4}
                maxLength={options.rules.description.max}
                placeholder="Who should join and what will you share here?"
                hint={`${values.description.trim().length}/${options.rules.description.max} · at least ${options.rules.description.min} characters`}
                error={errors.description}
                onChange={(event) => set('description', event.target.value)}
              />
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-5">
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-ink">Type</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {options.types.map((type) => {
                    const { icon: Icon } = COMMUNITY_TYPE_STYLES[type.id];
                    const checked = values.type === type.id;
                    return (
                      <label key={type.id} className={cn('flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus', checked ? 'border-primary bg-primary-soft' : 'border-line hover:border-line-strong')}>
                        <input type="radio" name="community-type" value={type.id} checked={checked} onChange={() => set('type', type.id)} className="sr-only" />
                        <Icon className={cn('mt-0.5 size-5 shrink-0', checked ? 'text-primary-soft-fg' : 'text-ink-subtle')} aria-hidden="true" />
                        <span>
                          <span className="block text-sm font-semibold text-ink">{type.label}</span>
                          <span className="block text-xs text-ink-muted">{type.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-ink">Who can join?</legend>
                <div className="flex flex-col gap-2">
                  {options.visibility.filter((option) => allowedVisibility.includes(option.id)).map((option) => {
                    const Icon = COMMUNITY_VISIBILITY_ICONS[option.id];
                    const checked = values.visibility === option.id;
                    return (
                      <label key={option.id} className={cn('flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus', checked ? 'border-primary bg-primary-soft' : 'border-line hover:border-line-strong')}>
                        <input type="radio" name="community-visibility" value={option.id} checked={checked} onChange={() => set('visibility', option.id)} className="sr-only" />
                        <Icon className={cn('size-4 shrink-0', checked ? 'text-primary-soft-fg' : 'text-ink-subtle')} aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink">{option.label}</span>
                          <span className="block text-xs text-ink-muted">{option.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-ink-subtle">
                  Campus, branch and class come from your own profile, so a community can only be limited to your college, branch and semester.
                </p>
                {errors.visibility && <p role="alert" className="mt-1.5 text-xs font-medium text-danger-fg">{errors.visibility}</p>}
              </fieldset>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-5">
              <TagInput tags={values.tags} onChange={(tags) => set('tags', tags)} max={options.rules.tags.max} maxLength={options.rules.tags.maxLength} error={errors.tags} />
              <RulesInput rules={values.rules} onChange={(rules) => set('rules', rules)} max={options.rules.rules.max} maxLength={options.rules.rules.maxLength} error={errors.rules} />
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-ink-muted">This is how students will see it. You'll be its owner, and you can add an icon and cover once it's created.</p>
              <div className="mx-auto w-full max-w-xs">
                <CommunityCard community={preview} preview headingLevel="h3" />
              </div>
              {values.rules.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-ink">Rules</h3>
                  <ol className="mt-1.5 list-decimal pl-5 text-sm text-ink-muted">
                    {values.rules.map((rule, index) => <li key={`${index}-${rule}`}>{rule}</li>)}
                  </ol>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}
