/**
 * Projects ("Things I've built") and achievements ("My wins"): categories, types, statuses,
 * visibility and limits in one place. The frontend reads them through the /options endpoints;
 * icons and colours are its only own additions.
 */

/**
 * Who can see a project or achievement. Today every CampusX page needs a sign-in, so "public" and
 * "campus" reach the same students; only "public" items may ever appear on signed-out pages if
 * CampusX opens them later. "college" uses the owner's college from their profile.
 */
export const SHOWCASE_VISIBILITY = Object.freeze([
  { id: 'public', label: 'Everyone', description: 'Anyone on CampusX (and public pages, if CampusX adds them)' },
  { id: 'campus', label: 'CampusX students', description: 'Any signed-in CampusX student' },
  { id: 'college', label: 'My college', description: 'Students at your college only' },
  { id: 'private', label: 'Only me', description: 'Hidden from everyone else' },
]);
export const SHOWCASE_VISIBILITY_IDS = Object.freeze(SHOWCASE_VISIBILITY.map((option) => option.id));

// ----------------------------------------------------------------------------- projects

export const PROJECT_CATEGORIES = Object.freeze([
  { id: 'web', label: 'Web' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'ai-ml', label: 'AI / ML' },
  { id: 'data-science', label: 'Data Science' },
  { id: 'iot', label: 'IoT' },
  { id: 'cybersecurity', label: 'Cybersecurity' },
  { id: 'blockchain', label: 'Blockchain' },
  { id: 'game', label: 'Game' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'academic', label: 'Academic' },
  { id: 'other', label: 'Other' },
]);
export const PROJECT_CATEGORY_IDS = Object.freeze(PROJECT_CATEGORIES.map((category) => category.id));

export const PROJECT_STATUSES = Object.freeze([
  { id: 'idea', label: 'Idea' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'archived', label: 'Archived' },
]);
export const PROJECT_STATUS_IDS = Object.freeze(PROJECT_STATUSES.map((status) => status.id));

export const TEAM_ROLES = Object.freeze([
  { id: 'developer', label: 'Developer' },
  { id: 'designer', label: 'Designer' },
  { id: 'team-lead', label: 'Team lead' },
  { id: 'researcher', label: 'Researcher' },
  { id: 'other', label: 'Other' },
]);
export const TEAM_ROLE_IDS = Object.freeze(TEAM_ROLES.map((role) => role.id));

/** invited: added by the owner, not confirmed yet (only the owner and the invitee see it) · accepted */
export const TEAM_STATUSES = Object.freeze(['invited', 'accepted']);

/** Tech suggestions for the chips input; students can add their own (normalised to these spellings). */
export const TECH_SUGGESTIONS = Object.freeze([
  'React', 'Next.js', 'Vue', 'Angular', 'Node.js', 'Express', 'MongoDB', 'PostgreSQL', 'MySQL', 'Firebase',
  'Python', 'Django', 'Flask', 'FastAPI', 'Java', 'Spring Boot', 'C++', 'C', 'Go', 'Rust', 'TypeScript',
  'JavaScript', 'HTML & CSS', 'Tailwind CSS', 'TensorFlow', 'PyTorch', 'scikit-learn', 'OpenCV',
  'Flutter', 'React Native', 'Kotlin', 'Swift', 'Arduino', 'Raspberry Pi', 'Docker', 'AWS', 'Figma', 'Solidity',
]);

export const PROJECT_RULES = Object.freeze({
  title: { min: 3, max: 120 },
  shortDescription: { min: 10, max: 250 },
  description: { min: 20, max: 5000 },
  techStack: { max: 15, maxLength: 30 },
  team: { max: 10 },
  url: { maxLength: 300 },
  images: { max: 8 },
  pageSize: { default: 12, max: 30 },
});

// Project discovery filters (spec order); "all" plus the main categories.
export const PROJECT_FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'web', label: 'Web' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'ai-ml', label: 'AI / ML' },
  { id: 'iot', label: 'IoT' },
  { id: 'cybersecurity', label: 'Cybersecurity' },
  { id: 'data-science', label: 'Data Science' },
  { id: 'other', label: 'Other' },
]);

// ----------------------------------------------------------------------------- achievements

export const ACHIEVEMENT_TYPES = Object.freeze([
  { id: 'hackathon', label: 'Hackathon' },
  { id: 'competition', label: 'Competition' },
  { id: 'certification', label: 'Certification' },
  { id: 'award', label: 'Award' },
  { id: 'academic', label: 'Academic' },
  { id: 'workshop', label: 'Workshop' },
  { id: 'internship', label: 'Internship' },
  { id: 'open-source', label: 'Open source' },
  { id: 'event', label: 'Event' },
  { id: 'other', label: 'Other' },
]);
export const ACHIEVEMENT_TYPE_IDS = Object.freeze(ACHIEVEMENT_TYPES.map((type) => type.id));

/**
 * unverified  no proof yet (the default)
 * pending     proof submitted, waiting for a CampusX moderator
 * verified    a moderator checked the proof (never set by the student)
 * rejected    a moderator couldn't confirm it
 */
export const VERIFICATION_STATUSES = Object.freeze(['unverified', 'pending', 'verified', 'rejected']);

export const ACHIEVEMENT_FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'hackathon', label: 'Hackathons' },
  { id: 'competition', label: 'Competitions' },
  { id: 'certification', label: 'Certifications' },
  { id: 'award', label: 'Awards' },
  { id: 'academic', label: 'Academic' },
  { id: 'workshop', label: 'Workshops' },
  { id: 'internship', label: 'Internships' },
  { id: 'open-source', label: 'Open Source' },
]);

export const ACHIEVEMENT_RULES = Object.freeze({
  title: { min: 3, max: 150 },
  description: { max: 3000 },
  organization: { max: 150 },
  eventName: { max: 150 },
  rank: { max: 100 },
  skills: { max: 10, maxLength: 30 },
  url: { maxLength: 300 },
  proof: { max: 5 },
  verificationNote: { max: 300 },
  pageSize: { default: 12, max: 30 },
});
