import { ADMIN_CACHE_SECONDS, AUDIT_CATEGORIES, DASHBOARD_RULES, PERMISSIONS, hasPermission } from '../../config/adminConfig.js';
import { getDatabaseStatus } from '../../config/db.js';
import { getRedisStatus } from '../../config/redis.js';
import env from '../../config/env.js';
import Achievement from '../../models/Achievement.js';
import AnonymousPost from '../../models/AnonymousPost.js';
import Comment from '../../models/Comment.js';
import Community from '../../models/Community.js';
import ModerationAuditLog from '../../models/ModerationAuditLog.js';
import ModerationCase from '../../models/ModerationCase.js';
import Opportunity from '../../models/Opportunity.js';
import Post from '../../models/Post.js';
import Project from '../../models/Project.js';
import Report from '../../models/Report.js';
import User, { ROLES } from '../../models/User.js';
import { getSocketStatus } from '../../sockets/socket.js';
import { getCache, setCache } from '../cacheService.js';
import { assertPermission } from './adminAccess.js';
import { ADMIN_CACHE_KEYS } from './adminCache.js';
import { activeStudentCount, dailyCounts, dayWindow, trend } from './adminSeries.js';
import { latestAudit } from './auditService.js';
import { getModerationSummary, riskDistribution, topThreats } from './moderationService.js';

/*
 * The command center: headline counts with week-over-week trends, platform activity, content creation,
 * case status, the risk radar and the most urgent cases. Every number is a database count; nothing is
 * estimated or invented. Cached for ADMIN_CACHE_SECONDS.dashboard (Redis, or memory without it); the
 * audit stream is read fresh and only for staff allowed to see the audit log.
 */

const NOT_REMOVED = { moderationStatus: { $ne: 'removed' } };
const SECURITY_ACTIONS = AUDIT_CATEGORIES.security;
const CACHE_KEY = ADMIN_CACHE_KEYS.dashboard;

async function buildDashboard() {
  const { trendDays, activeDays, activityDays, threats } = DASHBOARD_RULES;
  const window = dayWindow(activityDays);
  const students = { role: ROLES.STUDENT };
  const [
    totals,
    trends,
    activeStudents,
    activity,
    creation,
    summary,
    risk,
    threatList,
  ] = await Promise.all([
    Promise.all([
      User.countDocuments(students),
      Post.countDocuments(NOT_REMOVED),
      Project.countDocuments(NOT_REMOVED),
      Community.countDocuments(NOT_REMOVED),
      Opportunity.countDocuments({}),
      Opportunity.countDocuments({ status: 'published' }),
      Report.countDocuments({ status: 'pending' }),
      Report.countDocuments({ status: 'reviewing' }),
    ]),
    Promise.all([
      trend(User, students, trendDays),
      // Same definition as the totals beside them: removed content isn't counted.
      trend(Post, NOT_REMOVED, trendDays),
      trend(Project, NOT_REMOVED, trendDays),
      trend(Community, NOT_REMOVED, trendDays),
      trend(Opportunity, {}, trendDays),
      trend(Report, {}, trendDays),
      trend(ModerationCase, {}, trendDays),
    ]),
    activeStudentCount(activeDays),
    Promise.all([
      dailyCounts(User, students, window),
      dailyCounts(Post, {}, window),
      dailyCounts(Project, {}, window),
      dailyCounts(Report, {}, window),
      dailyCounts(ModerationAuditLog, { actorRole: { $in: ['admin', 'moderator'] }, action: { $nin: SECURITY_ACTIONS } }, window),
      dailyCounts(ModerationAuditLog, { actorRole: 'system', action: { $nin: SECURITY_ACTIONS } }, window),
    ]),
    Promise.all([Post, Comment, Project, Achievement, Community, AnonymousPost].map((model) => model.countDocuments({ createdAt: { $gte: window.start } }))),
    // Fresh: the dashboard has its own cache, and its numbers must agree with each other.
    getModerationSummary({ refresh: true }),
    riskDistribution(),
    topThreats(threats),
  ]);
  const [totalStudents, posts, projects, communities, opportunities, published, pendingReports, reviewingReports] = totals;
  const [studentTrend, postTrend, projectTrend, communityTrend, opportunityTrend, reportTrend, caseTrend] = trends;
  const [newStudents, newPosts, newProjects, newReports, staffActions, automatedActions] = activity;
  const [createdPosts, createdComments, createdProjects, createdAchievements, createdCommunities, createdAnonymous] = creation;

  return {
    cards: {
      totalStudents: { value: totalStudents, trend: studentTrend },
      activeStudents: { value: activeStudents, windowDays: activeDays },
      totalPosts: { value: posts, trend: postTrend },
      totalProjects: { value: projects, trend: projectTrend },
      totalCommunities: { value: communities, trend: communityTrend },
      totalOpportunities: { value: opportunities, published, trend: opportunityTrend },
      pendingReports: { value: pendingReports, reviewing: reviewingReports, trend: reportTrend },
      openCases: { value: summary.cases.active, highRisk: summary.highRisk, trend: caseTrend },
    },
    activity: {
      days: window.keys,
      series: { students: newStudents, posts: newPosts, projects: newProjects, reports: newReports, staffActions, automatedActions },
    },
    contentCreation: {
      days: activityDays,
      items: [
        { id: 'posts', label: 'Posts', value: createdPosts },
        { id: 'comments', label: 'Comments', value: createdComments },
        { id: 'projects', label: 'Projects', value: createdProjects },
        { id: 'achievements', label: 'Achievements', value: createdAchievements },
        { id: 'communities', label: 'Communities', value: createdCommunities },
        { id: 'anonymousPosts', label: 'Anonymous posts', value: createdAnonymous },
      ],
    },
    caseStatus: summary.cases,
    contentStatus: summary.content,
    riskRadar: risk,
    threats: threatList,
    generatedAt: new Date().toISOString(),
  };
}

/** GET /admin/dashboard. `refresh` skips the cache (the "refresh" button). */
export async function getDashboard(actor, { refresh = false } = {}) {
  assertPermission(actor, PERMISSIONS.VIEW_DASHBOARD);
  let data = refresh ? null : await getCache(CACHE_KEY);
  if (!data) {
    data = await buildDashboard();
    await setCache(CACHE_KEY, data, ADMIN_CACHE_SECONDS.dashboard);
  }
  const auditStream = hasPermission(actor, PERMISSIONS.VIEW_AUDIT_LOGS) ? await latestAudit(DASHBOARD_RULES.auditStream) : null;
  return { ...data, auditStream };
}

/**
 * GET /admin/system-status: what the server itself reports, nothing assumed. The API is online if this
 * answers; database, Redis and live updates report their own state. No hosts, URIs or versions.
 */
export function getSystemStatus(actor) {
  assertPermission(actor, PERMISSIONS.VIEW_DASHBOARD);
  const redis = getRedisStatus();
  return {
    api: 'online',
    database: getDatabaseStatus(),
    redis,
    cache: redis === 'connected' ? 'redis' : 'memory',
    realtime: getSocketStatus(),
    environment: env.nodeEnv,
    uptimeSeconds: Math.round(process.uptime()),
    checkedAt: new Date().toISOString(),
  };
}
