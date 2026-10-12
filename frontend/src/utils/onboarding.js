// Helpers for the onboarding flow. Option lists and limits always come from the API
// (GET /onboarding/options); nothing here duplicates them.

export const ONBOARDING_STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'college', label: 'College', fields: ['college'] },
  { id: 'branch', label: 'Branch', fields: ['branch'] },
  { id: 'semester', label: 'Semester', fields: ['semester'] },
  { id: 'rollNumber', label: 'Roll number', fields: ['rollNumber'] },
  { id: 'interests', label: 'Interests', fields: ['interests'] },
  { id: 'skills', label: 'Skills', fields: ['skills'] },
  { id: 'review', label: 'Review' },
];

export const stepIndexOf = (id) => ONBOARDING_STEPS.findIndex((step) => step.id === id);

/** The step where a field is edited, used to send the student back to fix a server error. */
export const stepIndexForField = (field) => ONBOARDING_STEPS.findIndex((step) => step.fields?.includes(field));

// Mirrors the API's normalisation so what the student sees matches what is stored.
export const normaliseRollNumber = (value) => value.trim().replace(/\s+/g, ' ').toUpperCase();
const ROLL_NUMBER_PATTERN = /^[A-Z0-9][A-Z0-9 ./_-]*$/;
const SKILL_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .+#&/_-]*$/u;

export const branchesForCollege = (options, collegeId) => {
  const college = options.colleges.find((item) => item.id === collegeId);
  return college?.branchIds ? options.branches.filter((branch) => college.branchIds.includes(branch.id)) : options.branches;
};

/** Quick client-side check before moving on. The API validates everything again on submit. */
export function validateStep(stepId, draft, rules) {
  switch (stepId) {
    case 'college':
      return draft.college ? '' : 'Please select your college.';
    case 'branch':
      return draft.branch ? '' : 'Please select your branch.';
    case 'semester':
      return draft.semester ? '' : 'Please select your semester.';
    case 'rollNumber': {
      const rollNumber = normaliseRollNumber(draft.rollNumber);
      if (!rollNumber) return 'Please enter your roll number.';
      if (rollNumber.length > rules.rollNumber.maxLength) {
        return `Roll number must be ${rules.rollNumber.maxLength} characters or fewer.`;
      }
      if (!ROLL_NUMBER_PATTERN.test(rollNumber)) return 'Roll number can only use letters, numbers, spaces and - / . _';
      return '';
    }
    case 'interests':
      if (draft.interests.length < rules.interests.min) return `Please choose at least ${rules.interests.min} interests.`;
      if (draft.interests.length > rules.interests.max) return `Please choose no more than ${rules.interests.max} interests.`;
      return '';
    default:
      return '';
  }
}

/** Checks one skill before it is added. Returns an error message or ''. */
export function validateSkill(skill, existingSkills, rules) {
  if (!skill) return 'Type a skill first.';
  if (skill.length > rules.skills.maxLength) return `Each skill must be ${rules.skills.maxLength} characters or fewer.`;
  if (!SKILL_PATTERN.test(skill)) return 'Skills can use letters, numbers, spaces and + # . & / - _';
  if (existingSkills.some((existing) => existing.toLowerCase() === skill.toLowerCase())) return 'You already added that skill.';
  if (existingSkills.length >= rules.skills.max) return `You can add up to ${rules.skills.max} skills.`;
  return '';
}

const searchable = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Every word of the query must appear in the college name or one of its aliases ("gh raisoni" → GHRCE). */
export function searchColleges(colleges, query) {
  const words = searchable(query).split(' ').filter(Boolean);
  if (words.length === 0) return colleges;
  return colleges.filter((college) => {
    const haystack = searchable([college.name, ...(college.aliases ?? [])].join(' '));
    const compact = haystack.replaceAll(' ', '');
    return words.every((word) => haystack.includes(word) || compact.includes(word));
  });
}
