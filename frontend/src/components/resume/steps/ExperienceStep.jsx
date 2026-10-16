import { Plus } from 'lucide-react';
import { Alert, Button, Input, Textarea } from '@/components/ui';
import { BLANK } from '@/utils/resume/content';
import { AiAssistButton, AiUnavailableNote } from '../AiAssist';
import { BulletEditor, FieldRow, ItemList, MonthYearField, StepIntro, SubSection } from '../ResumeFields';

const errorFor = (fieldErrors, field) => fieldErrors.find((item) => item.field === field)?.message;

/**
 * Step 7: internships and work, achievements, certifications, volunteering and up to two sections of the
 * student's own. Everything here is optional; freshers don't need employment history.
 */
export function ExperienceStep({ editor, options, resumeId, focusItemId }) {
  const { draft, setContent, fieldErrors, save } = editor;
  const content = draft.content;
  const limits = options.limits;
  const setList = (key) => (items) => setContent((current) => ({ ...current, [key]: items }));
  const fieldError = (list, item, name) => errorFor(fieldErrors, `content.${list}[${content[list].findIndex((entry) => entry.id === item.id)}].${name}`);

  return (
    <div className="flex flex-col gap-8">
      <StepIntro title="Experience & achievements" description="All optional. Add what you genuinely have; empty sections are left off the resume." />
      <Alert variant="info" title="No work experience? That’s completely fine.">
        Freshers and internship applicants are judged on education, projects, skills and achievements. Leave Experience empty and it won’t appear.
      </Alert>
      <AiUnavailableNote ai={options.ai} />

      <SubSection id="experience-heading" title="Internships & work experience">
        <ItemList
          testId="experience-list"
          openId={focusItemId}
          items={content.experience}
          onChange={setList('experience')}
          newItem={BLANK.experience}
          addLabel="Add internship or job"
          itemNoun="experience entry"
          max={limits.experience.max}
          title={(item) => [item.role, item.organization].filter(Boolean).join(' at ')}
          renderItem={(item, update) => (
            <div className="flex flex-col gap-4">
              <FieldRow>
                <Input label="Role" placeholder="e.g. Web Development Intern" value={item.role} maxLength={120} onChange={(event) => update({ role: event.target.value })} />
                <Input label="Organisation" value={item.organization} maxLength={200} onChange={(event) => update({ organization: event.target.value })} />
              </FieldRow>
              <Input label="Location" placeholder="e.g. Pune or Remote" value={item.location} maxLength={120} onChange={(event) => update({ location: event.target.value })} />
              <FieldRow>
                <MonthYearField label="Started" value={item.startDate} onChange={(value) => update({ startDate: value })} error={fieldError('experience', item, 'startDate')} />
                <MonthYearField label="Ended" value={item.endDate} onChange={(value) => update({ endDate: value })} allowPresent error={fieldError('experience', item, 'endDate')} />
              </FieldRow>
              <BulletEditor
                items={item.bullets}
                onChange={(values) => update({ bullets: values })}
                max={limits.experience.bullets}
                placeholder="What you did and what came of it"
                actions={
                  <AiAssistButton
                    ai={options.ai}
                    resumeId={resumeId}
                    kind="bullets"
                    title={`Bullet points for ${item.role || 'this role'}`}
                    disabled={!item.bullets.some((text) => text.trim())}
                    beforeRequest={save}
                    request={() => ({ task: 'bullets', text: item.bullets.filter((text) => text.trim()).join('\n'), itemId: item.id })}
                    onAccept={(bullets) => update({ bullets })}
                  />
                }
              />
            </div>
          )}
        />
      </SubSection>

      <SubSection id="achievements-heading" title="Achievements" description="Hackathons, competitions, awards, scholarships, rankings.">
        <ItemList
          testId="achievements-list"
          openId={focusItemId}
          items={content.achievements}
          onChange={setList('achievements')}
          newItem={BLANK.achievements}
          addLabel="Add achievement"
          itemNoun="achievement"
          max={limits.achievements.max}
          title={(item) => item.title}
          renderItem={(item, update) => (
            <div className="flex flex-col gap-4">
              <Input label="Achievement" placeholder="e.g. Smart India Hackathon 2025, finalist" value={item.title} maxLength={200} onChange={(event) => update({ title: event.target.value })} />
              <FieldRow>
                <Input label="Event or organisation" value={item.organization} maxLength={200} onChange={(event) => update({ organization: event.target.value })} />
                <MonthYearField label="Date" value={item.date} onChange={(value) => update({ date: value })} error={fieldError('achievements', item, 'date')} />
              </FieldRow>
              <Textarea label="Details" rows={2} value={item.description} maxLength={600} onChange={(event) => update({ description: event.target.value.replace(/\n/g, ' ') })} hint="Optional: one sentence on what you did." />
            </div>
          )}
        />
      </SubSection>

      <SubSection id="certifications-heading" title="Certifications" description="Courses and certificates with a credential you can show.">
        <ItemList
          testId="certifications-list"
          openId={focusItemId}
          items={content.certifications}
          onChange={setList('certifications')}
          newItem={BLANK.certifications}
          addLabel="Add certification"
          itemNoun="certification"
          max={limits.certifications.max}
          title={(item) => item.name}
          renderItem={(item, update) => (
            <div className="flex flex-col gap-4">
              <FieldRow>
                <Input label="Certificate" value={item.name} maxLength={200} onChange={(event) => update({ name: event.target.value })} />
                <Input label="Issued by" value={item.issuer} maxLength={120} onChange={(event) => update({ issuer: event.target.value })} />
              </FieldRow>
              <FieldRow>
                <MonthYearField label="Date" value={item.date} onChange={(value) => update({ date: value })} error={fieldError('certifications', item, 'date')} />
                <Input label="Credential link" value={item.url} maxLength={300} onChange={(event) => update({ url: event.target.value })} error={fieldError('certifications', item, 'url')} />
              </FieldRow>
            </div>
          )}
        />
      </SubSection>

      <SubSection id="volunteering-heading" title="Volunteering & leadership" description="Clubs, societies, NSS/NCC, event teams, mentoring.">
        <ItemList
          testId="volunteering-list"
          openId={focusItemId}
          items={content.volunteering}
          onChange={setList('volunteering')}
          newItem={BLANK.volunteering}
          addLabel="Add volunteering"
          itemNoun="entry"
          max={limits.volunteering.max}
          title={(item) => [item.role, item.organization].filter(Boolean).join(', ')}
          renderItem={(item, update) => (
            <div className="flex flex-col gap-4">
              <FieldRow>
                <Input label="Role" value={item.role} maxLength={120} onChange={(event) => update({ role: event.target.value })} />
                <Input label="Organisation" value={item.organization} maxLength={200} onChange={(event) => update({ organization: event.target.value })} />
              </FieldRow>
              <FieldRow>
                <MonthYearField label="Started" value={item.startDate} onChange={(value) => update({ startDate: value })} />
                <MonthYearField label="Ended" value={item.endDate} onChange={(value) => update({ endDate: value })} allowPresent />
              </FieldRow>
              <BulletEditor items={item.bullets} onChange={(values) => update({ bullets: values })} max={limits.volunteering.bullets} />
            </div>
          )}
        />
      </SubSection>

      <SubSection id="custom-heading" title="Your own sections" description="For anything else that is true and relevant: languages spoken, publications, interests.">
        {content.custom.map((section, index) => (
          <div key={section.id} className="flex flex-col gap-3 rounded-2xl border border-line p-4">
            <div className="flex items-end gap-2">
              <Input containerClassName="flex-1" label={`Section ${index + 1} title`} value={section.title} maxLength={40} placeholder="e.g. Languages" onChange={(event) => setContent((current) => ({ ...current, custom: current.custom.map((item) => (item.id === section.id ? { ...item, title: event.target.value } : item)) }))} />
              <Button variant="ghost" onClick={() => setContent((current) => ({ ...current, custom: current.custom.filter((item) => item.id !== section.id) }))}>
                Remove section
              </Button>
            </div>
            <ItemList
              items={section.items}
              onChange={(items) => setContent((current) => ({ ...current, custom: current.custom.map((item) => (item.id === section.id ? { ...item, items } : item)) }))}
              newItem={BLANK.customItem}
              addLabel="Add entry"
              max={limits.custom.items}
              title={(item) => item.title}
              renderItem={(item, update) => (
                <div className="flex flex-col gap-4">
                  <FieldRow>
                    <Input label="Title" value={item.title} maxLength={200} onChange={(event) => update({ title: event.target.value })} />
                    <Input label="Subtitle" value={item.subtitle} maxLength={200} onChange={(event) => update({ subtitle: event.target.value })} />
                  </FieldRow>
                  <Input label="Date or period" placeholder="e.g. 2024 or Since 2022" value={item.date} maxLength={40} onChange={(event) => update({ date: event.target.value })} />
                  <BulletEditor items={item.bullets} onChange={(values) => update({ bullets: values })} max={limits.custom.bullets} />
                </div>
              )}
            />
          </div>
        ))}
        {content.custom.length < limits.custom.sections && (
          <Button variant="outline" leftIcon={Plus} className="self-start" onClick={() => setContent((current) => ({ ...current, custom: [...current.custom, BLANK.custom()] }))}>
            Add a section of your own
          </Button>
        )}
      </SubSection>
    </div>
  );
}
