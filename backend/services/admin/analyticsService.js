import { ADMIN_CACHE_SECONDS, ANALYTICS_RANGES, ANALYTICS_RULES, PERMISSIONS } from '../../config/adminConfig.js';
import { REPORT_REASONS } from '../../config/moderationConfig.js';
import { OPPORTUNITY_STATUS_IDS, TRACKING_STATUS_IDS } from '../../data/opportunityOptions.js';
import Achievement from '../../models/Achievement.js';
import AnonymousComment from '../../models/AnonymousComment.js';
import Comment from '../../models/Comment.js';
import Community from '../../models/Community.js';
import CommunityMember from '../../models/CommunityMember.js';
import ModerationAuditLog from '../../models/ModerationAuditLog.js';
import ModerationCase from '../../models/ModerationCase.js';
import Opportunity from '../../models/Opportunity.js';
import OpportunityApplication from '../../models/OpportunityApplication.js';
import Post from '../../models/Post.js';
import Project from '../../models/Project.js';
import Report from '../../models/Report.js';
import User, { ACCOUNT_STATUSES, ROLES } from '../../models/User.js';
import { getCache, setCache } from '../cacheService.js';
import { getOnboardingOptions } from '../campusOptionsService.js';
import { assertPermission } from './adminAccess.js';
import { ADMIN_CACHE_KEYS } from './adminCache.js';
import { activeStudentCount, countMap, dailyCounts, dayWindow } from './adminSeries.js';
import { getModerationSummary, riskDistribution } from './moderationService.js';

/*
 * Platform analytics for admins (VIEW_ANALYTICS), over 7, 30 or 90 days. Only what the database records
 * is reported: there is no page-view or time-on-site tracking, likes and saves carry no dates (so they are
 * totals, not series), and opportunity "applications" are students' own tracking, not verified
 * applications. Cached per range for ADMIN_CACHE_SECONDS.analytics.
 */

const REASON_LABELS = new Map(REPORT_REASONS.map((reason) => [reason.id, reason.label]));
const STUDENTS = { role: ROLES.STUDENT };
const arraySize = (field) => ({ $size: { $ifNull: [`$${field}`, []] } });
const sumOf = (series) => series.reduce((sum, value) => sum + value, 0);

/** Students per college or branch (top N by count), with display names; "Not set" for no profile yet. */
async function distribution(field, limit, names) {
  const rows = await User.aggregate([{ $match: STUDENTS }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }]);
  const top = rows.slice(0, limit).map((row) => ({ id: row._id ?? null, label: row._id ? (names.get(row._id) ?? row._id) : 'Not set', count: row.count }));
  const rest = rows.slice(limit).reduce((sum, row) => sum + row.count, 0);
  return rest ? [...top, { id: 'other', label: 'Other', count: rest }] : top;
}

