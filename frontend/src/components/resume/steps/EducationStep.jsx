import { ChipInput } from '@/components/common/ChipInput';
import { Input } from '@/components/ui';
import { BLANK } from '@/utils/resume/content';
import { BulletEditor, FieldRow, ItemList, MonthYearField, StepIntro, SubSection } from '../ResumeFields';

const errorFor = (fieldErrors, field) => fieldErrors.find((item) => item.field === field)?.message;

/** Step 4: education entries and the resume's relevant coursework. */
export function EducationStep({ editor, options, focusItemId }) {
  const { draft, setContent, fieldErrors } = editor;
  const { education, coursework } = draft.content;
  const limits = options.limits;
  return (
    <div className="flex flex-col gap-6">
      <StepIntro title="Education" description="List your current degree first. For a course in progress, choose the month you expect to graduate; it shows as “Expected”." />
      <ItemList
        testId="education-list"
        openId={focusItemId}
        items={education}
        onChange={(items) => setContent((content) => ({ ...content, education: items }))}
        newItem={BLANK.education}
        addLabel="Add education"
        itemNoun="education entry"
        max={limits.education.max}
        emptyText="No education yet. Add your college (Import CampusX Profile fills it in)."
        title={(item) => [item.degree, item.institution].filter(Boolean).join(', ')}
        renderItem={(item, update) => {
          const index = education.findIndex((entry) => entry.id === item.id);
          const field = (name) => errorFor(fieldErrors, `content.education[${index}].${name}`);
          return (
            <div className="flex flex-col gap-4">
              <Input label="College or school" required value={item.institution} maxLength={200} onChange={(event) => update({ institution: event.target.value })} error={field('institution')} />
              <FieldRow>
                <Input label="Degree" placeholder="e.g. B.Tech, B.E., Diploma, Class XII" value={item.degree} maxLength={120} onChange={(event) => update({ degree: event.target.value })} />
                <Input label="Field of study" placeholder="e.g. Computer Science Engineering" value={item.field} maxLength={120} onChange={(event) => update({ field: event.target.value })} />
              </FieldRow>
              <FieldRow>
                <Input label="Location" value={item.location} maxLength={120} onChange={(event) => update({ location: event.target.value })} />
                <Input label="CGPA or percentage" placeholder="e.g. CGPA 8.4/10 or 86%" value={item.score} maxLength={60} onChange={(event) => update({ score: event.target.value })} hint="Optional. Write it exactly as on your marksheet." />
              </FieldRow>
              <FieldRow>
                <MonthYearField label="Start" value={item.startDate} onChange={(value) => update({ startDate: value })} error={field('startDate')} />
                <MonthYearField label="Graduation (or expected)" value={item.endDate} onChange={(value) => update({ endDate: value })} error={field('endDate')} />
              </FieldRow>
              <ChipInput label="Coursework for this degree" values={item.coursework} onChange={(values) => update({ coursework: values })} max={limits.education.coursework} maxLength={80} placeholder="e.g. Operating Systems" hint="Optional. Shown under this entry." />
              <BulletEditor label="Highlights" items={item.details} onChange={(values) => update({ details: values })} max={limits.education.details} placeholder="e.g. Class representative, 2024–25" hint="Optional: academic honours, thesis, positions." />
            </div>
          );
        }}
      />
      <SubSection id="coursework-heading" title="Relevant coursework" description="Its own section on the resume: subjects and completed learning that matter for the role.">
        <ChipInput label="Courses" values={coursework} onChange={(values) => setContent((content) => ({ ...content, coursework: values }))} max={limits.coursework.max} maxLength={limits.coursework.itemLength} placeholder="e.g. Data Structures and Algorithms" />
      </SubSection>
    </div>
  );
}
