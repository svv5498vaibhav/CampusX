import { Plus, X } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { PRESET_LINKS } from '@/constants/resume';
import { FieldRow, IconButton, StepIntro } from '../ResumeFields';

const errorFor = (fieldErrors, field) => fieldErrors.find((item) => item.field === field)?.message;

/** Step 3: name, headline, professional contact details and links. */
export function PersonalStep({ editor, options }) {
  const { draft, setContent, fieldErrors } = editor;
  const personal = draft.content.personal;
  const set = (patch) => setContent((content) => ({ ...content, personal: { ...content.personal, ...patch } }));
  const setLink = (index, patch) => set({ links: personal.links.map((link, position) => (position === index ? { ...link, ...patch } : link)) });
  const unused = PRESET_LINKS.filter((label) => !personal.links.some((link) => link.label.toLowerCase() === label.toLowerCase()));

  return (
    <div className="flex flex-col gap-5">
      <StepIntro title="Personal details" description="Use professional contact details. Your city is enough; never add your home address, photo, date of birth or ID numbers." />
      <FieldRow>
        <Input label="Full name" required autoComplete="name" value={personal.fullName} maxLength={120} onChange={(event) => set({ fullName: event.target.value })} error={errorFor(fieldErrors, 'content.personal.fullName') ?? (!personal.fullName.trim() ? 'Add your full name.' : undefined)} />
        <Input label="Headline" placeholder="e.g. Final-year CSE student · Full-stack developer" value={personal.headline} maxLength={120} onChange={(event) => set({ headline: event.target.value })} hint="Optional: one short line under your name." />
      </FieldRow>
      <FieldRow>
        <Input label="Email" type="email" required autoComplete="email" value={personal.email} maxLength={254} onChange={(event) => set({ email: event.target.value })} error={errorFor(fieldErrors, 'content.personal.email') ?? (!personal.email.trim() ? 'Add an email address recruiters can reach you on.' : undefined)} />
        <Input label="Phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={personal.phone} maxLength={25} onChange={(event) => set({ phone: event.target.value })} error={errorFor(fieldErrors, 'content.personal.phone')} />
      </FieldRow>
      <Input label="Location" placeholder="e.g. Nagpur, Maharashtra" value={personal.location} maxLength={120} onChange={(event) => set({ location: event.target.value })} hint="City and state only." />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold text-ink">
          Professional links <span className="font-normal text-ink-subtle">({personal.links.length}/{options.limits.links.max})</span>
        </legend>
        {personal.links.map((link, index) => (
          // Links have no ids; their position identifies them while editing.
          <div key={index} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-start gap-2">
            <Input aria-label={`Link ${index + 1} label`} placeholder="Label" value={link.label} maxLength={30} onChange={(event) => setLink(index, { label: event.target.value })} />
            <Input aria-label={`Link ${index + 1} address`} placeholder="github.com/your-username" value={link.url} maxLength={300} onChange={(event) => setLink(index, { url: event.target.value })} error={errorFor(fieldErrors, `content.personal.links[${index}].url`)} />
            <IconButton label={`Remove ${link.label || `link ${index + 1}`}`} icon={X} className="mt-1.5 size-9" onClick={() => set({ links: personal.links.filter((_, position) => position !== index) })} />
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {personal.links.length < options.limits.links.max &&
            unused.slice(0, 3).map((label) => (
              <Button key={label} variant="outline" size="sm" leftIcon={Plus} onClick={() => set({ links: [...personal.links, { label, url: '' }] })}>
                {label}
              </Button>
            ))}
          {personal.links.length < options.limits.links.max && (
            <Button variant="ghost" size="sm" leftIcon={Plus} onClick={() => set({ links: [...personal.links, { label: '', url: '' }] })}>
              Other link
            </Button>
          )}
        </div>
        <p className="text-xs text-ink-subtle">Links become clickable in the PDF. We check their format; open each one in your downloaded PDF to make sure it loads.</p>
      </fieldset>
    </div>
  );
}
