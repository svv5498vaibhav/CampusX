import { Code2, GraduationCap, Globe, Lightbulb, School, Sparkles, UsersRound } from 'lucide-react';

/*
 * Icons and colours for community types and visibility levels. Labels, descriptions and limits come
 * from the API (GET /communities/options) so they always match what the server accepts.
 */

export const COMMUNITY_TYPE_STYLES = {
  college: { icon: School, badge: 'primary', cover: 'from-leaf-600 via-leaf-500 to-leaf-300' },
  branch: { icon: GraduationCap, badge: 'primary', cover: 'from-leaf-800 via-leaf-600 to-leaf-400' },
  interest: { icon: Lightbulb, badge: 'accent', cover: 'from-sun-500 via-sun-400 to-leaf-300' },
  project: { icon: Code2, badge: 'primary', cover: 'from-leaf-700 via-leaf-500 to-sun-300' },
  'student-created': { icon: Sparkles, badge: 'accent', cover: 'from-leaf-500 via-sun-300 to-sun-400' },
};

export const COMMUNITY_VISIBILITY_ICONS = {
  public: Globe,
  college: School,
  branch: GraduationCap,
  restricted: UsersRound,
};

export const ROLE_LABELS = { owner: 'Owner', moderator: 'Moderator', member: 'Member' };

/** Fallback labels before the options have loaded. */
const FALLBACK_TYPE_LABELS = { college: 'College', branch: 'Branch', interest: 'Interest', project: 'Project', 'student-created': 'Club' };
export const communityTypeLabel = (options, typeId) =>
  options?.types.find((type) => type.id === typeId)?.label ?? FALLBACK_TYPE_LABELS[typeId] ?? typeId;

/** "Priyadarshini … · CSE · 7th Semester" or "Open to all of CampusX". */
export function communityScopeLine(community) {
  if (community.visibility === 'public') return 'Open to all of CampusX';
  return [community.college?.name, community.branch?.shortName, community.semester?.label].filter(Boolean).join(' · ');
}

export const memberCountLabel = (count) => `${count.toLocaleString()} ${count === 1 ? 'student' : 'students'}`;
