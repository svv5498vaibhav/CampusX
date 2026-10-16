import { AlignLeft, Briefcase, CloudDownload, FileCheck2, FolderKanban, GraduationCap, Palette, Target, UserRound, Wrench } from 'lucide-react';

/**
 * The Resume Builder's guided steps, in order. Students can move between them freely; everything is saved
 * as they go. Template names, roles, colours and limits come from GET /resumes/options.
 */
export const RESUME_STEPS = Object.freeze([
  { id: 'role', label: 'Target role', short: 'Role', icon: Target, description: 'Choose the job you are applying for and name this resume.' },
  { id: 'import', label: 'Import profile', short: 'Import', icon: CloudDownload, description: 'Bring in your CampusX profile, projects and achievements, then pick what to keep.' },
  { id: 'personal', label: 'Personal details', short: 'Details', icon: UserRound, description: 'Your name, professional contact details and links.' },
  { id: 'education', label: 'Education', short: 'Education', icon: GraduationCap, description: 'Your college, degree, dates, score and relevant coursework.' },
  { id: 'skills', label: 'Skills', short: 'Skills', icon: Wrench, description: 'Group the technical skills and tools you can genuinely use.' },
  { id: 'projects', label: 'Projects', short: 'Projects', icon: FolderKanban, description: 'What you built, how, and links to the code or a live demo.' },
  { id: 'experience', label: 'Experience & achievements', short: 'More', icon: Briefcase, description: 'Internships, achievements, certifications, volunteering and your own sections. All optional.' },
  { id: 'summary', label: 'Summary', short: 'Summary', icon: AlignLeft, description: 'Two or three lines on who you are and the role you want.' },
  { id: 'design', label: 'Template & style', short: 'Design', icon: Palette, description: 'Choose a template, colour and spacing, and arrange your sections.' },
  { id: 'review', label: 'Review & download', short: 'Download', icon: FileCheck2, description: 'Check your resume, then download it as a PDF.' },
]);
export const RESUME_STEP_IDS = Object.freeze(RESUME_STEPS.map((step) => step.id));

/** How long the editor waits after the last keystroke before saving. */
export const AUTOSAVE_DELAY_MS = 1200;

export const PRESET_LINKS = Object.freeze(['GitHub', 'LinkedIn', 'Portfolio', 'LeetCode', 'Kaggle']);

export const MONTH_OPTIONS = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((label, index) => ({ value: String(index + 1).padStart(2, '0'), label })));
