import { ChipInput } from '@/components/common/ChipInput';
import { Input, Textarea } from '@/components/ui';
import { BLANK } from '@/utils/resume/content';
import { AiAssistButton, AiUnavailableNote } from '../AiAssist';
import { BulletEditor, FieldRow, ItemList, MonthYearField, StepIntro } from '../ResumeFields';

const errorFor = (fieldErrors, field) => fieldErrors.find((item) => item.field === field)?.message;

/** Step 6: projects, with links, tech stack and bullet points (the AI assistant can rewrite them). */
export function ProjectsStep({ editor, options, resumeId, focusItemId }) {
  const { draft, setContent, fieldErrors, save } = editor;
  const { projects } = draft.content;
  const limits = options.limits.projects;
  return (
    <div className="flex flex-col gap-5">
      <StepIntro title="Projects" description="For students, projects are the strongest proof of skill. Say what you built, how you built it, and what it does. Course, personal and hackathon projects all count." />
      <AiUnavailableNote ai={options.ai} />
      <ItemList
        testId="projects-list"
        openId={focusItemId}
        items={projects}
        onChange={(items) => setContent((content) => ({ ...content, projects: items }))}
        newItem={BLANK.projects}
        addLabel="Add project"
        itemNoun="project"
        max={limits.max}
        emptyText="No projects yet. Import them from CampusX or add one here."
        title={(item) => item.name}
        renderItem={(item, update) => {
          const index = projects.findIndex((entry) => entry.id === item.id);
          const field = (name) => errorFor(fieldErrors, `content.projects[${index}].${name}`);
          const description = [item.summary, ...item.bullets].filter((text) => text.trim()).join('\n');
          return (
            <div className="flex flex-col gap-4">
              <FieldRow>
                <Input label="Project name" required value={item.name} maxLength={120} onChange={(event) => update({ name: event.target.value })} error={field('name')} />
                <Input label="Your role" placeholder="e.g. Team lead, Backend developer" value={item.role} maxLength={60} onChange={(event) => update({ role: event.target.value })} hint="Optional." />
              </FieldRow>
              <ChipInput label="Tech stack" values={item.tech} onChange={(values) => update({ tech: values })} max={limits.tech} maxLength={40} suggestions={options.skillSuggestions} placeholder="e.g. React" />
              <FieldRow>
                <Input label="Code link" placeholder="github.com/you/project" value={item.github} maxLength={300} onChange={(event) => update({ github: event.target.value })} error={field('github')} />
                <Input label="Live demo link" placeholder="project.vercel.app" value={item.live} maxLength={300} onChange={(event) => update({ live: event.target.value })} error={field('live')} />
              </FieldRow>
              <FieldRow>
                <MonthYearField label="Started" value={item.startDate} onChange={(value) => update({ startDate: value })} error={field('startDate')} />
                <MonthYearField label="Finished" value={item.endDate} onChange={(value) => update({ endDate: value })} allowPresent presentLabel="Ongoing" error={field('endDate')} />
              </FieldRow>
              <Textarea label="One-line description" rows={2} value={item.summary} maxLength={600} onChange={(event) => update({ summary: event.target.value.replace(/\n/g, ' ') })} placeholder="What it is and who it is for." />
              <BulletEditor
                items={item.bullets}
                onChange={(values) => update({ bullets: values })}
                max={limits.bullets}
                placeholder="Start with a verb: Built, Designed, Implemented…"
                hint="Two to four points: what you did, how, and what it achieved. Only include results you can back up."
                actions={
                  <AiAssistButton
                    ai={options.ai}
                    resumeId={resumeId}
                    kind="bullets"
                    title={`Bullet points for ${item.name || 'this project'}`}
                    disabled={!description}
                    beforeRequest={save}
                    request={() => ({ task: 'bullets', text: description, itemId: item.id })}
                    onAccept={(bullets) => update({ bullets })}
                  />
                }
              />
            </div>
          );
        }}
      />
    </div>
  );
}
