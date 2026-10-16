/**
 * Resume Builder: templates, target roles, sections, limits and the word lists the importer and the
 * resume checker use, in one place. The frontend reads these through GET /api/v1/resumes/options; it
 * owns only the drawing code of each template (frontend/src/utils/resume/templates).
 *
 * Resumes are private to their owner. Nothing in this feature is shown on a profile, in search, in
 * recommendations or to staff; only the signed-in student's own requests read or change them.
 */

// ----------------------------------------------------------------------------- limits

/**
 * Item limits keep the largest possible resume under the API's request screening (500 JSON keys per
 * body, config/securityConfig.js REQUEST_RULES) with room to spare: every list below at its maximum,
 * with every field filled, is about 470 keys.
 */
export const RESUME_LIMITS = Object.freeze({
  perStudent: 20,
  name: { min: 1, max: 80 },
  customRole: { max: 60 },
  text: { short: 120, medium: 200, long: 400 },
  summary: { max: 1200 },
  url: { max: 300 },
  email: { max: 254 },
  phone: { max: 25 },
  links: { max: 5 },
  education: { max: 5, coursework: 12, details: 4 },
  skills: { groups: 8, items: 25, itemLength: 40 },
  projects: { max: 8, tech: 12, bullets: 6 },
  experience: { max: 6, bullets: 6 },
  achievements: { max: 10 },
  certifications: { max: 10 },
  volunteering: { max: 4, bullets: 4 },
  coursework: { max: 16, itemLength: 80 },
  custom: { sections: 2, items: 6, bullets: 4 },
  bullet: { max: 400 },
  description: { max: 600 },
  jobDescription: { max: 8000 },
  aiText: { max: 3000 },
});

export const RESUME_RATE_LIMITS = Object.freeze({
  // Autosave writes every few seconds while a student types, so this is generous.
  writes: { windowMinutes: 10, max: 400, message: 'You are saving very quickly. Please wait a moment and try again.' },
  analyze: { windowMinutes: 10, max: 60, message: 'You have checked your resume many times in a short while. Please wait a few minutes.' },
  ai: { windowMinutes: 60, max: 30, message: 'You have used the AI assistant a lot this hour. Please try again later.' },
});

// ----------------------------------------------------------------------------- target roles

/**
 * `keywords` feed the checker's role hints (never added to a resume automatically). `template` is the
 * template a new resume for the role starts with.
 */
