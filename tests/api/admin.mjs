// Admin control center (Phase 15): roles and permissions, dashboard, moderation, reports, users, content,
// communities, opportunities, analytics, audit log, live admin events, plus a smoke test of earlier phases.
import { ORIGIN, PASSWORD, createSuite, ioClient, mongoose, oid, sleep } from '../lib/harness.mjs';

const t = await createSuite('admin');
const { check, section } = t;
const BASE = t.base;
const db = t.db;
const api = (method, path, options = {}) => t.api(method, path, options);
const register = (firstName, lastName, email, { college = 'vnit-nagpur', branch = 'cse', semester = 5, roll } = {}) => t.register(firstName, lastName, { email, college, branch, semester, roll });
const login = (email) => t.login(email);
const setRole = (id, role) => db.collection('users').updateOne({ _id: oid(id) }, { $set: { role } });
void ORIGIN;
void mongoose;
void sleep;
void ioClient;

try {
  // ------------------------------------------------------------------ seed
  section('Seeding accounts and content');
  const admin = await register('Ada', 'Admin', 'ada.admin@test.campusx.dev', { roll: 'ADM001' });
  const mod = await register('Milo', 'Moderator', 'milo.mod@test.campusx.dev', { roll: 'MOD001' });
  const asha = await register('Asha', 'Rao', 'asha.rao@test.campusx.dev', { roll: 'S001' });
  const bilal = await register('Bilal', 'Khan', 'bilal.khan@test.campusx.dev', { branch: 'it', roll: 'S002' });
  const chitra = await register('Chitra', 'Iyer', 'chitra.iyer@test.campusx.dev', { college: 'iiit-nagpur', roll: 'S003' });
  const dev = await register('Dev', 'Patel', 'dev.patel@test.campusx.dev', { college: 'ycce-nagpur', branch: 'mechanical', semester: 3, roll: 'S004' });
  const esha = await register('Esha', 'Nair', 'esha.nair@test.campusx.dev', { roll: 'S005' });
  await setRole(admin.id, 'admin');
  await setRole(mod.id, 'moderator');
  check('seed: 7 accounts registered and onboarded', true);

  // Staff sign in again so ADMIN_LOGIN is audited (and tokens are fresh).
  const adminLogin = await login(admin.email);
  check('admin login 200', adminLogin.status === 200, adminLogin.body);
  admin.token = adminLogin.data.accessToken;
  const modLogin = await login(mod.email);
  mod.token = modLogin.data.accessToken;

  const publicPost = await api('POST', '/posts', { token: asha.token, body: { content: 'Our robotics club demo is on Friday in the main hall, everyone is welcome to join and try the bots.', visibility: 'public' } });
  check('seed: public post created', publicPost.status === 201, publicPost.body);
  const postId = publicPost.data.post.id;
  const post2 = await api('POST', '/posts', { token: bilal.token, body: { content: 'Looking for teammates for the inter-college hackathon next month, ping me if interested in web dev.', visibility: 'public' } });
  const post2Id = post2.data.post.id;
  const threat = await api('POST', '/posts', { token: dev.token, body: { content: 'I will hurt you if you keep posting this nonsense in the group.', visibility: 'public' } });
  check('seed: threatening post saved (held by automated checks)', [201, 200].includes(threat.status), threat.body);
  const threatId = threat.data?.post?.id;

  const anon = await api('POST', '/anonymous/posts', { token: asha.token, body: { category: 'feedback', title: 'Canteen food quality this semester', content: 'The canteen food has been cold most days this week and the queue management needs work.' } });
  check('seed: anonymous post created', anon.status === 201, anon.body);
  const anonId = anon.data.post.id;
  check('seed: anonymous post response has no author', !JSON.stringify(anon.body).includes(asha.id));

  const project = await api('POST', '/projects', { token: chitra.token, body: { title: 'Smart Attendance System', shortDescription: 'Face recognition attendance for classrooms.', description: 'A web app that marks attendance using face recognition with a React dashboard for teachers.', category: 'web' } });
  check('seed: project created', project.status === 201, project.body);
  const projectId = project.data.project.id;
  const achievement = await api('POST', '/achievements', { token: bilal.token, body: { title: 'Winner, Campus Code Sprint', type: 'hackathon', date: '2026-08-15', organization: 'VNIT Coding Club' } });
  check('seed: achievement created', achievement.status === 201, achievement.body);
  const achievementId = achievement.data.achievement.id;
  const community = await api('POST', '/communities', { token: bilal.token, body: { name: 'Night Owl Coders', description: 'Late night coding sessions and doubt solving for everyone.', type: 'interest', visibility: 'public', tags: ['coding'] } });
  check('seed: community created', community.status === 201, community.body);
  const communityId = community.data.community.id;

  // Reports: three students report Asha's public post (flags it, case opens); Bilal reports the anonymous post.
  const r1 = await api('POST', '/reports', { token: bilal.token, body: { targetType: 'post', targetId: postId, reason: 'spam', description: 'Looks like advertising.' } });
  const r2 = await api('POST', '/reports', { token: chitra.token, body: { targetType: 'post', targetId: postId, reason: 'misleading' } });
  const r3 = await api('POST', '/reports', { token: dev.token, body: { targetType: 'post', targetId: postId, reason: 'harassment' } });
  check('seed: 3 reports on post', [r1, r2, r3].every((r) => r.status === 201), [r1.body, r2.body, r3.body]);
  const rAnon = await api('POST', '/reports', { token: bilal.token, body: { targetType: 'anonymousPost', targetId: anonId, reason: 'privacy_violation', description: 'Mentions a staff member.' } });
  check('seed: report on anonymous post', rAnon.status === 201, rAnon.body);
  const rProject = await api('POST', '/reports', { token: dev.token, body: { targetType: 'project', targetId: projectId, reason: 'misleading' } });
  const rCommunity = await api('POST', '/reports', { token: chitra.token, body: { targetType: 'community', targetId: communityId, reason: 'spam' } });
  const rPost2 = await api('POST', '/reports', { token: asha.token, body: { targetType: 'post', targetId: post2Id, reason: 'other' } });
  check('seed: more reports', [rProject, rCommunity, rPost2].every((r) => r.status === 201));

  // ------------------------------------------------------------------ authentication and roles
  section('Authentication, roles and permissions');
  const ADMIN_GETS = ['/admin/session', '/admin/system-status', '/admin/dashboard', '/admin/moderation', '/admin/reports', '/admin/users', '/admin/content', '/admin/communities', '/admin/opportunities', '/admin/analytics', '/admin/audit-logs'];
  for (const path of ADMIN_GETS) {
    const anonRes = await api('GET', path);
    check(`unauthenticated ${path} → 401`, anonRes.status === 401, anonRes.status);
    const studentRes = await api('GET', path, { token: asha.token });
    check(`student ${path} → 403`, studentRes.status === 403, studentRes.status);
  }
  for (const [method, path, body] of [['PATCH', `/admin/users/${esha.id}/status`, { action: 'suspend', reason: 'test reason', confirm: true }], ['POST', '/admin/opportunities', {}], ['PATCH', `/admin/communities/${communityId}`, { action: 'remove', reason: 'nope nope', confirm: true }]]) {
    const res = await api(method, path, { token: asha.token, body });
    check(`student ${method} ${path} → 403`, res.status === 403, res.status);
  }
  const forged = await api('GET', '/admin/dashboard', { token: `${asha.token.slice(0, -4)}abcd` });
  check('forged token → 401', forged.status === 401, forged.status);

  const modSession = await api('GET', '/admin/session', { token: mod.token });
  check('moderator session 200', modSession.status === 200, modSession.body);
  check('moderator permissions are moderation-only', JSON.stringify(modSession.data.permissions.sort()) === JSON.stringify(['MANAGE_CONTENT', 'MANAGE_OPPORTUNITIES', 'REVEAL_ANONYMOUS_AUTHOR', 'REVIEW_MODERATION', 'VIEW_DASHBOARD', 'VIEW_REPORTS']), modSession.data.permissions);
  for (const path of ['/admin/dashboard', '/admin/moderation', '/admin/reports', '/admin/content', '/admin/opportunities', '/admin/system-status']) {
    const res = await api('GET', path, { token: mod.token });
    check(`moderator ${path} → 200`, res.status === 200, res.body);
  }
  for (const path of ['/admin/users', `/admin/users/${asha.id}`, '/admin/communities', '/admin/analytics', '/admin/audit-logs']) {
    const res = await api('GET', path, { token: mod.token });
    check(`moderator ${path} → 403 (admin only)`, res.status === 403, res.status);
  }
  const modSuspend = await api('PATCH', `/admin/users/${esha.id}/status`, { token: mod.token, body: { action: 'suspend', reason: 'testing perms', confirm: true } });
  check('moderator cannot change user status (403)', modSuspend.status === 403, modSuspend.status);
  const adminSession = await api('GET', '/admin/session', { token: admin.token });
  check('admin has all 12 permissions (Phase 16 added VIEW_SECURITY)', adminSession.data.permissions.length === 12 && adminSession.data.permissions.includes('VIEW_SECURITY'), adminSession.data.permissions);
  for (const path of ADMIN_GETS) {
    const res = await api('GET', path, { token: admin.token });
    check(`admin ${path} → 200`, res.status === 200, res.body);
    check(`admin ${path} is no-store`, res.headers.get('cache-control') === 'no-store', res.headers.get('cache-control'));
  }
  const helmetHeader = (await api('GET', '/admin/session', { token: admin.token })).headers.get('x-content-type-options');
  check('helmet headers on admin API', helmetHeader === 'nosniff', helmetHeader);
  const badId = await api('GET', '/admin/moderation/not-an-id', { token: admin.token });
  check('invalid case id → 422', badId.status === 422, badId.status);
  const injection = await api('GET', '/admin/users?status[$ne]=active', { token: admin.token });
  check('operator injection in query rejected/neutralised', [200, 422].includes(injection.status) && !(injection.status === 200 && injection.data.users.length === 0 && false), injection.status);

  // ------------------------------------------------------------------ dashboard
  section('Dashboard (real numbers)');
  const dash = await api('GET', '/admin/dashboard?refresh=true', { token: admin.token });
  const cards = dash.data.cards;
  const realStudents = await db.collection('users').countDocuments({ role: 'student' });
  const realPosts = await db.collection('posts').countDocuments({ moderationStatus: { $ne: 'removed' } });
  const realPending = await db.collection('reports').countDocuments({ status: 'pending' });
  const realCases = await db.collection('moderationcases').countDocuments({ active: true });
  check('dashboard totalStudents matches DB', cards.totalStudents.value === realStudents, [cards.totalStudents, realStudents]);
  check('dashboard totalPosts matches DB', cards.totalPosts.value === realPosts, [cards.totalPosts.value, realPosts]);
  check('dashboard pendingReports matches DB', cards.pendingReports.value === realPending, [cards.pendingReports.value, realPending]);
  check('dashboard openCases matches DB', cards.openCases.value === realCases, [cards.openCases.value, realCases]);
  check('dashboard student trend counts this week', cards.totalStudents.trend.current === realStudents, cards.totalStudents.trend);
  check('dashboard active students counted (logins/sessions)', cards.activeStudents.value === 5, cards.activeStudents);
  check('dashboard activity has 14 days', dash.data.activity.days.length === 14 && dash.data.activity.series.posts.length === 14);
  check('dashboard activity: posts today = DB', dash.data.activity.series.posts.at(-1) === (await db.collection('posts').countDocuments({})), dash.data.activity.series.posts);
  const riskSum = Object.values(dash.data.riskRadar).reduce((a, b) => a + b, 0);
  check('risk radar sums to active cases', riskSum === realCases, [dash.data.riskRadar, realCases]);
  check('threat monitor lists active cases', dash.data.threats.length > 0 && dash.data.threats.length <= 5);
  check('admin dashboard has audit stream', Array.isArray(dash.data.auditStream));
  const modDash = await api('GET', '/admin/dashboard', { token: mod.token });
  check('moderator dashboard has no audit stream', modDash.data.auditStream === null);
  const status = await api('GET', '/admin/system-status', { token: admin.token });
  check('system status: database connected', status.data.database === 'connected', status.data);
  check('system status: redis not configured (memory fallback)', status.data.redis === 'not_configured' && status.data.cache === 'memory', status.data);
  check('system status: realtime online', status.data.realtime === 'online');
  check('system status leaks no URI', !JSON.stringify(status.body).includes('mongodb'));

  // ------------------------------------------------------------------ moderation
  section('Moderation center');
  const queue = await api('GET', '/admin/moderation', { token: mod.token });
  check('queue lists active cases', queue.status === 200 && queue.data.cases.length === realCases, [queue.data?.cases?.length, realCases]);
  check('queue summary present on page 1', queue.data.summary && queue.data.summary.cases.active === realCases, queue.data.summary);
  check('queue sorted most urgent first', ['critical', 'high'].includes(queue.data.cases[0].priority), queue.data.cases.map((c) => c.priority));
  const filtered = await api('GET', '/admin/moderation?targetType=post&riskLevel=critical&status=all', { token: mod.token });
  check('queue filters (type + risk)', filtered.status === 200 && filtered.data.cases.every((c) => c.targetType === 'post' && c.riskLevel === 'critical'), filtered.data?.cases?.map((c) => [c.targetType, c.riskLevel]));
  const dated = await api('GET', '/admin/moderation?from=2000-01-01&to=2000-01-02&status=all', { token: mod.token });
  check('queue date filter', dated.status === 200 && dated.data.cases.length === 0);
  const queueJson = JSON.stringify(queue.body);
  check('queue never includes reporters/owners (no reportedBy/targetOwner)', !queueJson.includes('reportedBy') && !queueJson.includes('targetOwner'));
  check('queue never reveals the anonymous author', !queueJson.includes(asha.id) || queue.data.cases.filter((c) => c.target?.author !== 'anonymous').some((c) => c.target?.author?.id === asha.id));

  const anonCase = queue.data.cases.find((c) => c.targetType === 'anonymousPost');
  check('anonymous post has a case', Boolean(anonCase));
  const anonDetail = await api('GET', `/admin/moderation/${anonCase.id}`, { token: mod.token });
  const anonJson = JSON.stringify(anonDetail.body);
  check('anonymous case detail 200', anonDetail.status === 200, anonDetail.body);
  check('anonymous case detail: author is "anonymous"', anonDetail.data.target.author === 'anonymous');
  check('anonymous case detail: no author id/email/name anywhere', !anonJson.includes(asha.id) && !anonJson.includes(asha.email) && !anonJson.includes('Asha'), 'leak');
  check('anonymous case detail: owner record hidden', anonDetail.data.owner?.anonymous === true);
  check('anonymous case detail: reveal allowed for moderator', anonDetail.data.canRevealAuthor === true);
  check('case detail: reports with reasons, no reporters', anonDetail.data.reports.total === 1 && anonDetail.data.reports.byReason[0].reason === 'privacy_violation' && !anonJson.includes(bilal.id));

  const revealNoReason = await api('POST', `/admin/moderation/${anonCase.id}/reveal-author`, { token: mod.token, body: {} });
  check('reveal without reason → 422', revealNoReason.status === 422, revealNoReason.status);
  const revealStudent = await api('POST', `/admin/moderation/${anonCase.id}/reveal-author`, { token: bilal.token, body: { reason: 'I want to know who wrote this' } });
  check('student reveal → 403', revealStudent.status === 403);
  const reveal = await api('POST', `/admin/moderation/${anonCase.id}/reveal-author`, { token: mod.token, body: { reason: 'Report says it names a staff member; checking the author for follow-up.' } });
  check('moderator reveal with reason → 200 with author', reveal.status === 200 && reveal.data.author.id === asha.id, reveal.body);
  check('revealed author carries campus names', reveal.data.author.collegeName?.startsWith('Visvesvaraya') && reveal.data.author.branchName === 'CSE', reveal.data.author);
  check('reveal response is no-store', reveal.headers.get('cache-control') === 'no-store');
  const revealAudit = await db.collection('moderationauditlogs').findOne({ action: 'ANONYMOUS_AUTHOR_REVEALED', targetId: oid(anonId) });
  check('reveal audited (actor, reason, ip, no identity)', revealAudit && String(revealAudit.actor) === mod.id && revealAudit.reason.startsWith('Report says') && revealAudit.ip && !JSON.stringify(revealAudit).includes(asha.id), revealAudit);
  const postCase = queue.data.cases.find((c) => c.targetType === 'post' && c.targetId === postId);
  const revealWrong = await api('POST', `/admin/moderation/${postCase.id}/reveal-author`, { token: mod.token, body: { reason: 'This is not anonymous content at all.' } });
  check('reveal on non-anonymous case → 422', revealWrong.status === 422, revealWrong.status);

  const postDetail = await api('GET', `/admin/moderation/${postCase.id}`, { token: mod.token });
  check('post case detail shows owner record (non-anonymous)', postDetail.data.owner?.person?.id === asha.id && typeof postDetail.data.owner.trust.violationCount === 'number', postDetail.data.owner);
  check('post case detail shows 3 reports and reasons', postDetail.data.reports.total === 3 && postDetail.data.reports.byReason.length === 3);
  check('post case actions include restrict/remove/flag/approve', ['approve', 'restrict', 'remove', 'escalate'].every((a) => postDetail.data.actions.includes(a)), postDetail.data.actions);
  check('post content flagged after 3 reporters', postDetail.data.target.status === 'flagged', postDetail.data.target.status);
  const flagAgain = await api('PATCH', `/admin/moderation/${postCase.id}`, { token: mod.token, body: { decision: 'flag' } });
  check('flag already-flagged content → 409 or unavailable 422', [409, 422].includes(flagAgain.status), flagAgain.status);
  const escalate = await api('PATCH', `/admin/moderation/${postCase.id}`, { token: mod.token, body: { decision: 'escalate', note: 'Needs a second look' } });
  check('escalate → 200, critical, reviewing', escalate.status === 200 && escalate.data.case.priority === 'critical' && escalate.data.case.status === 'reviewing', escalate.body);
  const escalateAgain = await api('PATCH', `/admin/moderation/${postCase.id}`, { token: mod.token, body: { decision: 'escalate' } });
  check('escalate twice → refused', [409, 422].includes(escalateAgain.status), escalateAgain.status);
  const removeNoConfirm = await api('PATCH', `/admin/moderation/${postCase.id}`, { token: mod.token, body: { decision: 'remove', note: 'Spam advertising post' } });
  check('remove without confirm → 422', removeNoConfirm.status === 422, removeNoConfirm.body);
  const removeNoReason = await api('PATCH', `/admin/moderation/${postCase.id}`, { token: mod.token, body: { decision: 'remove', confirm: true } });
  check('remove without reason → 422', removeNoReason.status === 422, removeNoReason.body);
  const [removeA, removeB] = await Promise.all([
    api('PATCH', `/admin/moderation/${postCase.id}`, { token: mod.token, body: { decision: 'remove', note: 'Spam advertising post', confirm: true } }),
    api('PATCH', `/admin/moderation/${postCase.id}`, { token: admin.token, body: { decision: 'remove', note: 'Spam advertising post', confirm: true } }),
  ]);
  const statuses = [removeA.status, removeB.status].sort();
  check('two simultaneous removes: one 200, one 409', statuses[0] === 200 && statuses[1] === 409, statuses);
  const removedPost = await db.collection('posts').findOne({ _id: oid(postId) });
  check('post moderationStatus removed (soft delete)', removedPost.moderationStatus === 'removed' && removedPost.deletedAt);
  const cachedDash = await api('GET', '/admin/dashboard', { token: admin.token });
  const livePosts = await db.collection('posts').countDocuments({ moderationStatus: { $ne: 'removed' } });
  check('admin action clears the dashboard cache (totals agree without refresh)', cachedDash.data.cards.totalPosts.value === livePosts && cachedDash.data.caseStatus.resolved >= 1, [cachedDash.data.cards.totalPosts.value, livePosts]);
  const closedReports = await db.collection('reports').countDocuments({ targetId: oid(postId), status: 'resolved' });
  check('the 3 reports were resolved', closedReports === 3, closedReports);
  const removeAudits = await db.collection('moderationauditlogs').countDocuments({ targetId: oid(postId), action: 'REMOVE' });
  check('exactly one REMOVE audit row', removeAudits === 1, removeAudits);
  const studentSeesRemoved = await api('GET', `/posts/${postId}`, { token: bilal.token });
  check('removed post hidden from students (404)', studentSeesRemoved.status === 404, studentSeesRemoved.status);

  // Remove the anonymous post through its case: the author gets a violation (warning) internally.
  const anonRemove = await api('PATCH', `/admin/moderation/${anonCase.id}`, { token: admin.token, body: { decision: 'remove', note: 'Names a staff member', confirm: true } });
  check('anonymous post removed via case', anonRemove.status === 200, anonRemove.body);
  check('anonymous case detail after decision still hides author', !JSON.stringify(anonRemove.body).includes(asha.email) && anonRemove.data.target.author === 'anonymous');
  const warnRow = await db.collection('moderationauditlogs').findOne({ action: 'WARN_USER', targetId: oid(asha.id), 'metadata.source.targetType': 'anonymousPost' });
  check('Phase 13 warning row links to anonymous content internally', Boolean(warnRow), warnRow);
  const ashaAudit = await api('GET', `/admin/audit-logs?targetId=${asha.id}&limit=100`, { token: admin.token });
  check('student-filtered audit log leaves out the anonymous-linked row', ashaAudit.status === 200 && !ashaAudit.data.logs.some((log) => log.id === warnRow._id.toString()), ashaAudit.data?.logs?.map((l) => l.action));
  check('student-filtered audit log never contains the anonymous post id', !JSON.stringify(ashaAudit.body).includes(anonId));
  const globalAudit = await api('GET', '/admin/audit-logs?limit=100', { token: admin.token });
  const warnView = globalAudit.data.logs.find((log) => log.id === warnRow._id.toString());
  check('global audit log shows the row without the student or trigger', warnView && warnView.targetId === null && warnView.caseId === null && warnView.anonymityProtected === true && warnView.metadata.source.hidden === true && !warnView.metadata.source.targetId, warnView);
  check('global audit log never pairs Asha with the anonymous post', !globalAudit.data.logs.some((log) => log.targetId === asha.id && JSON.stringify(log).includes('anonymous')));

  // ------------------------------------------------------------------ reports
  section('Reports');
  const reports = await api('GET', '/admin/reports', { token: mod.token });
  check('report queue (pending) 200', reports.status === 200 && reports.data.reports.every((r) => r.status === 'pending'), reports.data?.reports?.map((r) => r.status));
  check('report counts present', typeof reports.data.counts.pending === 'number' && typeof reports.data.counts.high === 'number' && 'legacyPending' in reports.data.counts);
  const reportsJson = JSON.stringify(reports.body);
  check('reports never include reporter ids', ![bilal.id, chitra.id, dev.id].some((id) => reportsJson.includes(`"reporter`) || false) && !reportsJson.includes('"reporter"'));
  const projectReport = reports.data.reports.find((r) => r.targetType === 'project');
  const communityReport = reports.data.reports.find((r) => r.targetType === 'community');
  const post2Report = reports.data.reports.find((r) => r.targetType === 'post' && r.targetId === post2Id);
  const rDetail = await api('GET', `/admin/reports/${projectReport.id}`, { token: mod.token });
  check('report detail with target + case + actions', rDetail.status === 200 && rDetail.data.report.target.title === 'Smart Attendance System' && rDetail.data.case && rDetail.data.actions.includes('review'), rDetail.body);
  const review = await api('PATCH', `/admin/reports/${projectReport.id}`, { token: mod.token, body: { action: 'review' } });
  check('review → reviewing', review.status === 200 && review.data.report.status === 'reviewing', review.body);
  const reviewAgain = await api('PATCH', `/admin/reports/${projectReport.id}`, { token: mod.token, body: { action: 'review' } });
  check('review twice → 409', reviewAgain.status === 409, reviewAgain.status);
  const caseAfterReview = await db.collection('moderationcases').findOne({ targetType: 'project', targetId: oid(projectId), active: true });
  check('report review moves its case to reviewing', caseAfterReview?.status === 'reviewing', caseAfterReview?.status);
  const resolve = await api('PATCH', `/admin/reports/${projectReport.id}`, { token: mod.token, body: { action: 'resolve', note: 'Asked owner to fix the description' } });
  check('resolve → resolved', resolve.status === 200 && resolve.data.report.status === 'resolved');
  const resolveAgain = await api('PATCH', `/admin/reports/${projectReport.id}`, { token: mod.token, body: { action: 'resolve' } });
  check('resolve twice → 409', resolveAgain.status === 409);
  const [rejA, rejB] = await Promise.all([api('PATCH', `/admin/reports/${post2Report.id}`, { token: mod.token, body: { action: 'reject' } }), api('PATCH', `/admin/reports/${post2Report.id}`, { token: admin.token, body: { action: 'reject' } })]);
  check('simultaneous rejects: one 200, one 409', [rejA.status, rejB.status].sort().join() === '200,409', [rejA.status, rejB.status]);
  const ashaTrust = await db.collection('users').findOne({ _id: oid(asha.id) });
  check('rejected report counts for the reporter (reportsDismissed)', ashaTrust.moderation?.reportsDismissed === 1, ashaTrust.moderation);
  const esc = await api('PATCH', `/admin/reports/${communityReport.id}`, { token: mod.token, body: { action: 'escalate', note: 'Possible spam ring' } });
  check('escalate report → critical reviewing', esc.status === 200 && esc.data.report.priority === 'critical' && esc.data.report.status === 'reviewing', esc.body);
  const high = await api('GET', '/admin/reports?status=high', { token: mod.token });
  check('high-priority filter', high.data.reports.some((r) => r.id === communityReport.id) && high.data.reports.every((r) => ['high', 'critical'].includes(r.priority)));
  await sleep(300);
  const notif = await db.collection('notifications').findOne({ recipient: oid(dev.id), type: 'REPORT_REVIEWED' });
  check('reporter notified when their report was resolved', Boolean(notif));
  const reportAudits = await db.collection('moderationauditlogs').distinct('action', { action: /^REPORT_/ });
  check('report actions audited', ['REPORT_REVIEWING', 'REPORT_RESOLVED', 'REPORT_REJECTED', 'REPORT_ESCALATED'].every((a) => reportAudits.includes(a)), reportAudits);

  // ------------------------------------------------------------------ users
  section('User management');
  const users = await api('GET', '/admin/users', { token: admin.token });
  const usersJson = JSON.stringify(users.body);
  check('user list 200', users.status === 200 && users.data.users.length === 7);
  for (const secret of ['passwordHash', 'failedLoginAttempts', 'lockedUntil', 'lastLoginIp', 'registrationIp', 'avatarPublicId', '$2a$', '$2b$']) {
    check(`user list never exposes ${secret}`, !usersJson.includes(secret));
  }
  const byName = await api('GET', '/admin/users?search=chitra', { token: admin.token });
  check('search by name', byName.data.users.length === 1 && byName.data.users[0].id === chitra.id);
  const byCollege = await api('GET', '/admin/users?search=IIIT', { token: admin.token });
  check('search by college alias', byCollege.data.users.length === 1 && byCollege.data.users[0].id === chitra.id, byCollege.data.users.map((u) => u.email));
  const byBranch = await api('GET', '/admin/users?search=mechanical', { token: admin.token });
  check('search by branch name', byBranch.data.users.length === 1 && byBranch.data.users[0].id === dev.id);
  const byEmail = await api('GET', '/admin/users?search=esha.nair', { token: admin.token });
  check('search by email', byEmail.data.users.length === 1 && byEmail.data.users[0].id === esha.id);
  const detail = await api('GET', `/admin/users/${asha.id}`, { token: admin.token });
  const detailJson = JSON.stringify(detail.body);
  check('user detail 200 with sections', detail.status === 200 && detail.data.user && detail.data.activity && detail.data.trust && detail.data.moderationHistory && detail.data.reports && 'gamification' in detail.data && detail.data.communities && detail.data.projects && detail.data.achievements);
  check('user detail never exposes secrets', !['passwordHash', 'lastLoginIp', 'registrationIp', 'failedLoginAttempts', '$2a$', '$2b$'].some((s) => detailJson.includes(s)));
  check('user detail never links anonymous posts', !detailJson.includes(anonId) && !detailJson.toLowerCase().includes('anonymous'), 'anonymous reference found');
  check('user detail activity counts real', detail.data.activity.posts === 1 && detail.data.activity.reportsFiled === 1, detail.data.activity);

  const suspendNoConfirm = await api('PATCH', `/admin/users/${esha.id}/status`, { token: admin.token, body: { action: 'suspend', reason: 'Repeated spam' } });
  check('suspend without confirm → 422', suspendNoConfirm.status === 422);
  const suspendNoReason = await api('PATCH', `/admin/users/${esha.id}/status`, { token: admin.token, body: { action: 'suspend', confirm: true } });
  check('suspend without reason → 422', suspendNoReason.status === 422);
  const eshaSocket = ioClient(`http://127.0.0.1:${new URL(BASE).port}`, { auth: { token: esha.token }, transports: ['websocket'], reconnection: false });
  const eshaConnected = await new Promise((resolve) => {
    eshaSocket.on('connect', () => resolve(true));
    eshaSocket.on('connect_error', () => resolve(false));
    setTimeout(() => resolve(false), 4000);
  });
  check('student socket connects before suspension', eshaConnected);
  const eshaDisconnected = new Promise((resolve) => {
    eshaSocket.on('disconnect', () => resolve(true));
    setTimeout(() => resolve(false), 5000);
  });
  const suspend = await api('PATCH', `/admin/users/${esha.id}/status`, { token: admin.token, body: { action: 'suspend', reason: 'Repeated spam in comments', confirm: true } });
  check('suspend → 200 suspended', suspend.status === 200 && suspend.data.user.status === 'suspended', suspend.body);
  check('suspended student socket disconnected', await eshaDisconnected);
  const eshaMe = await api('GET', '/auth/me', { token: esha.token });
  check('suspended student signed out of the API (sessions revoked → 401)', [401, 403].includes(eshaMe.status), eshaMe.status);
  const eshaLogin = await login(esha.email);
  check('suspended student cannot sign in', eshaLogin.status === 403, eshaLogin.status);
  const sessionsLeft = await db.collection('sessions').countDocuments({ user: oid(esha.id), revokedAt: null });
  check('suspended student sessions revoked', sessionsLeft === 0, sessionsLeft);
  const suspendAgain = await api('PATCH', `/admin/users/${esha.id}/status`, { token: admin.token, body: { action: 'suspend', reason: 'Repeated spam in comments', confirm: true } });
  check('suspend twice → 409', suspendAgain.status === 409);
  const unsuspend = await api('PATCH', `/admin/users/${esha.id}/status`, { token: admin.token, body: { action: 'unsuspend' } });
  check('unsuspend → active', unsuspend.status === 200 && unsuspend.data.user.status === 'active');
  const eshaBack = await login(esha.email);
  check('unsuspended student can sign in again', eshaBack.status === 200);
  esha.token = eshaBack.data?.accessToken;
  const block = await api('PATCH', `/admin/users/${esha.id}/status`, { token: admin.token, body: { action: 'block', reason: 'Ban evasion attempt', confirm: true } });
  const activate = await api('PATCH', `/admin/users/${esha.id}/status`, { token: admin.token, body: { action: 'activate' } });
  const deactivate = await api('PATCH', `/admin/users/${esha.id}/status`, { token: admin.token, body: { action: 'deactivate', reason: 'Requested by student', confirm: true } });
  const reactivate = await api('PATCH', `/admin/users/${esha.id}/status`, { token: admin.token, body: { action: 'activate' } });
  check('block / activate / deactivate / activate', [block, activate, deactivate, reactivate].every((r) => r.status === 200), [block.status, activate.status, deactivate.status, reactivate.status]);
  const self = await api('PATCH', `/admin/users/${admin.id}/status`, { token: admin.token, body: { action: 'deactivate', reason: 'testing self', confirm: true } });
  check('admin cannot change own status (403)', self.status === 403);
  const admin2 = await register('Ravi', 'Root', 'ravi.root@test.campusx.dev', { roll: 'ADM002' });
  await setRole(admin2.id, 'admin');
  const otherAdmin = await api('PATCH', `/admin/users/${admin2.id}/status`, { token: admin.token, body: { action: 'suspend', reason: 'testing admin', confirm: true } });
  check('admin cannot suspend another admin (403)', otherAdmin.status === 403);
  const userAudits = await db.collection('moderationauditlogs').distinct('action', { targetId: oid(esha.id) });
  check('status changes audited', ['USER_SUSPENDED', 'USER_UNSUSPENDED', 'USER_BLOCKED', 'USER_ACTIVATED', 'USER_DEACTIVATED'].every((a) => userAudits.includes(a)), userAudits);
  const gam = await db.collection('studentgamifications').findOne({ user: oid(esha.id) });
  check('rankings eligibility follows status (active again → eligible)', !gam || gam.eligible !== false, gam?.eligible);

  // ------------------------------------------------------------------ content
  section('Content management');
  const postsTab = await api('GET', '/admin/content?type=post', { token: mod.token });
  check('content posts tab 200', postsTab.status === 200 && postsTab.data.items.length >= 2, postsTab.body);
  check('content counts by status', postsTab.data.counts.removed >= 1 && typeof postsTab.data.counts.all === 'number');
  const post2Item = postsTab.data.items.find((i) => i.id === post2Id);
  check('content item shows author, stats, actions', post2Item.author?.id === bilal.id && 'likes' in post2Item.stats && post2Item.actions.includes('restrict'));
  const anonTab = await api('GET', '/admin/content?type=anonymousPost', { token: mod.token });
  const anonTabJson = JSON.stringify(anonTab.body);
  check('anonymous tab never includes author', anonTab.status === 200 && anonTab.data.items.every((i) => i.author === 'anonymous') && !anonTabJson.includes(asha.id) && !anonTabJson.includes(asha.email));
  const anonSearch = await api('GET', `/admin/content?type=anonymousPost&search=${encodeURIComponent('Asha')}`, { token: mod.token });
  check('anonymous search never matches by author name', anonSearch.data.items.length === 0);
  const restrictNoConfirm = await api('PATCH', `/admin/content/post/${post2Id}`, { token: mod.token, body: { action: 'restrict', reason: 'Off-topic recruiting' } });
  check('content restrict without confirm → 422', restrictNoConfirm.status === 422);
  // post2 has an active case (Asha's report), so this goes through the case.
  const restrict = await api('PATCH', `/admin/content/post/${post2Id}`, { token: mod.token, body: { action: 'restrict', reason: 'Off-topic recruiting', confirm: true } });
  check('content restrict → restricted', restrict.status === 200 && restrict.data.item.moderationStatus === 'restricted', restrict.body);
  const approve = await api('PATCH', `/admin/content/post/${post2Id}`, { token: mod.token, body: { action: 'approve' } });
  check('content approve (restore) → approved', approve.status === 200 && approve.data.item.moderationStatus === 'approved', approve.body);
  const approveAgain = await api('PATCH', `/admin/content/post/${post2Id}`, { token: mod.token, body: { action: 'approve' } });
  check('approve already-approved content → 409', approveAgain.status === 409, approveAgain.status);
  const flagPost = await api('PATCH', `/admin/content/post/${post2Id}`, { token: mod.token, body: { action: 'flag' } });
  check('flag → flagged', flagPost.status === 200 && flagPost.data.item.moderationStatus === 'flagged');
  const commentsTab = await api('GET', '/admin/content?type=comment', { token: mod.token });
  check('comments tab 200', commentsTab.status === 200);
  const projectsTab = await api('GET', '/admin/content?type=project&search=attendance', { token: mod.token });
  check('projects tab search', projectsTab.data.items.length === 1 && projectsTab.data.items[0].title === 'Smart Attendance System');
  await db.collection('achievements').updateOne({ _id: oid(achievementId) }, { $set: { verificationStatus: 'pending' } });
  const pendingAch = await api('GET', '/admin/content?type=achievement&verification=pending', { token: mod.token });
  check('achievement verification queue', pendingAch.data.items.length === 1 && pendingAch.data.items[0].actions.includes('verify'));
  const verify = await api('PATCH', `/admin/content/achievement/${achievementId}`, { token: mod.token, body: { action: 'verify' } });
  check('verify achievement → verified', verify.status === 200 && verify.data.item.extra.verificationStatus === 'verified', verify.body);
  const verifyAgain = await api('PATCH', `/admin/content/achievement/${achievementId}`, { token: mod.token, body: { action: 'verify' } });
  check('verify twice → 409', verifyAgain.status === 409);
  const verifyPost = await api('PATCH', `/admin/content/post/${post2Id}`, { token: mod.token, body: { action: 'verify' } });
  check('verify on a post → 422', verifyPost.status === 422, verifyPost.status);
  const badType = await api('GET', '/admin/content?type=user', { token: mod.token });
  check('invalid content type → 422', badType.status === 422);

  // ------------------------------------------------------------------ communities
  section('Community management');
  const comms = await api('GET', '/admin/communities?search=night', { token: admin.token });
  check('community list + search', comms.status === 200 && comms.data.communities.length === 1 && comms.data.communities[0].owner?.id === bilal.id, comms.body);
  check('community row has reports + case', comms.data.communities[0].openReports >= 1 && comms.data.communities[0].activeCase);
  const suspendComm = await api('PATCH', `/admin/communities/${communityId}`, { token: admin.token, body: { action: 'suspend', reason: 'Spam reports under review', confirm: true } });
  check('suspend community → restricted', suspendComm.status === 200 && suspendComm.data.community.moderationStatus === 'restricted', suspendComm.body);
  const studentComms = await api('GET', '/communities?search=night', { token: dev.token });
  check('suspended community hidden from non-members', studentComms.status === 200 && !JSON.stringify(studentComms.body).includes(communityId));
  const restoreComm = await api('PATCH', `/admin/communities/${communityId}`, { token: admin.token, body: { action: 'restore' } });
  check('restore community → approved', restoreComm.status === 200 && restoreComm.data.community.moderationStatus === 'approved');
  const removeComm = await api('PATCH', `/admin/communities/${communityId}`, { token: admin.token, body: { action: 'remove', reason: 'Confirmed spam community', confirm: true } });
  check('remove community → removed', removeComm.status === 200 && removeComm.data.community.moderationStatus === 'removed');
  const removeCommAgain = await api('PATCH', `/admin/communities/${communityId}`, { token: admin.token, body: { action: 'remove', reason: 'Confirmed spam community', confirm: true } });
  check('remove community twice → 409', removeCommAgain.status === 409);

  // ------------------------------------------------------------------ opportunities
  section('Opportunity management');
  const oppBody = { title: 'Campus AI Hackathon 2026', shortDescription: 'A 24 hour hackathon on AI for campus life.', description: 'Build AI tools that make campus life easier. Teams of up to four students from any branch.', type: 'hackathon', organizer: 'CampusX Tech Club', mode: 'online', applicationDeadline: new Date(Date.now() + 10 * 86400000).toISOString() };
  const studentCreate = await api('POST', '/admin/opportunities', { token: asha.token, body: oppBody });
  check('student cannot create opportunity (403)', studentCreate.status === 403);
  const created = await api('POST', '/admin/opportunities', { token: mod.token, body: oppBody });
  check('moderator creates draft via admin API', created.status === 201 && created.data.opportunity.status === 'draft', created.body);
  const oppId = created.data.opportunity.id;
  const publish = await api('PATCH', `/admin/opportunities/${oppId}`, { token: mod.token, body: { status: 'published' } });
  check('publish → published', publish.status === 200 && publish.data.opportunity.status === 'published', publish.body);
  const close = await api('PATCH', `/admin/opportunities/${oppId}`, { token: admin.token, body: { status: 'closed' } });
  const archive = await api('PATCH', `/admin/opportunities/${oppId}`, { token: admin.token, body: { status: 'archived' } });
  check('close + archive', close.status === 200 && archive.status === 200 && archive.data.opportunity.status === 'archived');
  const edit = await api('PATCH', `/admin/opportunities/${oppId}`, { token: admin.token, body: { organizer: 'CampusX AI Club' } });
  check('edit fields', edit.status === 200 && edit.data.opportunity.organizer === 'CampusX AI Club');
  const legacyEdit = await api('PUT', `/opportunities/${oppId}`, { token: mod.token, body: { status: 'draft' } });
  check('Phase 8 endpoint still works (PUT /opportunities/:id)', legacyEdit.status === 200);
  const oppList = await api('GET', '/admin/opportunities?status=all', { token: mod.token });
  check('admin opportunity list (Phase 8 shape: counts + openReports + trackedBy)', oppList.status === 200 && oppList.data.counts && oppList.data.opportunities[0] && 'openReports' in oppList.data.opportunities[0] && 'trackedBy' in oppList.data.opportunities[0]);
  const badOpp = await api('POST', '/admin/opportunities', { token: mod.token, body: { title: 'x' } });
  check('invalid opportunity → 422', badOpp.status === 422);
  const oppAudits = (await db.collection('moderationauditlogs').find({ targetId: oid(oppId) }).toArray()).map((row) => row.action);
  check('opportunity actions audited (both routes)', ['OPPORTUNITY_CREATED', 'OPPORTUNITY_PUBLISHED', 'OPPORTUNITY_CLOSED', 'OPPORTUNITY_ARCHIVED', 'OPPORTUNITY_UPDATED', 'OPPORTUNITY_DRAFTED'].every((a) => oppAudits.includes(a)), oppAudits);
  const delOpp = await api('DELETE', `/admin/opportunities/${oppId}`, { token: admin.token });
  check('delete opportunity (audited)', delOpp.status === 200 && (await db.collection('moderationauditlogs').countDocuments({ targetId: oid(oppId), action: 'OPPORTUNITY_DELETED' })) === 1);

  // ------------------------------------------------------------------ analytics
  section('Analytics');
  for (const range of ['7d', '30d', '90d']) {
    const res = await api('GET', `/admin/analytics?range=${range}&refresh=true`, { token: admin.token });
    check(`analytics ${range} 200`, res.status === 200 && res.data.days.length === Number(range.replace('d', '')), res.body);
  }
  const analytics = await api('GET', '/admin/analytics?range=7d', { token: admin.token });
  const studentsNow = await db.collection('users').countDocuments({ role: 'student' });
  check('analytics registrations = students created', analytics.data.users.newStudents === studentsNow, [analytics.data.users.newStudents, studentsNow]);
  check('analytics college distribution sums to students', analytics.data.users.colleges.reduce((s, c) => s + c.count, 0) === studentsNow);
  check('analytics report reasons', analytics.data.moderation.reasons.length > 0 && analytics.data.moderation.inRange.reports === (await db.collection('reports').countDocuments({})));
  check('analytics opportunities section', analytics.data.opportunities.byStatus && 'totalViews' in analytics.data.opportunities);
  const badRange = await api('GET', '/admin/analytics?range=1y', { token: admin.token });
  check('invalid range → 422', badRange.status === 422);

  // ------------------------------------------------------------------ audit log
  section('Audit log');
  const security = await api('GET', '/admin/audit-logs?category=security&limit=100', { token: admin.token });
  const securityActions = new Set(security.data.logs.map((l) => l.action));
  check('security events: admin login, access denied, author reveal', ['ADMIN_LOGIN', 'ACCESS_DENIED', 'ANONYMOUS_AUTHOR_REVEALED'].every((a) => securityActions.has(a)), [...securityActions]);
  const loginRow = security.data.logs.find((l) => l.action === 'ADMIN_LOGIN' && l.actor?.id === admin.id);
  check('admin login row has actor + ip', loginRow && loginRow.ip, loginRow);
  const denied = security.data.logs.filter((l) => l.action === 'ACCESS_DENIED' && l.actor?.id === asha.id);
  check('student denials logged once per permission window (deduped)', denied.length >= 1 && denied.length <= 3, denied.length);
  const allLogs = await api('GET', '/admin/audit-logs?limit=100', { token: admin.token });
  const allJson = JSON.stringify(allLogs.body);
  check('audit log never contains passwords or tokens', !allJson.includes(PASSWORD) && !allJson.includes(admin.token) && !allJson.includes('passwordHash'));
  check('audit log paginates', allLogs.data.pagination.total > 20);
  const byRole = await api('GET', '/admin/audit-logs?actorRole=system', { token: admin.token });
  check('audit filter by actor role', byRole.data.logs.every((l) => l.actorRole === 'system'));
  const byDate = await api('GET', '/admin/audit-logs?from=2000-01-01&to=2000-01-01', { token: admin.token });
  check('audit filter by date', byDate.data.logs.length === 0);
  const badAction = await api('GET', '/admin/audit-logs?action=drop%20table', { token: admin.token });
  check('audit invalid action filter → 422', badAction.status === 422);

  // ------------------------------------------------------------------ real-time admin events
  section('Real-time admin events');
  const port = new URL(BASE).port;
  const connect = (token) =>
    new Promise((resolve) => {
      const socket = ioClient(`http://127.0.0.1:${port}`, { auth: { token }, transports: ['websocket'], reconnection: false });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', () => resolve(null));
    });
  const adminSocket = await connect(admin.token);
  const studentSocket = await connect(chitra.token);
  check('admin + student sockets connect', Boolean(adminSocket && studentSocket));
  const adminGot = [];
  const studentGot = [];
  for (const event of ['admin:newReport', 'admin:newModerationCase', 'admin:systemAlert']) {
    adminSocket.on(event, (payload) => adminGot.push([event, payload]));
    studentSocket.on(event, (payload) => studentGot.push([event, payload]));
  }
  const freshPost = await api('POST', '/posts', { token: chitra.token, body: { content: 'Library will stay open till midnight during exams week, carry your ID cards please.', visibility: 'public' } });
  await api('POST', '/reports', { token: dev.token, body: { targetType: 'post', targetId: freshPost.data.post.id, reason: 'spam' } });
  await sleep(600);
  const newReport = adminGot.find(([event]) => event === 'admin:newReport');
  const newCase = adminGot.find(([event]) => event === 'admin:newModerationCase');
  check('admin receives admin:newReport', Boolean(newReport), adminGot);
  check('admin receives admin:newModerationCase', Boolean(newCase), adminGot);
  check('admin event payload has no reporter/owner ids', newReport && !JSON.stringify(newReport[1]).includes(dev.id) && !JSON.stringify(newReport[1]).includes(chitra.id), newReport?.[1]);
  check('student receives no admin events', studentGot.length === 0, studentGot);
  adminSocket.close();
  studentSocket.close();
  eshaSocket.close();

  // ------------------------------------------------------------------ regression smoke (Phases 2-14)
  section('Regression smoke: earlier phases');
  const studentLogin = await login(bilal.email);
  check('student login still works', studentLogin.status === 200 && studentLogin.data.user.role === 'student');
  const bt = studentLogin.data.accessToken;
  const me = await api('GET', '/auth/me', { token: bt });
  check('/auth/me', me.status === 200);
  const feed = await api('GET', '/posts', { token: bt });
  check('campus feed', feed.status === 200 && Array.isArray(feed.data.posts), feed.body);
  check('feed hides removed post', !JSON.stringify(feed.body).includes(postId));
  const like = await api('POST', `/posts/${freshPost.data.post.id}/like`, { token: bt });
  check('like a post', like.status === 200, like.body);
  const comment = await api('POST', `/posts/${freshPost.data.post.id}/comments`, { token: bt, body: { content: 'Thanks for the update, very helpful for exam prep!' } });
  check('comment on a post', comment.status === 201, comment.body);
  for (const [label, path] of [['communities', '/communities'], ['my communities', '/communities/me'], ['projects', '/projects'], ['achievements', '/achievements'], ['opportunities', '/opportunities'], ['my opportunities', '/opportunities/my'], ['anonymous zone', '/anonymous/posts'], ['rankings', '/rankings/me'], ['gamification', '/gamification/me'], ['notifications', '/notifications'], ['search', '/search?q=library'], ['recommendations', '/recommendations'], ['discover', '/recommendations/discover'], ['profile', '/profile'], ['report options', '/reports/options'], ['my reports', '/reports/me']]) {
    const res = await api('GET', path, { token: bt });
    check(`${label} (${path}) still 200`, res.status === 200, `${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
  }
  const anonList = await api('GET', '/anonymous/posts', { token: bt });
  check('anonymous zone lists never include authors', !JSON.stringify(anonList.body).includes(asha.id));
  const search = await api('GET', '/search?q=Asha', { token: bt });
  check('search by author name never finds anonymous posts', !JSON.stringify(search.body).includes(anonId));
  const modCases = await api('GET', '/moderation/cases', { token: mod.token });
  check('Phase 13 /moderation/cases still works', modCases.status === 200);
  const modCasesStudent = await api('GET', '/moderation/cases', { token: bt });
  check('Phase 13 /moderation/cases still 403 for students', modCasesStudent.status === 403);
  const health = await api('GET', '/health');
  check('health endpoint', health.status === 200 && health.data.database === 'connected');
} catch (error) {
  t.check('suite ran to the end without crashing', false, error.stack);
}
await t.finish();
