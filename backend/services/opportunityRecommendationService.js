import { INTEREST_MATCHES, OPPORTUNITY_RULES } from '../data/opportunityOptions.js';
import Opportunity from '../models/Opportunity.js';
import OpportunityApplication from '../models/OpportunityApplication.js';
import { getBranch, getInterest } from './campusOptionsService.js';
import { daysFromNow, eligibleFilter, listedFor, openFilter } from './opportunityAccess.js';
import { exactInsensitive, listText, presentOpportunities } from './opportunityService.js';

/*
 * "Recommended for you": simple, deterministic rules (no machine learning), using only the student's
 * own profile (req.user): college, branch, semester, skills and interests.
 *
 * Only open opportunities the student is eligible for and hasn't added to their list yet are
 * considered, and each must match the profile (a skill, an interest, or rules aimed at their college or
 * branch). Points, used only to order them and never shown:
 *   matching skill +3 (up to 3) · matching interest +2 (up to 3) · aimed at their college +2
 *   · aimed at their branch +2 · aimed at their semester +1 · deadline within two weeks +1
 * Ties go to the nearer deadline, then the newer opportunity. Students see the reasons instead.
 */

const POINTS = { skill: 3, interest: 2, college: 2, branch: 2, semester: 1, deadline: 1 };
const MAX_COUNTED = { skill: 3, interest: 3 };
const lower = (text) => text.toLowerCase();

async function interestRules(viewer) {
  const interests = await Promise.all((viewer.interests ?? []).map(getInterest));
  return interests
    .filter((interest) => interest && INTEREST_MATCHES[interest.id])
    .map((interest) => ({ name: interest.name, types: INTEREST_MATCHES[interest.id].types ?? [], keywords: INTEREST_MATCHES[interest.id].keywords ?? [] }));
}

function scoreOf(opportunity, profile, now) {
  const words = new Set([...(opportunity.skills ?? []), ...(opportunity.tags ?? [])].map(lower));
  const skills = (opportunity.skills ?? []).filter((skill) => profile.skills.has(lower(skill)));
  const interests = profile.interests.filter((interest) => interest.types.includes(opportunity.type) || interest.keywords.some((word) => words.has(word)));
  const college = Boolean(profile.college) && (opportunity.eligibleColleges ?? []).includes(profile.college);
  const branch = Boolean(profile.branch) && (opportunity.eligibleBranches ?? []).includes(profile.branch);
  const semester = Boolean(profile.semester) && (opportunity.eligibleSemesters ?? []).includes(profile.semester);
  const deadline = Boolean(opportunity.applicationDeadline) && opportunity.applicationDeadline <= daysFromNow(OPPORTUNITY_RULES.recommendDeadlineDays, now);

  const profilePoints =
    Math.min(skills.length, MAX_COUNTED.skill) * POINTS.skill +
    Math.min(interests.length, MAX_COUNTED.interest) * POINTS.interest +
    (college ? POINTS.college : 0) +
    (branch ? POINTS.branch : 0) +
    (semester ? POINTS.semester : 0);

  const reasons = [];
  if (skills.length) reasons.push(`Matches your skills: ${skills.slice(0, 3).join(', ')}`);
  if (interests.length) reasons.push(`Fits your interest${interests.length > 1 ? 's' : ''}: ${listText(interests.slice(0, 3).map((interest) => interest.name))}`);
  if (college) reasons.push('For students at your college');
  if (branch) reasons.push(`For ${profile.branchName ?? 'your branch'} students`);
  if (semester) reasons.push('For your semester');
  if (deadline && profilePoints > 0) reasons.push('Deadline coming up');
  return { profilePoints, points: profilePoints + (deadline ? POINTS.deadline : 0), reasons };
}

export async function recommendOpportunities(viewer) {
  const now = new Date();
  const [interests, branch, tracked] = await Promise.all([
    interestRules(viewer),
    viewer.branch ? getBranch(viewer.branch) : null,
    OpportunityApplication.find({ user: viewer._id }).distinct('opportunity'),
  ]);
  const profile = {
    skills: new Set((viewer.skills ?? []).map(lower)),
    interests,
    college: viewer.college,
    branch: viewer.branch,
    branchName: branch?.shortName,
    semester: viewer.semester,
  };

  const keywords = [...new Set([...profile.skills, ...interests.flatMap((interest) => interest.keywords)])];
  const types = [...new Set(interests.flatMap((interest) => interest.types))];
  const matchesProfile = [
    ...(keywords.length ? [{ skills: { $in: keywords.map(exactInsensitive) } }, { tags: { $in: keywords.map(exactInsensitive) } }] : []),
    ...(types.length ? [{ type: { $in: types } }] : []),
    ...(viewer.college ? [{ eligibleColleges: viewer.college }] : []),
    ...(viewer.branch ? [{ eligibleBranches: viewer.branch }] : []),
  ];
  if (matchesProfile.length === 0) return { opportunities: [] };

  const candidates = await Opportunity.find({
    $and: [listedFor(viewer), openFilter(now), eligibleFilter(viewer), { _id: { $nin: tracked } }, { $or: matchesProfile }],
  })
    .select('-description')
    .sort({ applicationDeadline: 1, publishedAt: -1 })
    .limit(200)
    .lean();

  const deadlineOf = (item) => item.opportunity.applicationDeadline?.getTime() ?? Number.POSITIVE_INFINITY;
  const picked = candidates
    .map((opportunity) => ({ opportunity, ...scoreOf(opportunity, profile, now) }))
    .filter((item) => item.profilePoints > 0)
    .sort((a, b) => b.points - a.points || deadlineOf(a) - deadlineOf(b) || (b.opportunity.publishedAt ?? 0) - (a.opportunity.publishedAt ?? 0))
    .slice(0, OPPORTUNITY_RULES.recommended);

  const views = await presentOpportunities(picked.map((item) => item.opportunity), viewer, { now });
  return { opportunities: views.map((view, index) => ({ ...view, matchReasons: picked[index].reasons })) };
}
