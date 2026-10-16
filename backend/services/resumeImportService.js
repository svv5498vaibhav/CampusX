import env from '../config/env.js';
import { ACHIEVEMENT_TYPES, TEAM_ROLES } from '../data/showcaseOptions.js';
import { OTHER_SKILLS_LABEL, RESUME_LIMITS, SKILL_GROUPS } from '../data/resumeOptions.js';
import Achievement from '../models/Achievement.js';
import Project from '../models/Project.js';
import { getBranch, getCollege } from './campusOptionsService.js';
import { getMyRoadmap } from './roadmapService.js';
import { newItemId } from './resumeContent.js';

/*
 * "Import My CampusX Profile": a draft built only from the signed-in student's own records (req.user):
 * their profile, the projects they own or accepted a place on, their achievements, and the learning
 * milestones they completed on their Semester Roadmap. Nothing is written; the student reviews the
 * draft, picks what to keep and edits it before anything is saved to a resume.
 *
 * Never read: messages, Anonymous Zone posts, moderation data, other students' details (teammates are
 * not named), or anything a moderator removed. Nothing is invented: a value CampusX doesn't store
 * (phone, links, degree name, dates, CGPA) stays empty and is listed in `missing` instead.
 */

const MAX_PROJECTS = 20;
const MAX_ACHIEVEMENTS = 30;
const CERTIFICATE_TYPES = new Set(['certification', 'workshop']);
const teamRoleLabels = new Map(TEAM_ROLES.map((role) => [role.id, role.label]));
const achievementTypeLabels = new Map(ACHIEVEMENT_TYPES.map((type) => [type.id, type.label]));
const monthFormat = new Intl.DateTimeFormat('en-CA', { timeZone: env.gamificationTimezone, year: 'numeric', month: '2-digit' });

