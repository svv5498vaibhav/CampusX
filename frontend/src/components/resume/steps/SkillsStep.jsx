import { ChipInput } from '@/components/common/ChipInput';
import { Input } from '@/components/ui';
import { BLANK } from '@/utils/resume/content';
import { ItemList, StepIntro } from '../ResumeFields';

const SUGGESTED_GROUPS = ['Languages', 'Frameworks & Libraries', 'Databases', 'Tools & Platforms', 'Soft Skills'];

/** Step 5: skills in named groups (Languages, Frameworks, Tools ...). */
export function SkillsStep({ editor, options, focusItemId }) {
  const { draft, setContent } = editor;
  const { skills } = draft.content;
  const limits = options.limits.skills;
  const total = skills.reduce((sum, group) => sum + group.items.length, 0);
  const usedLabels = new Set(skills.map((group) => group.label.toLowerCase()));
  return (
    <div className="flex flex-col gap-5">
      <StepIntro title="Technical skills" description="List only skills you can use and talk about in an interview. No ratings or progress bars: recruiters and screening systems read plain names best." />
      <p className="text-sm text-ink-muted" aria-live="polite">
        {total} {total === 1 ? 'skill' : 'skills'} in {skills.length} {skills.length === 1 ? 'group' : 'groups'}
      </p>
      <ItemList
        testId="skills-list"
        openId={focusItemId}
        items={skills}
        onChange={(items) => setContent((content) => ({ ...content, skills: items }))}
        newItem={() => ({ ...BLANK.skills(), label: SUGGESTED_GROUPS.find((label) => !usedLabels.has(label.toLowerCase())) ?? '' })}
        addLabel="Add skill group"
        itemNoun="skill group"
        max={limits.groups}
        emptyText="No skills yet. Import your CampusX profile, or add a group such as “Languages”."
        title={(group) => (group.label ? `${group.label} (${group.items.length})` : '')}
        renderItem={(group, update) => (
          <div className="flex flex-col gap-4">
            <Input label="Group name" list="resume-skill-groups" value={group.label} maxLength={40} placeholder="e.g. Languages" onChange={(event) => update({ label: event.target.value })} />
            <ChipInput label="Skills" values={group.items} onChange={(values) => update({ items: values })} max={limits.items} maxLength={limits.itemLength} suggestions={options.skillSuggestions} placeholder="Type a skill and press Enter" />
          </div>
        )}
      />
      <datalist id="resume-skill-groups">
        {SUGGESTED_GROUPS.map((label) => <option key={label} value={label} />)}
      </datalist>
    </div>
  );
}
