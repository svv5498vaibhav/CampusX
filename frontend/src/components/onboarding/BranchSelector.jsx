import { ChoiceCard } from './ChoiceCard';

/** Branch options for the chosen college (the API decides which branches apply). */
export function BranchSelector({ branches, value, onChange, describedBy }) {
  return (
    <fieldset aria-describedby={describedBy}>
      <legend className="sr-only">Branch</legend>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {branches.map((branch) => (
          <ChoiceCard
            key={branch.id}
            name="branch"
            value={branch.id}
            checked={value === branch.id}
            onChange={onChange}
            title={branch.name}
          />
        ))}
      </div>
    </fieldset>
  );
}
