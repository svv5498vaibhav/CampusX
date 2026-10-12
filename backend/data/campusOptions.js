/**
 * The single source of onboarding options. The frontend never keeps its own copy: it reads
 * these through GET /api/v1/onboarding/options.
 *
 * Users store the stable `id`s, never the display text, so a college can be renamed without
 * touching any account. This file can later be replaced by MongoDB collections; only
 * services/campusOptionsService.js reads it.
 */

export const ONBOARDING_RULES = Object.freeze({
  interests: { min: 3, max: 8 },
  skills: { max: 15, maxLength: 30 },
  rollNumber: { maxLength: 30 },
});

// `aliases` are extra search terms students might type (old names, common abbreviations).
export const COLLEGES = Object.freeze([
  { id: 'vnit-nagpur', name: 'Visvesvaraya National Institute of Technology (VNIT) Nagpur', city: 'Nagpur', aliases: ['VNIT'] },
  { id: 'iiit-nagpur', name: 'Indian Institute of Information Technology (IIIT) Nagpur', city: 'Nagpur', aliases: ['IIIT', 'IIITN'] },
  { id: 'ramdeobaba-university', name: 'Ramdeobaba University', city: 'Nagpur', aliases: ['RBU', 'RCOEM'] },
  { id: 'ycce-nagpur', name: 'Yeshwantrao Chavan College of Engineering (YCCE)', city: 'Nagpur', aliases: ['YCCE'] },
  { id: 'ghrce-nagpur', name: 'G. H. Raisoni College of Engineering (GHRCE)', city: 'Nagpur', aliases: ['GHRCE', 'Raisoni'] },
  { id: 'svpcet-nagpur', name: 'St. Vincent Pallotti College of Engineering and Technology', city: 'Nagpur', aliases: ['Pallotti'] },
  { id: 'sit-nagpur', name: 'Symbiosis Institute of Technology (SIT) Nagpur', city: 'Nagpur', aliases: ['SIT', 'Symbiosis'] },
  { id: 'kdkce-nagpur', name: 'KDK College of Engineering', city: 'Nagpur', aliases: ['KDK'] },
  { id: 'pbcoe-nagpur', name: 'Priyadarshini Bhagwati College of Engineering', city: 'Nagpur', aliases: [] },
  { id: 'pce-nagpur', name: 'Priyadarshini College of Engineering', city: 'Nagpur', aliases: [] },
  { id: 'sbjitmr-nagpur', name: 'S. B. Jain Institute of Technology, Management and Research', city: 'Nagpur', aliases: ['SB Jain'] },
  { id: 'nagpur-institute-of-technology', name: 'Nagpur Institute of Technology (NIT)', city: 'Nagpur', aliases: ['NIT'] },
  { id: 'jdcoem-nagpur', name: 'J. D. College of Engineering and Management', city: 'Nagpur', aliases: ['JD College'] },
  { id: 'suryodaya-nagpur', name: 'Suryodaya College of Engineering & Technology', city: 'Nagpur', aliases: [] },
  { id: 'jhulelal-nagpur', name: 'Jhulelal Institute of Technology', city: 'Nagpur', aliases: [] },
  { id: 'tgpcet-nagpur', name: 'Tulsiramji Gaikwad-Patil College of Engineering and Technology', city: 'Nagpur', aliases: ['Gaikwad Patil'] },
  { id: 'anjuman-nagpur', name: 'Anjuman College of Engineering and Technology', city: 'Nagpur', aliases: [] },
  { id: 'wainganga-nagpur', name: 'Wainganga College of Engineering and Management', city: 'Nagpur', aliases: [] },
  { id: 'gwcet-nagpur', name: 'Govindrao Wanjari College of Engineering and Technology', city: 'Nagpur', aliases: ['Wanjari'] },
]);

// Default branch list. A college can later override it with its own `branchIds`.
export const BRANCHES = Object.freeze([
  { id: 'cse', name: 'Computer Science Engineering', shortName: 'CSE' },
  { id: 'it', name: 'Information Technology', shortName: 'IT' },
  { id: 'aiml', name: 'Artificial Intelligence & Machine Learning', shortName: 'AI & ML' },
  { id: 'aids', name: 'Artificial Intelligence & Data Science', shortName: 'AI & DS' },
  { id: 'entc', name: 'Electronics & Telecommunication Engineering', shortName: 'E&TC' },
  { id: 'electronics', name: 'Electronics Engineering', shortName: 'Electronics' },
  { id: 'electrical', name: 'Electrical Engineering', shortName: 'Electrical' },
  { id: 'mechanical', name: 'Mechanical Engineering', shortName: 'Mechanical' },
  { id: 'civil', name: 'Civil Engineering', shortName: 'Civil' },
  { id: 'other', name: 'Other', shortName: 'Other' },
]);

export const SEMESTER_COUNT = 8;

export const INTEREST_GROUPS = Object.freeze([
  { id: 'build', name: 'Build & code' },
  { id: 'compete', name: 'Compete & collaborate' },
  { id: 'create', name: 'Create' },
  { id: 'beyond', name: 'Beyond the classroom' },
]);

export const INTERESTS = Object.freeze([
  { id: 'web-development', name: 'Web Development', group: 'build' },
  { id: 'app-development', name: 'App Development', group: 'build' },
  { id: 'ai-ml', name: 'AI / ML', group: 'build' },
  { id: 'data-science', name: 'Data Science', group: 'build' },
  { id: 'cyber-security', name: 'Cyber Security', group: 'build' },
  { id: 'cloud-computing', name: 'Cloud Computing', group: 'build' },
  { id: 'game-development', name: 'Game Development', group: 'build' },
  { id: 'robotics', name: 'Robotics', group: 'build' },
  { id: 'competitive-programming', name: 'Competitive Programming', group: 'compete' },
  { id: 'dsa', name: 'DSA', group: 'compete' },
  { id: 'hackathons', name: 'Hackathons', group: 'compete' },
  { id: 'open-source', name: 'Open Source', group: 'compete' },
  { id: 'ui-ux-design', name: 'UI/UX Design', group: 'create' },
  { id: 'photography', name: 'Photography', group: 'create' },
  { id: 'video-editing', name: 'Video Editing', group: 'create' },
  { id: 'content-creation', name: 'Content Creation', group: 'create' },
  { id: 'startups', name: 'Startups', group: 'beyond' },
  { id: 'entrepreneurship', name: 'Entrepreneurship', group: 'beyond' },
  { id: 'sports', name: 'Sports', group: 'beyond' },
  { id: 'music', name: 'Music', group: 'beyond' },
  { id: 'other', name: 'Other', group: 'beyond' },
]);

// Suggestions only: students can also type their own skills.
export const SKILL_SUGGESTIONS = Object.freeze([
  'JavaScript', 'React', 'Node.js', 'Python', 'C++', 'Java', 'MongoDB', 'SQL', 'Git', 'UI/UX',
  'TypeScript', 'HTML & CSS', 'Express.js', 'C', 'Figma', 'Flutter', 'Docker', 'Linux',
  'DSA', 'Machine Learning', 'Cyber Security',
]);