/** A stored date as YYYY-MM in the campus time zone ("" when missing). */
const yearMonth = (value) => {
  if (!value) return '';
  const parts = Object.fromEntries(monthFormat.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return parts.year && parts.month ? `${parts.year}-${parts.month}` : '';
};

/** Shortens text over `max` characters at a word boundary (only for text longer than a resume field allows). */
function fit(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 40)).trim()}…`;
}

/**
 * Bullet candidates from a description the student wrote: one per line (list markers removed), or one
 * per sentence for a single paragraph. Very short fragments are joined to the one before.
 */
export function bulletsFromText(text, { max, exclude = '' } = {}) {
  if (!text) return [];
  const lines = text
    .split(/\r?\n+/)
    .map((item) => item.replace(/^\s*(?:[-*•▪◦·–]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);
  const parts = lines.length > 1 ? lines : (lines[0] ?? '').split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/);
  const merged = [];
  for (const part of parts.map((item) => item.trim()).filter(Boolean)) {
    if (merged.length && part.length < 25) merged[merged.length - 1] = `${merged.at(-1)} ${part}`;
    else merged.push(part);
  }
  const skip = exclude.trim().toLowerCase();
  return merged
    .filter((item) => item.toLowerCase() !== skip)
    .slice(0, max)
    .map((item) => fit(item, RESUME_LIMITS.bullet.max));
}

const groupByKey = new Map(SKILL_GROUPS.flatMap((group) => group.items.map((item) => [item.toLowerCase(), group.label])));

/** Skills the student listed anywhere on CampusX, sorted into groups (first spelling wins). */
export function groupSkills(names) {
  const seen = new Set();
  const groups = new Map([...SKILL_GROUPS.map((group) => [group.label, []]), [OTHER_SKILLS_LABEL, []]]);
  for (const raw of names) {
    const name = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, RESUME_LIMITS.skills.itemLength);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    groups.get(groupByKey.get(key) ?? OTHER_SKILLS_LABEL).push(name);
  }
  return [...groups]
    .filter(([, items]) => items.length)
    .map(([label, items]) => ({ id: newItemId(), label, items: items.slice(0, RESUME_LIMITS.skills.items) }));
}

const notRemoved = { moderationStatus: { $ne: 'removed' }, deletedAt: null };

async function loadProjects(user) {
  const projects = await Project.find({
    ...notRemoved,
    $or: [{ owner: user._id }, { teamMembers: { $elemMatch: { user: user._id, status: 'accepted' } } }],
  })
    .select('owner title shortDescription description techStack githubUrl liveUrl demoUrl teamMembers featured status updatedAt')
    .sort({ featured: -1, updatedAt: -1 })
    .limit(MAX_PROJECTS)
    .lean();
  const me = user._id.toString();
  return projects.map((project) => {
    const isOwner = project.owner.toString() === me;
    const membership = project.teamMembers?.find((member) => member.user.toString() === me);
    return {
      id: newItemId(),
      name: fit(project.title, RESUME_LIMITS.text.short),
      role: isOwner ? '' : (teamRoleLabels.get(membership?.role) ?? ''),
      tech: (project.techStack ?? []).slice(0, RESUME_LIMITS.projects.tech),
      startDate: '',
      endDate: project.status === 'in-progress' ? 'present' : '',
      github: project.githubUrl ?? '',
      live: project.liveUrl || project.demoUrl || '',
      summary: fit(project.shortDescription ?? '', RESUME_LIMITS.description.max),
      bullets: bulletsFromText(project.description, { max: RESUME_LIMITS.projects.bullets, exclude: project.shortDescription }),
      source: `p:${project._id}`,
    };
  });
}

async function loadAchievements(user) {
  const all = await Achievement.find({ owner: user._id, ...notRemoved })
    .select('title description type organization eventName date rank certificateUrl skills verificationStatus')
    .sort({ date: -1 })
    .limit(MAX_ACHIEVEMENTS + 20)
    .lean();
  // A moderator couldn't confirm a rejected achievement, so it isn't offered (the student can still type it).
  const rejected = all.filter((item) => item.verificationStatus === 'rejected').length;
  const usable = all.filter((item) => item.verificationStatus !== 'rejected').slice(0, MAX_ACHIEVEMENTS);
  const experience = [];
  const certifications = [];
  const achievements = [];
  for (const item of usable) {
    const source = `a:${item._id}`;
    if (item.type === 'internship') {
      experience.push({
        id: newItemId(),
        role: fit(item.title, RESUME_LIMITS.text.short),
        organization: fit(item.organization || item.eventName || '', RESUME_LIMITS.text.medium),
        location: '',
        startDate: yearMonth(item.date),
        endDate: '',
        bullets: bulletsFromText(item.description, { max: RESUME_LIMITS.experience.bullets }),
        source,
      });
    } else if (CERTIFICATE_TYPES.has(item.type)) {
      certifications.push({
        id: newItemId(),
        name: fit(item.title, RESUME_LIMITS.text.medium),
        issuer: fit(item.organization || item.eventName || '', RESUME_LIMITS.text.short),
        date: yearMonth(item.date),
        url: item.certificateUrl ?? '',
        source,
      });
    } else {
      const rank = item.rank?.trim();
      const title = rank && !item.title.toLowerCase().includes(rank.toLowerCase()) ? `${item.title} (${rank})` : item.title;
      achievements.push({
        id: newItemId(),
        title: fit(title, RESUME_LIMITS.text.medium),
        organization: fit([item.eventName, item.organization].filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).join(', '), RESUME_LIMITS.text.medium),
        date: yearMonth(item.date),
        description: fit((item.description ?? '').replace(/\s+/g, ' ').trim(), RESUME_LIMITS.description.max),
        kind: achievementTypeLabels.get(item.type) ?? 'Achievement',
        source,
      });
    }
  }
  return { experience, certifications, achievements, skills: usable.flatMap((item) => item.skills ?? []), rejected };
}

/** Learning milestones the student marked complete on their Semester Roadmap (self-reported). */
async function loadCoursework(user) {
  try {
    const roadmap = await getMyRoadmap(user);
    const titles = roadmap.semesters
      .flatMap((semester) => semester.milestones)
      .filter((milestone) => milestone.status === 'completed' && milestone.category === 'learn')
      .map((milestone) => milestone.title);
    return [...new Set(titles)].slice(0, RESUME_LIMITS.coursework.max);
  } catch {
    return [];
  }
}

/** The import draft for the signed-in student. Read-only. */
export async function buildProfileImport(user) {
  const [college, branch, projects, fromAchievements, coursework] = await Promise.all([
    user.college ? getCollege(user.college) : null,
    user.branch ? getBranch(user.branch) : null,
    loadProjects(user),
    loadAchievements(user),
    loadCoursework(user),
  ]);

  const education = college
    ? [{ id: newItemId(), institution: college.name, degree: '', field: branch?.name ?? '', location: college.city ?? '', startDate: '', endDate: '', score: '', coursework: [], details: [] }]
    : [];
  const skills = groupSkills([...(user.skills ?? []), ...projects.flatMap((project) => project.tech), ...fromAchievements.skills]);

  const missing = ['Phone number', 'Location', 'GitHub, LinkedIn or portfolio links', 'Degree name (for example B.Tech or B.E.)', 'Start and graduation dates', 'CGPA or percentage'];
  if (!user.bio?.trim()) missing.push('A summary or career objective');

  return {
    draft: {
      personal: { fullName: `${user.firstName} ${user.lastName}`.trim(), headline: '', email: user.email, phone: '', location: '', links: [] },
      summary: fit((user.bio ?? '').replace(/\s+/g, ' ').trim(), RESUME_LIMITS.summary.max),
      education,
      skills,
      projects,
      experience: fromAchievements.experience,
      achievements: fromAchievements.achievements,
      certifications: fromAchievements.certifications,
      coursework,
    },
    student: { currentSemester: user.semester ?? null },
    found: {
      projects: projects.length,
      achievements: fromAchievements.achievements.length,
      certifications: fromAchievements.certifications.length,
      internships: fromAchievements.experience.length,
      skills: skills.reduce((sum, group) => sum + group.items.length, 0),
      coursework: coursework.length,
    },
    skipped: fromAchievements.rejected ? [{ kind: 'achievements', count: fromAchievements.rejected, reason: 'A CampusX moderator could not verify them.' }] : [],
    missing,
    limits: { projects: RESUME_LIMITS.projects.max, achievements: RESUME_LIMITS.achievements.max, certifications: RESUME_LIMITS.certifications.max, experience: RESUME_LIMITS.experience.max },
  };
}
