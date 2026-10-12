import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui';
import { normaliseRollNumber } from '@/utils/onboarding';
import { getFullName } from '@/utils/string';

const Chips = ({ items, empty }) =>
  items.length > 0 ? (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item}>
          <Badge variant="primary">{item}</Badge>
        </li>
      ))}
    </ul>
  ) : (
    <span className="text-ink-muted">{empty}</span>
  );

/**
 * "Your campus identity": everything the student entered, resolved to the API's labels,
 * with an Edit link back to each step and any server-side problem shown on its row.
 */
export function OnboardingReview({ user, draft, options, fieldErrors, onEdit }) {
  const labelFor = (list, id) => list.find((item) => item.id === id)?.name;
  const interestNames = draft.interests.map((id) => labelFor(options.interests, id) ?? id);

  const rows = [
    { field: 'name', label: 'Name', value: getFullName(user) },
    { field: 'college', label: 'College', value: labelFor(options.colleges, draft.college) },
    { field: 'branch', label: 'Branch', value: labelFor(options.branches, draft.branch) },
    {
      field: 'semester',
      label: 'Semester',
      value: options.semesters.find((semester) => semester.value === draft.semester)?.label,
    },
    { field: 'rollNumber', label: 'Roll number', value: normaliseRollNumber(draft.rollNumber) },
    { field: 'interests', label: 'Interests', value: <Chips items={interestNames} /> },
    { field: 'skills', label: 'Skills', value: <Chips items={draft.skills} empty="None added (optional)" /> },
  ];

  return (
    <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {rows.map(({ field, label, value }) => {
        const error = fieldErrors[field];
        const canEdit = field !== 'name';
        return (
          <div key={field} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 px-4 py-4 sm:grid-cols-[9rem_1fr_auto] sm:px-5">
            <dt className="text-xs font-bold tracking-[0.1em] text-ink-subtle uppercase sm:pt-0.5">{label}</dt>
            <dd className="col-span-2 row-start-2 text-sm font-medium break-words text-ink sm:col-span-1 sm:col-start-2 sm:row-start-1">
              {value || <span className="text-ink-muted">Not set</span>}
              {error && (
                <p role="alert" className="mt-1.5 text-xs font-semibold text-danger-fg">
                  {error}
                </p>
              )}
            </dd>
            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit(field)}
                className="col-start-2 row-start-1 inline-flex items-center gap-1 self-start rounded-lg px-2 py-1 text-sm font-semibold text-primary hover:bg-primary-soft sm:col-start-3"
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                Edit<span className="sr-only"> {label.toLowerCase()}</span>
              </button>
            )}
          </div>
        );
      })}
    </dl>
  );
}