async function buildAnalytics(range) {
  const days = ANALYTICS_RANGES[range];
  const window = dayWindow(days);
  const since = { createdAt: { $gte: window.start } };
  const options = await getOnboardingOptions();
  const collegeNames = new Map(options.colleges.map((college) => [college.id, college.aliases?.[0] ?? college.name]));
  const branchNames = new Map(options.branches.map((branch) => [branch.id, branch.shortName ?? branch.name]));

  const [
    users,
    content,
    engagement,
    moderation,
    opportunities,
  ] = await Promise.all([
    // ---------------------------------------------------------------- users
    Promise.all([
      dailyCounts(User, STUDENTS, window),
      User.countDocuments(STUDENTS),
      activeStudentCount(days),
      User.aggregate([{ $match: STUDENTS }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      distribution('college', ANALYTICS_RULES.topColleges, collegeNames),
      distribution('branch', ANALYTICS_RULES.topBranches, branchNames),
      User.countDocuments({ ...STUDENTS, onboardingCompleted: true }),
    ]),
    // ---------------------------------------------------------------- content
    Promise.all([
      dailyCounts(Post, { community: null }, window),
      dailyCounts(Project, {}, window),
      dailyCounts(Achievement, {}, window),
      dailyCounts(Community, {}, window),
      Promise.all([Post, Project, Achievement, Community].map((model) => model.countDocuments({ moderationStatus: { $ne: 'removed' } }))),
      Achievement.countDocuments({ verificationStatus: 'verified' }),
    ]),
    // ---------------------------------------------------------------- engagement
    Promise.all([
      dailyCounts(Comment, {}, window),
      dailyCounts(Post, { community: { $ne: null } }, window),
      dailyCounts(CommunityMember, { status: { $in: ['active', 'left'] } }, window, { dateField: 'joinedAt' }),
      Post.aggregate([{ $group: { _id: null, likes: { $sum: arraySize('likes') }, saves: { $sum: arraySize('saves') } } }]),
      Post.aggregate([{ $match: since }, { $group: { _id: null, likes: { $sum: arraySize('likes') }, saves: { $sum: arraySize('saves') } } }]),
      Project.aggregate([{ $group: { _id: null, likes: { $sum: arraySize('likes') } } }]),
      AnonymousComment.countDocuments(since),
    ]),
    // ---------------------------------------------------------------- moderation
    Promise.all([
      dailyCounts(Report, {}, window),
      dailyCounts(ModerationCase, {}, window),
      dailyCounts(ModerationAuditLog, { action: 'REMOVE' }, window),
      Report.aggregate([{ $match: since }, { $group: { _id: '$reason', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      getModerationSummary({ refresh: true }),
      riskDistribution(),
    ]),
    // ---------------------------------------------------------------- opportunities
    Promise.all([
      Opportunity.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Opportunity.aggregate([{ $group: { _id: null, views: { $sum: '$views' } } }]),
      OpportunityApplication.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Opportunity.find({ status: { $in: ['published', 'closed'] } }).sort({ views: -1, _id: -1 }).limit(ANALYTICS_RULES.topOpportunities).select('title organizer type status views').lean(),
      dailyCounts(Opportunity, { publishedAt: { $ne: null } }, window, { dateField: 'publishedAt' }),
      dailyCounts(OpportunityApplication, {}, window),
    ]),
  ]);

  const [registrations, totalStudents, activeStudents, byStatus, colleges, branches, onboarded] = users;
  const [postSeries, projectSeries, achievementSeries, communitySeries, totals, verifiedAchievements] = content;
  const [commentSeries, communityPostSeries, joinSeries, postTotals, postRange, projectLikes, anonymousComments] = engagement;
  const [reportSeries, caseSeries, removalSeries, reasons, summary, risk] = moderation;
  const [opportunityStatus, opportunityViews, tracking, topOpportunities, publishedSeries, trackingSeries] = opportunities;

  return {
    range,
    days: window.keys,
    users: {
      registrations,
      newStudents: sumOf(registrations),
      totalStudents,
      activeStudents,
      onboarded,
      byStatus: countMap(byStatus, Object.values(ACCOUNT_STATUSES)),
      colleges,
      branches,
    },
    content: {
      series: { posts: postSeries, projects: projectSeries, achievements: achievementSeries, communities: communitySeries },
      inRange: { posts: sumOf(postSeries), projects: sumOf(projectSeries), achievements: sumOf(achievementSeries), communities: sumOf(communitySeries) },
      totals: { posts: totals[0], projects: totals[1], achievements: totals[2], communities: totals[3], verifiedAchievements },
    },
    engagement: {
      series: { comments: commentSeries, communityPosts: communityPostSeries, communityJoins: joinSeries },
      inRange: { comments: sumOf(commentSeries), communityPosts: sumOf(communityPostSeries), communityJoins: sumOf(joinSeries), anonymousComments, likesOnNewPosts: postRange[0]?.likes ?? 0, savesOfNewPosts: postRange[0]?.saves ?? 0 },
      totals: { postLikes: postTotals[0]?.likes ?? 0, postSaves: postTotals[0]?.saves ?? 0, projectLikes: projectLikes[0]?.likes ?? 0 },
    },
    moderation: {
      series: { reports: reportSeries, cases: caseSeries, removals: removalSeries },
      inRange: { reports: sumOf(reportSeries), cases: sumOf(caseSeries), removals: sumOf(removalSeries) },
      reasons: reasons.map((row) => ({ id: row._id, label: REASON_LABELS.get(row._id) ?? row._id, count: row.count })),
      caseStatus: summary.cases,
      contentStatus: summary.content,
      risk,
    },
    opportunities: {
      byStatus: countMap(opportunityStatus, OPPORTUNITY_STATUS_IDS),
      totalViews: opportunityViews[0]?.views ?? 0,
      tracking: countMap(tracking, TRACKING_STATUS_IDS),
      top: topOpportunities.map((item) => ({ id: item._id.toString(), title: item.title, organizer: item.organizer, type: item.type, status: item.status, views: item.views ?? 0 })),
      series: { published: publishedSeries, tracked: trackingSeries },
      inRange: { published: sumOf(publishedSeries), tracked: sumOf(trackingSeries) },
    },
    generatedAt: new Date().toISOString(),
  };
}

/** GET /admin/analytics?range=7d|30d|90d */
export async function getAnalytics(actor, { range = '30d', refresh = false } = {}) {
  assertPermission(actor, PERMISSIONS.VIEW_ANALYTICS);
  const key = ADMIN_CACHE_KEYS.analytics(range);
  const cached = refresh ? null : await getCache(key);
  if (cached) return cached;
  const data = await buildAnalytics(range);
  await setCache(key, data, ADMIN_CACHE_SECONDS.analytics);
  return data;
}
