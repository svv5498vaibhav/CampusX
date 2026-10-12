import { branchRule, collegeRule, interestsRule, rollNumberRule, semesterRule, skillsRule } from './fieldRules.js';

// Every campus field is required during onboarding, except skills.
export const saveOnboardingRules = [
  collegeRule(),
  branchRule(),
  semesterRule(),
  rollNumberRule(),
  interestsRule(),
  skillsRule(),
];
