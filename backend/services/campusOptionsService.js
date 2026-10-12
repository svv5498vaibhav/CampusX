import {
  BRANCHES,
  COLLEGES,
  INTEREST_GROUPS,
  INTERESTS,
  ONBOARDING_RULES,
  SEMESTER_COUNT,
  SKILL_SUGGESTIONS,
} from '../data/campusOptions.js';

/*
 * The only module that reads data/campusOptions.js. Lookups are async so that moving
 * colleges, branches or interests into MongoDB later changes nothing outside this file.
 */

const ordinal = (n) => {
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n] ?? 'th';
  return `${n}${suffix}`;
};

const SEMESTERS = Object.freeze(
  Array.from({ length: SEMESTER_COUNT }, (_, index) => ({
    value: index + 1,
    label: `${ordinal(index + 1)} Semester`,
  })),
);

const collegesById = new Map(COLLEGES.map((college) => [college.id, college]));
const branchesById = new Map(BRANCHES.map((branch) => [branch.id, branch]));
const interestsById = new Map(INTERESTS.map((interest) => [interest.id, interest]));
const skillSuggestionsByKey = new Map(SKILL_SUGGESTIONS.map((skill) => [skill.toLowerCase(), skill]));

export const onboardingRules = ONBOARDING_RULES;

export async function getCollege(collegeId) {
  return collegesById.get(collegeId) ?? null;
}

/** Branches offered by a college. Every college uses the default list until it defines its own. */
export async function listBranches(collegeId) {
  const college = collegesById.get(collegeId);
  if (!college?.branchIds) return BRANCHES;
  return BRANCHES.filter((branch) => college.branchIds.includes(branch.id));
}

export const isValidSemester = (value) => Number.isInteger(value) && value >= 1 && value <= SEMESTER_COUNT;

export async function isKnownInterest(interestId) {
  return interestsById.has(interestId);
}

export async function getBranch(branchId) {
  return branchesById.get(branchId) ?? null;
}

export async function getInterest(interestId) {
  return interestsById.get(interestId) ?? null;
}

export const getSemester = (value) => SEMESTERS.find((semester) => semester.value === value) ?? null;

/** "react" → "React" when it matches a suggestion; otherwise the student's own spelling is kept. */
export const canonicalSkillName = (skill) => skillSuggestionsByKey.get(skill.toLowerCase()) ?? skill;

/** Everything the onboarding screens need, in one response. */
export async function getOnboardingOptions() {
  return {
    // branchIds appears only for colleges with their own branch list (none yet).
    colleges: COLLEGES.map(({ id, name, city, aliases, branchIds }) => ({ id, name, city, aliases, branchIds })),
    branches: BRANCHES,
    semesters: SEMESTERS,
    interestGroups: INTEREST_GROUPS,
    interests: INTERESTS,
    skillSuggestions: SKILL_SUGGESTIONS,
    rules: ONBOARDING_RULES,
  };
}
