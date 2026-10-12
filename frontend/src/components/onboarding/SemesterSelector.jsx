import { ChoiceCard } from './ChoiceCard';

/** Eight large tiles. Stores the number (7); shows the API's label ("7th Semester"). */
export function SemesterSelector({ semesters, value, onChange, describedBy }) {
  return (
    <fieldset aria-describedby={describedBy}>
      <legend className="sr-only">Semester</legend>
      <div className="grid grid-cols-4 gap-2.5">
        {semesters.map((semester) => (
          <ChoiceCard
            key={semester.value}
            variant="tile"
            name="semester"
            value={semester.value}
            checked={value === semester.value}
            onChange={(selected) => onChange(Number(selected))}
            title={semester.value}
            description={semester.label}
          />
        ))}
      </div>
    </fieldset>
  );
}