export const TARGET_ROLES = Object.freeze([
  { id: 'software-developer', label: 'Software Developer', template: 'software-developer-fresher', keywords: ['Data Structures', 'Algorithms', 'OOP', 'Git', 'SQL', 'Problem Solving'] },
  { id: 'full-stack-developer', label: 'Full-Stack Developer', template: 'software-developer-fresher', keywords: ['JavaScript', 'React', 'Node.js', 'REST APIs', 'MongoDB', 'SQL', 'Git'] },
  { id: 'frontend-developer', label: 'Frontend Developer', template: 'modern-graduate', keywords: ['HTML', 'CSS', 'JavaScript', 'React', 'Responsive Design', 'Accessibility'] },
  { id: 'backend-developer', label: 'Backend Developer', template: 'software-developer-fresher', keywords: ['REST APIs', 'Databases', 'SQL', 'Node.js', 'Java', 'Python', 'Docker'] },
  { id: 'data-analyst', label: 'Data Analyst', template: 'modern-graduate', keywords: ['SQL', 'Excel', 'Python', 'Pandas', 'Data Visualization', 'Statistics', 'Power BI', 'Tableau'] },
  { id: 'ai-ml', label: 'AI / ML Engineer', template: 'academic-achievement', keywords: ['Python', 'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'scikit-learn', 'NumPy', 'Pandas'] },
  { id: 'internship', label: 'Internship', template: 'internship-applicant', keywords: ['Projects', 'Teamwork', 'Communication', 'Git'] },
  { id: 'fresher', label: 'Fresher (entry level)', template: 'fresher-ats-classic', keywords: ['Projects', 'Problem Solving', 'Teamwork', 'Communication'] },
  { id: 'custom', label: 'Custom role', template: 'fresher-ats-classic', keywords: [] },
]);
export const TARGET_ROLE_IDS = Object.freeze(TARGET_ROLES.map((role) => role.id));

// ----------------------------------------------------------------------------- sections

/** Every section a resume can have. `custom-1` and `custom-2` are the student's own sections. */
export const RESUME_SECTIONS = Object.freeze([
  { key: 'summary', label: 'Summary', title: 'Professional Summary' },
  { key: 'education', label: 'Education', title: 'Education' },
  { key: 'skills', label: 'Skills', title: 'Technical Skills' },
  { key: 'projects', label: 'Projects', title: 'Projects' },
  { key: 'experience', label: 'Experience', title: 'Experience' },
  { key: 'achievements', label: 'Achievements', title: 'Achievements' },
  { key: 'certifications', label: 'Certifications', title: 'Certifications' },
  { key: 'coursework', label: 'Coursework', title: 'Relevant Coursework' },
  { key: 'volunteering', label: 'Volunteering', title: 'Volunteering & Leadership' },
  { key: 'custom-1', label: 'Custom section 1', title: 'Additional Information' },
  { key: 'custom-2', label: 'Custom section 2', title: 'Interests' },
]);
export const RESUME_SECTION_KEYS = Object.freeze(RESUME_SECTIONS.map((section) => section.key));
export const SECTION_TITLE_MAX = 40;

/** The two names a student can give the summary section. */
export const SUMMARY_TITLES = Object.freeze(['Professional Summary', 'Career Objective']);

// ----------------------------------------------------------------------------- templates

/**
 * Print-safe accents: every one has at least 4.5:1 contrast on white for text, and prints clearly in
 * black and white. `ink` is the plain black option.
 */
export const RESUME_ACCENTS = Object.freeze([
  { id: 'ink', label: 'Classic black', hex: '#111827' },
  { id: 'green', label: 'Campus green', hex: '#166534' },
  { id: 'blue', label: 'Professional blue', hex: '#1d4ed8' },
  { id: 'teal', label: 'Deep teal', hex: '#0f766e' },
  { id: 'navy', label: 'Navy', hex: '#1e3a8a' },
  { id: 'maroon', label: 'Maroon', hex: '#9f1239' },
  { id: 'slate', label: 'Slate', hex: '#334155' },
  { id: 'purple', label: 'Royal purple', hex: '#6d28d9' },
]);
export const RESUME_ACCENT_IDS = Object.freeze(RESUME_ACCENTS.map((accent) => accent.id));

export const RESUME_FONTS = Object.freeze([
  { id: 'sans', label: 'Clean sans-serif (Helvetica)' },
  { id: 'serif', label: 'Classic serif (Times)' },
]);
export const RESUME_FONT_IDS = Object.freeze(RESUME_FONTS.map((font) => font.id));

export const RESUME_DENSITIES = Object.freeze([
  { id: 'compact', label: 'Compact' },
  { id: 'standard', label: 'Standard' },
  { id: 'relaxed', label: 'Relaxed' },
]);
export const RESUME_DENSITY_IDS = Object.freeze(RESUME_DENSITIES.map((density) => density.id));

export const PAGE_MODES = Object.freeze([
  { id: 'multi', label: 'As many pages as needed' },
  { id: 'one', label: 'Fit on one page (when possible)' },
]);
export const PAGE_MODE_IDS = Object.freeze(PAGE_MODES.map((mode) => mode.id));

export const TEMPLATE_CATEGORIES = Object.freeze([
  { id: 'fresher', label: 'Fresher & Internship Templates', description: 'Built for students, recent graduates and internship applicants: education, projects and skills come first, and no work history is needed.' },
  { id: 'general', label: 'General Templates', description: 'Classic layouts for any role, once you have more experience to show.' },
]);

const DEFAULT_ORDER = ['summary', 'education', 'skills', 'projects', 'experience', 'certifications', 'achievements', 'coursework', 'volunteering', 'custom-1', 'custom-2'];

/**
 * `accents` lists the accents a template offers (the first is its default); a template with only `ink`
 * stays black and white. `fonts` likewise. `ats` is shown to students as a plain fact about the layout
 * (single column, real text, no graphics in place of words), never as a promise about any ATS.
 */
export const RESUME_TEMPLATES = Object.freeze([
  {
    id: 'fresher-ats-classic',
    category: 'fresher',
    name: 'Fresher ATS Classic',
    description: 'Clean single column in black and white. Education, skills, projects and certifications first; no graphics or rating bars.',
    bestFor: 'Online applications and campus placement portals',
    layout: 'Single column',
    ats: true,
    accents: ['ink'],
    fonts: ['serif', 'sans'],
    density: 'standard',
    pageMode: 'multi',
    order: ['summary', 'education', 'skills', 'projects', 'experience', 'certifications', 'achievements', 'coursework', 'volunteering', 'custom-1', 'custom-2'],
  },
  {
    id: 'modern-graduate',
    category: 'fresher',
    name: 'Modern Graduate',
    description: 'Modern type with a subtle accent and a strong section hierarchy. Academic background and projects stand out; skills read as tags.',
    bestFor: 'Graduate roles, frontend and data roles',
    layout: 'Single column',
    ats: true,
    accents: ['green', 'blue', 'teal', 'navy', 'slate'],
    fonts: ['sans'],
    density: 'standard',
    pageMode: 'multi',
    order: ['summary', 'education', 'projects', 'skills', 'achievements', 'certifications', 'experience', 'coursework', 'volunteering', 'custom-1', 'custom-2'],
  },
  {
    id: 'software-developer-fresher',
    category: 'fresher',
    name: 'Software Developer Fresher',
    description: 'For CSE, IT and software students: a technical skills table, projects with their stack and repository links, and relevant coursework.',
    bestFor: 'Software, full-stack and backend developer roles',
    layout: 'Single column with a links header',
    ats: true,
    accents: ['blue', 'navy', 'green', 'teal', 'ink'],
    fonts: ['sans'],
    density: 'standard',
    pageMode: 'multi',
    order: ['summary', 'skills', 'projects', 'education', 'experience', 'coursework', 'certifications', 'achievements', 'volunteering', 'custom-1', 'custom-2'],
  },
  {
    id: 'internship-applicant',
    category: 'fresher',
    name: 'Internship Applicant',
    description: 'Concise and recruiter-friendly, with an optional career objective up front and room for certifications and extracurricular achievements.',
    bestFor: 'Internship applications',
    layout: 'Single column with section bands',
    ats: true,
    accents: ['teal', 'green', 'blue', 'purple', 'slate'],
    fonts: ['sans'],
    density: 'standard',
    pageMode: 'multi',
    order: ['summary', 'education', 'skills', 'projects', 'certifications', 'achievements', 'experience', 'volunteering', 'coursework', 'custom-1', 'custom-2'],
  },
  {
    id: 'minimal-one-page',
    category: 'fresher',
    name: 'Minimal One-Page Fresher',
    description: 'Compact and readable. Tries to fit everything on one page without shrinking text below 9 pt, and adds a page rather than cutting anything.',
    bestFor: 'Career fairs and one-page requirements',
    layout: 'Compact single column',
    ats: true,
    accents: ['ink', 'slate', 'navy', 'green'],
    fonts: ['sans', 'serif'],
    density: 'compact',
    pageMode: 'one',
    order: ['summary', 'education', 'skills', 'projects', 'experience', 'achievements', 'certifications', 'coursework', 'volunteering', 'custom-1', 'custom-2'],
  },
  {
    id: 'academic-achievement',
    category: 'fresher',
    name: 'Academic & Achievement',
    description: 'A CV-style layout with a date column: academic qualifications, hackathons, awards, competitions and certifications take the lead.',
    bestFor: 'Research internships, graduate programs and competitions',
    layout: 'Single column with a date column',
    ats: true,
    accents: ['navy', 'maroon', 'ink', 'teal'],
    fonts: ['serif', 'sans'],
    density: 'standard',
    pageMode: 'multi',
    order: ['summary', 'education', 'achievements', 'certifications', 'projects', 'experience', 'skills', 'coursework', 'volunteering', 'custom-1', 'custom-2'],
  },
  {
    id: 'ats-classic',
    category: 'general',
    name: 'ATS Classic',
    description: 'The traditional left-aligned layout: experience first, ruled section headings, nothing but text.',
    bestFor: 'Any role, especially with work experience',
    layout: 'Single column',
    ats: true,
    accents: ['ink', 'navy', 'green'],
    fonts: ['sans', 'serif'],
    density: 'standard',
    pageMode: 'multi',
    order: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'achievements', 'volunteering', 'coursework', 'custom-1', 'custom-2'],
  },
  {
    id: 'modern-developer',
    category: 'general',
    name: 'Modern Developer',
    description: 'A bold colour header with your links, skill tags and projects set as cards.',
    bestFor: 'Developer roles shared directly with people',
    layout: 'Header band, single column',
    ats: false,
    accents: ['navy', 'slate', 'teal', 'purple', 'green'],
    fonts: ['sans'],
    density: 'standard',
    pageMode: 'multi',
    order: ['summary', 'skills', 'projects', 'experience', 'education', 'achievements', 'certifications', 'coursework', 'volunteering', 'custom-1', 'custom-2'],
  },
  {
    id: 'minimal-professional',
    category: 'general',
    name: 'Minimal Professional',
    description: 'Generous white space with section names in a side margin and fine rules between sections.',
    bestFor: 'Experienced students and polished applications',
    layout: 'Side headings',
    ats: true,
    accents: ['slate', 'ink', 'navy', 'teal'],
    fonts: ['sans', 'serif'],
    density: 'standard',
    pageMode: 'multi',
    order: DEFAULT_ORDER,
  },
  {
    id: 'two-column-professional',
    category: 'general',
    name: 'Two-Column Professional',
    description: 'A tinted sidebar with contact details, skills, certifications and coursework beside your experience and projects.',
    bestFor: 'Sharing directly with recruiters (single-column templates suit online forms better)',
    layout: 'Two columns',
    ats: false,
    accents: ['teal', 'navy', 'green', 'maroon', 'slate'],
    fonts: ['sans', 'serif'],
    density: 'standard',
    pageMode: 'multi',
    order: ['summary', 'experience', 'projects', 'education', 'achievements', 'volunteering', 'skills', 'certifications', 'coursework', 'custom-1', 'custom-2'],
  },
]);
export const RESUME_TEMPLATE_IDS = Object.freeze(RESUME_TEMPLATES.map((template) => template.id));
export const DEFAULT_RESUME_TEMPLATE = 'fresher-ats-classic';

// ----------------------------------------------------------------------------- AI assistant

/** What the optional AI assistant can do. Every result is a suggestion the student reviews first. */
export const RESUME_AI_TASKS = Object.freeze([
  { id: 'summary', label: 'Improve summary or objective' },
  { id: 'bullets', label: 'Rewrite as bullet points' },
  { id: 'grammar', label: 'Improve wording and grammar' },
  { id: 'keywords', label: 'Suggest keywords for a job description' },
  { id: 'review', label: 'Review my resume' },
]);
export const RESUME_AI_TASK_IDS = Object.freeze(RESUME_AI_TASKS.map((task) => task.id));

// ----------------------------------------------------------------------------- word lists

/**
 * Skill groups for the profile importer. Only skills the student already listed on CampusX (profile
 * skills, project tech stacks, achievement skills) are sorted into these groups; nothing is added.
 */
export const SKILL_GROUPS = Object.freeze([
  {
    label: 'Languages',
    items: ['C', 'C++', 'C#', 'Java', 'Python', 'JavaScript', 'TypeScript', 'Go', 'Rust', 'Kotlin', 'Swift', 'Dart', 'PHP', 'Ruby', 'R', 'SQL', 'MATLAB', 'Scala', 'Solidity', 'HTML', 'CSS', 'HTML & CSS', 'Bash', 'Shell'],
  },
  {
    label: 'Frameworks & Libraries',
    items: ['React', 'Next.js', 'Vue', 'Angular', 'Svelte', 'Node.js', 'Express', 'Django', 'Flask', 'FastAPI', 'Spring Boot', 'Spring', 'Flutter', 'React Native', 'Tailwind CSS', 'Bootstrap', 'Redux', 'TensorFlow', 'PyTorch', 'Keras', 'scikit-learn', 'OpenCV', 'Pandas', 'NumPy', 'Matplotlib', 'Seaborn', 'jQuery', '.NET', 'Laravel', 'Hugging Face', 'LangChain'],
  },
  {
    label: 'Databases',
    items: ['MongoDB', 'PostgreSQL', 'MySQL', 'SQLite', 'Firebase', 'Redis', 'Oracle', 'DynamoDB', 'Cassandra', 'Supabase'],
  },
  {
    label: 'Tools & Platforms',
    items: ['Git', 'GitHub', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'Google Cloud', 'GCP', 'Linux', 'Postman', 'Figma', 'VS Code', 'Jira', 'Jenkins', 'Vercel', 'Netlify', 'Heroku', 'Arduino', 'Raspberry Pi', 'Power BI', 'Tableau', 'Excel', 'Jupyter', 'Android Studio', 'Unity', 'Blender', 'CI/CD'],
  },
]);
export const OTHER_SKILLS_LABEL = 'Other Skills';

/**
 * Terms the checker looks for in a job description, with spellings that count as the same term.
 * Matching is case-insensitive on whole words, except spellings of one or two letters ("JS", "ML", "R",
 * "Go"), which must match exactly; "R" and "Go" must also sit in a list ("Python, R, SQL") because they
 * are ordinary words too. Only terms from this list are reported, so a missing keyword is always a real,
 * recognisable skill or practice, never noise from the posting's wording.
 */
export const KEYWORD_TERMS = Object.freeze([
  ['JavaScript', 'JS', 'ecmascript', 'es6'],
  ['TypeScript', 'TS'],
  ['Python'], ['Java'], ['C++', 'cpp'], ['C#', 'csharp'], ['Go', 'golang'], ['Rust'], ['Kotlin'], ['Swift'], ['Dart'], ['PHP'], ['Ruby'], ['R'], ['SQL'], ['NoSQL'], ['Scala'],
  ['HTML', 'html5'], ['CSS', 'css3'], ['React', 'react.js', 'reactjs'], ['Next.js', 'nextjs'], ['Vue', 'vue.js', 'vuejs'], ['Angular'], ['Svelte'],
  ['Node.js', 'node', 'nodejs', 'node js'], ['Express', 'express.js', 'expressjs'], ['Django'], ['Flask'], ['FastAPI'], ['Spring Boot', 'spring'], ['.NET', 'dotnet'],
  ['Redux'], ['Tailwind CSS', 'tailwind'], ['Bootstrap'], ['Flutter'], ['React Native'], ['Android'], ['iOS'],
  ['MongoDB', 'mongo'], ['PostgreSQL', 'postgres'], ['MySQL'], ['SQLite'], ['Redis'], ['Firebase'], ['Oracle'],
  ['REST APIs', 'rest', 'rest api', 'restful', 'restful apis'], ['GraphQL'], ['Microservices'], ['WebSockets', 'websocket'],
  ['Git'], ['GitHub'], ['Docker'], ['Kubernetes', 'k8s'], ['AWS', 'amazon web services'], ['Azure'], ['Google Cloud', 'gcp'], ['Linux'], ['CI/CD', 'ci cd', 'continuous integration'],
  ['Unit Testing', 'unit tests', 'testing'], ['Jest'], ['Selenium'], ['Agile'], ['Scrum'], ['Jira'],
  ['Data Structures', 'DSA', 'data structures and algorithms'], ['Algorithms'], ['OOP', 'object oriented', 'object-oriented programming', 'object oriented programming'], ['System Design'], ['Operating Systems'], ['DBMS', 'database management'], ['Computer Networks', 'networking'],
  ['Machine Learning', 'ML'], ['Deep Learning'], ['NLP', 'natural language processing'], ['Computer Vision'], ['TensorFlow'], ['PyTorch'], ['scikit-learn', 'sklearn'], ['Pandas'], ['NumPy'], ['OpenCV'], ['LLMs', 'llm', 'large language models'], ['Generative AI', 'genai'],
  ['Data Analysis', 'data analytics'], ['Data Visualization', 'visualisation', 'data visualisation'], ['Statistics', 'statistical'], ['Excel', 'ms excel', 'microsoft excel'], ['Power BI', 'powerbi'], ['Tableau'], ['ETL'],
  ['Figma'], ['UI/UX', 'ui ux', 'user experience', 'user interface'], ['Responsive Design', 'responsive'], ['Accessibility', 'a11y', 'wcag'],
  ['Cybersecurity', 'security', 'information security'], ['Blockchain'], ['IoT', 'internet of things'], ['Embedded Systems', 'embedded'],
  ['Problem Solving', 'problem-solving'], ['Communication', 'communication skills'], ['Teamwork', 'team player', 'collaboration'], ['Leadership'],
]);

/** Phrases the checker flags as vague, with a gentler alternative to suggest. */
export const WEAK_PHRASES = Object.freeze([
  { phrase: 'responsible for', hint: 'Start with what you did, e.g. "Built", "Designed", "Led".' },
  { phrase: 'worked on', hint: 'Say what you did on it: "Built", "Implemented", "Tested".' },
  { phrase: 'helped with', hint: 'Name your part: "Wrote", "Designed", "Organised".' },
  { phrase: 'helped in', hint: 'Name your part: "Wrote", "Designed", "Organised".' },
  { phrase: 'was involved in', hint: 'Describe your contribution directly.' },
  { phrase: 'various', hint: 'Name the specific things instead.' },
  { phrase: 'etc', hint: 'List the items that matter and drop "etc."' },
  { phrase: 'hard working', hint: 'Show it with a result or project instead of stating it.' },
  { phrase: 'hardworking', hint: 'Show it with a result or project instead of stating it.' },
  { phrase: 'team player', hint: 'Show teamwork with a project you built with others.' },
]);

/** Words that start strong bullet points (used to suggest, never to rewrite automatically). */
export const ACTION_VERBS = Object.freeze([
  'Built', 'Designed', 'Developed', 'Implemented', 'Created', 'Led', 'Organised', 'Organized', 'Improved', 'Reduced', 'Increased',
  'Automated', 'Analysed', 'Analyzed', 'Tested', 'Deployed', 'Integrated', 'Wrote', 'Researched', 'Trained', 'Presented', 'Won',
  'Collaborated', 'Optimised', 'Optimized', 'Launched', 'Managed', 'Mentored', 'Published', 'Refactored', 'Migrated', 'Modelled', 'Modeled',
]);
