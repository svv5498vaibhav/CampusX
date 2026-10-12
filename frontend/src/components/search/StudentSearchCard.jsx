import { Link } from 'react-router';
import { Avatar, Badge, Button } from '@/components/ui';
import { searchResultPath } from '@/constants/search';
import { getFullName } from '@/utils/string';

/**
 * A student in search results: photo, name, college, branch • semester and top skills. Public profile
 * details only (never an email or roll number). "View Profile" is the only action: CampusX has no
 * connection requests. Discover adds a recommendation `reason` and a `menu` (both optional).
 */
export function StudentSearchCard({ student, headingLevel = 'h3', reason, menu }) {
  const Heading = headingLevel;
  const name = getFullName(student);
  const path = searchResultPath('students', student);
  const campusLine = [student.branch?.shortName, student.semester?.label].filter(Boolean).join(' • ');

  return (
    <article className="flex h-full flex-col rounded-3xl border border-line bg-surface p-4 shadow-soft transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-lift" data-search-result="student" data-student-id={student.id}>
      <div className="flex items-start gap-3">
        <Link to={path} tabIndex={-1} aria-hidden="true" className="shrink-0 rounded-full">
          <Avatar src={student.avatarUrl} name={name} size="lg" shape="circle" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Heading className="truncate font-display text-base leading-snug font-bold text-ink">
              <Link to={path} className="hover:underline">{name}</Link>
            </Heading>
            {student.isYou && <Badge variant="primary" className="px-2 py-0.5 text-[11px]">You</Badge>}
          </div>
          {student.college && <p className="truncate text-sm text-ink-muted" title={student.college.name}>{student.college.name}</p>}
          {campusLine && <p className="text-xs font-semibold text-ink-muted">{campusLine}</p>}
        </div>
        {menu && <div className="-mt-1.5 -mr-2 shrink-0">{menu}</div>}
      </div>

      {student.skills?.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1" aria-label="Top skills">
          {student.skills.slice(0, 4).map((skill) => (
            <li key={skill} className="rounded-md bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary-soft-fg">{skill}</li>
          ))}
          {student.skills.length > 4 && <li className="px-1 text-[11px] text-ink-subtle">+{student.skills.length - 4}</li>}
        </ul>
      )}

      {reason && <div className="mt-3">{reason}</div>}

      <div className="mt-auto pt-4">
        <Button as={Link} to={path} variant="outline" size="sm" fullWidth aria-label={`View ${name}'s profile`}>
          View Profile
        </Button>
      </div>
    </article>
  );
}
