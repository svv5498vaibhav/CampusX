// Semester Roadmap: all eight semesters, branch tracks, career goals (suggested, chosen, changed without
// losing progress), milestone completion and undo, duplicate and simultaneous requests, progress maths,
// persistence across sign-in, ownership (no way to touch another student's roadmap), safe links, the
// once-per-semester gamification award, validation and rate limits.
import { createSuite, eventually, oid, sleep } from '../lib/harness.mjs';

const t = await createSuite('roadmap');
const { check, section, api, register, relogin, db } = t;
const roadmapOf = async (who) => (await api('GET', '/roadmap/me', { token: who.token })).data;
const complete = (who, id) => api('PATCH', `/roadmap/milestones/${id}/complete`, { token: who.token });
const setStatus = (who, id, status) => api('PATCH', `/roadmap/milestones/${id}/progress`, { token: who.token, body: { status } });
const points = async (who) => (await api('GET', '/gamification/me', { token: who.token })).data.totalPoints;
const roadmapAwards = (who) => db.collection('pointtransactions').find({ user: oid(who.id), action: 'ROADMAP_SEMESTER_COMPLETED' }).toArray();
const requiredIds = (view, semester) => view.semesters[semester - 1].milestones.filter((m) => m.required).map((m) => m.id);
const allIds = (view) => view.semesters.flatMap((s) => s.milestones.map((m) => m.id));

try {
  section('Setup');
  const asha = await register('Asha', 'Rao', { branch: 'cse', semester: 5, interests: ['web-development', 'ai-ml', 'hackathons'], skills: ['React', 'Git'] });
  const bilal = await register('Bilal', 'Khan', { branch: 'mechanical', semester: 3, interests: ['ai-ml', 'robotics', 'sports'] });
  const chitra = await register('Chitra', 'Iyer', { branch: 'entc', semester: 1, interests: ['sports', 'music', 'photography'] });
  const dev = await register('Dev', 'Patel', { branch: 'aids', semester: 8, interests: ['sports', 'music', 'photography'] });
  const fresh = await register('Fara', 'Shaikh', { onboard: false });

  section('Access');
  check('signed out → 401', (await api('GET', '/roadmap/me')).status === 401);
  const everyRoute = [['GET', '/roadmap/me'], ['GET', '/roadmap/progress'], ['GET', '/roadmap/templates'], ['GET', '/roadmap/semester/3'], ['PUT', '/roadmap/preferences', { careerGoal: 'mobile' }], ['PATCH', '/roadmap/milestones/s1-git-github/complete'], ['PATCH', '/roadmap/milestones/s1-git-github/progress', { status: 'completed' }]];
  const unauthenticated = await Promise.all(everyRoute.map(([method, path, body]) => api(method, path, { body })));
  check('every roadmap route without a token → 401', unauthenticated.every((res) => res.status === 401), unauthenticated.map((res) => res.status));
  const notOnboarded = await api('GET', '/roadmap/me', { token: fresh.token });
  check('not onboarded yet → 409 with a clear message', notOnboarded.status === 409 && /onboarding/i.test(notOnboarded.body?.message), notOnboarded.body);
  check('no template write routes exist (POST /roadmap/templates → 404)', (await api('POST', '/roadmap/templates', { token: asha.token, body: { title: 'x' } })).status === 404);
  check('no route takes another student id (GET /roadmap/:userId → 404)', (await api('GET', `/roadmap/${bilal.id}`, { token: asha.token })).status === 404);

  section('All eight semesters');
  const a0 = await roadmapOf(asha);
  check('eight semesters, numbered 1–8 in order', a0.semesters.length === 8 && a0.semesters.every((s, i) => s.semester === i + 1), a0.semesters.map((s) => s.semester));
  check('every semester has required milestones', a0.semesters.every((s) => s.progress.required > 0 && s.milestones.some((m) => m.required)));
  check('student details come from the profile (CSE, semester 5 of 8, college name)', a0.student.branch.id === 'cse' && a0.student.currentSemester === 5 && a0.student.totalSemesters === 8 && /VNIT/.test(a0.student.college.name) && a0.student.track.id === 'computing', a0.student);
  check('the current semester is marked: only semester 5 isCurrent', a0.semesters.filter((s) => s.isCurrent).map((s) => s.semester).join() === '5');
  check('states before any progress: 1–4 needs attention, 5 in progress, 6–8 upcoming', a0.semesters.map((s) => s.state).join() === 'needs-attention,needs-attention,needs-attention,needs-attention,in-progress,upcoming,upcoming,upcoming', a0.semesters.map((s) => s.state));
  check('nothing is invented: 0% overall, 0 completed, no last activity', a0.overall.percentage === 0 && a0.overall.completed === 0 && a0.lastActivityAt === null && a0.overall.remaining === a0.overall.required);
  check('a template note says it is a suggestion, not an official syllabus', /not an official/i.test(a0.template.note));
  const ids = allIds(a0);
  check('milestone ids are unique', new Set(ids).size === ids.length);
  const sample = a0.semesters[4].milestones[0];
  check('milestones carry title, summary, category, difficulty, effort, objectives, skills, resources, prerequisites, status', ['title', 'summary', 'category', 'difficulty', 'effortHours', 'objectives', 'skills', 'resources', 'prerequisites', 'status', 'required'].every((key) => key in sample), Object.keys(sample));

  section('GET /roadmap/semester/:semester');
  for (const semester of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const res = await api('GET', `/roadmap/semester/${semester}`, { token: asha.token });
    check(`semester ${semester} → 200 with its own milestones`, res.status === 200 && res.data.semester.semester === semester && res.data.semester.milestones.every((m) => m.semester === semester), res.status);
  }
  for (const bad of ['0', '9', '-1', 'abc', '5.5', '%24ne']) {
    check(`semester "${bad}" → 422`, (await api('GET', `/roadmap/semester/${bad}`, { token: asha.token })).status === 422);
  }

  section('Career goals: suggested from interests, branch and default');
  check('web-development interest → Full Stack suggested', a0.careerGoal.id === 'full-stack' && a0.careerGoal.source === 'suggested' && a0.goals.find((g) => g.id === 'full-stack').suggested);
  check('seven goals offered', a0.goals.length === 7 && ['full-stack', 'frontend', 'backend', 'ai-ml', 'data-analyst', 'cybersecurity', 'mobile'].every((id) => a0.goals.some((g) => g.id === id)));
  const b0 = await roadmapOf(bilal);
  check('ai-ml interest → AI/ML suggested', b0.careerGoal.id === 'ai-ml');
  const d0 = await roadmapOf(dev);
  check('no matching interest, AI & DS branch → Data Analyst suggested', d0.careerGoal.id === 'data-analyst');
  const c0 = await roadmapOf(chitra);
  check('no matching interest or branch → Full Stack default', c0.careerGoal.id === 'full-stack');
  check('Full Stack semester 5 has React, Node.js, MongoDB and a full-stack project', ['s5-react', 's5-node-backend', 's5-mongodb-rest', 's5-capstone-project'].every((id) => requiredIds(a0, 5).includes(id)) && a0.semesters[4].milestones.find((m) => m.id === 's5-capstone-project').title === 'Full-stack project');
  check('AI/ML semester 5 has deep learning and no React', requiredIds(b0, 5).includes('s5-deep-learning') && !allIds(b0).includes('s5-react'));

  section('Branch tracks');
  check('mechanical → core track; OS and networks optional; a "code for your branch" bridge (optional)', b0.student.track.id === 'core' && b0.semesters[2].milestones.find((m) => m.id === 's3-operating-systems').required === false && b0.semesters[3].milestones.find((m) => m.id === 's4-computer-networks').required === false && b0.semesters[2].milestones.some((m) => m.id === 's3-branch-bridge-core' && !m.required));
  check('E&TC → electronics track with the hardware bridge; networks required', c0.student.track.id === 'electronics' && allIds(c0).includes('s3-branch-bridge-electronics') && !allIds(c0).includes('s3-branch-bridge-core') && c0.semesters[3].milestones.find((m) => m.id === 's4-computer-networks').required);
  check('CSE → no bridge milestones, OS required', !allIds(a0).some((id) => id.includes('bridge')) && a0.semesters[2].milestones.find((m) => m.id === 's3-operating-systems').required);
  check('optional milestones never count towards progress totals', b0.semesters[2].progress.required === b0.semesters[2].milestones.filter((m) => m.required).length && b0.semesters[2].progress.optional >= 2);

  section('Templates');
  const templates = await api('GET', '/roadmap/templates', { token: bilal.token });
  check('templates: 7 goals for the student’s track with per-semester counts', templates.status === 200 && templates.data.track.id === 'core' && templates.data.goals.length === 7 && templates.data.goals.every((g) => g.semesters.length === 8 && g.semesters.every((s) => s.milestones > 0) && g.milestones > 0), templates.data?.goals?.map((g) => g.milestones));

  section('Safe links');
  const resources = (await Promise.all([a0, b0, c0, d0].map(async (view) => view.semesters.flatMap((s) => s.milestones.flatMap((m) => m.resources))))).flat();
  const external = resources.filter((r) => r.kind !== 'campusx');
  check('every external resource is a plain https link (no credentials, no javascript:/data:)', external.length > 30 && external.every((r) => { const url = new URL(r.url); return url.protocol === 'https:' && !url.username && !url.password; }), external.filter((r) => !r.url?.startsWith('https://')));
  check('CampusX resources point to known in-app pages only', resources.filter((r) => r.kind === 'campusx').every((r) => ['/opportunities', '/opportunities/my', '/projects/create', '/achievements/create', '/communities', '/profile/edit'].includes(r.path)));
  check('some milestones honestly have no resources yet (empty list, no made-up links)', a0.semesters.some((s) => s.milestones.some((m) => m.resources.length === 0)));

  section('Completing a milestone');
  const first = await complete(asha, 's5-react');
  check('PATCH …/complete → 200, changed, status completed with a timestamp', first.status === 200 && first.data.changed === true && first.data.milestone.status === 'completed' && Boolean(first.data.milestone.completedAt), first.body);
  check('progress recalculated from required milestones (1 of N)', first.data.roadmap.semesters[4].progress.completed === 1 && first.data.roadmap.overall.completed === 1 && first.data.roadmap.overall.percentage === Math.floor(100 / first.data.roadmap.overall.required));
  check('last activity recorded', Boolean(first.data.roadmap.lastActivityAt));
  const stored = await db.collection('studentroadmapprogresses').findOne({ user: oid(asha.id) });
  check('stored for the signed-in student: goal fixed from the suggestion, milestone record kept', stored && stored.careerGoal === 'full-stack' && stored.goalChosenAt === null && stored.milestones['s5-react'].status === 'completed' && stored.templateVersion === 1, stored);
  const again = await complete(asha, 's5-react');
  check('repeating the same request → 200, changed: false, completion time unchanged', again.status === 200 && again.data.changed === false && new Date(again.data.milestone.completedAt).getTime() === new Date(first.data.milestone.completedAt).getTime());
  const burst = await Promise.all(Array.from({ length: 6 }, () => complete(asha, 's5-node-backend')));
  check('6 simultaneous completes of one milestone → exactly one change', burst.every((r) => r.status === 200) && burst.filter((r) => r.data.changed).length === 1, burst.map((r) => r.data?.changed));
  check('unknown milestone → 404', (await complete(asha, 's9-not-a-milestone')).status === 404);
  const otherGoal = await complete(asha, 's5-deep-learning');
  check('a milestone from another goal’s roadmap → 404 "not part of your current roadmap"', otherGoal.status === 404 && /current roadmap/.test(otherGoal.body?.message), otherGoal.body);
  check('malformed milestone id → 422', (await complete(asha, 'Bad.Id$')).status === 422);

  section('In progress and undo');
  const started = await setStatus(asha, 's5-mongodb-rest', 'in-progress');
  check('in-progress → recorded with a start time, not counted as complete', started.status === 200 && started.data.milestone.status === 'in-progress' && Boolean(started.data.milestone.startedAt) && started.data.roadmap.semesters[4].progress.inProgress === 1 && started.data.roadmap.semesters[4].progress.completed === 2);
  check('next milestone: the one in progress this semester ("continue")', started.data.roadmap.nextMilestone?.id === 's5-mongodb-rest' && started.data.roadmap.nextMilestone.reason === 'continue', started.data.roadmap.nextMilestone);
  const undo = await setStatus(asha, 's5-react', 'not-started');
  check('undo a completed milestone → not started, progress goes down', undo.status === 200 && undo.data.milestone.status === 'not-started' && undo.data.roadmap.semesters[4].progress.completed === 1);
  check('undo again → changed: false', (await setStatus(asha, 's5-react', 'not-started')).data.changed === false);
  check('bad status → 422', (await setStatus(asha, 's5-react', 'done')).status === 422 && (await api('PATCH', '/roadmap/milestones/s5-react/progress', { token: asha.token, body: {} })).status === 422);
  await setStatus(asha, 's5-react', 'completed');

  section('Semester completion and the once-per-semester award');
  const pointsBefore = await points(asha);
  const s5 = requiredIds(await roadmapOf(asha), 5);
  let completion = null;
  for (const id of s5) {
    const res = await complete(asha, id);
    if (res.data.semesterCompleted) completion = { id, res };
  }
  check('exactly the last required milestone reports semesterCompleted', completion?.id === s5.at(-1), completion?.id);
  const done5 = completion.res.data.roadmap.semesters[4];
  check('semester 5 → completed, 100%, completion time set', done5.state === 'completed' && done5.progress.percentage === 100 && Boolean(done5.completedAt), done5.state);
  check('re-completing a finished semester’s milestone never reports completion again', (await complete(asha, s5[0])).data.semesterCompleted === false);
  const awarded = await eventually(async () => (await points(asha)) === pointsBefore + 10);
  check('semester completion awards 10 XP once', Boolean(awarded), [pointsBefore, await points(asha)]);
  check('and the Pathfinder badge', Boolean(await eventually(async () => (await api('GET', '/gamification/me', { token: asha.token })).data.badges.earned.some((b) => b.key === 'PATHFINDER'))));
  const pathfinderNotices = () => db.collection('notifications').countDocuments({ recipient: oid(asha.id), type: 'BADGE_EARNED', entityId: 'PATHFINDER' });
  check('the badge arrives as one "You earned Pathfinder" notification', Boolean(await eventually(async () => (await pathfinderNotices()) === 1)));
  await setStatus(asha, s5[0], 'not-started');
  check('undoing a milestone of a completed semester takes the 10 XP back', Boolean(await eventually(async () => (await points(asha)) === pointsBefore)));
  const redo = await complete(asha, s5[0]);
  check('finishing it again reports completion again (a real state change)', redo.data.semesterCompleted === true);
  await eventually(async () => (await points(asha)) === pointsBefore + 10);
  for (let i = 0; i < 3; i += 1) {
    await setStatus(asha, s5[0], 'not-started');
    await complete(asha, s5[0]);
  }
  await sleep(800);
  const rows = await roadmapAwards(asha);
  check('undo/redo storm: one award row only (reversed and reinstated), net +10', rows.filter((r) => r.kind === 'award').length === 1 && (await points(asha)) === pointsBefore + 10, rows.map((r) => `${r.kind}:${r.points}`));
  check('…and still only one Pathfinder notification after the storm', (await pathfinderNotices()) === 1);
  const ledger = (await db.collection('pointtransactions').find({ user: oid(asha.id) }).toArray()).reduce((sum, r) => sum + r.points, 0);
  check('the ledger still adds up to the total', ledger === (await points(asha)), [ledger, await points(asha)]);

  section('Simultaneous completion of a semester');
  const s1 = requiredIds(await roadmapOf(asha), 1);
  for (const id of s1.slice(0, -2)) await complete(asha, id);
  const lastTwo = await Promise.all(s1.slice(-2).map((id) => complete(asha, id)));
  check('two last milestones completed at once → exactly one reports the semester complete', lastTwo.filter((r) => r.data.semesterCompleted).length === 1, lastTwo.map((r) => r.data.semesterCompleted));
  const semesterOnePoints = await eventually(async () => (await roadmapAwards(asha)).filter((r) => r.sourceId === '1' && r.kind === 'award').length === 1);
  check('semester 1 award recorded once', Boolean(semesterOnePoints));

  section('Overall progress maths');
  const a1 = await roadmapOf(asha);
  const req = a1.semesters.flatMap((s) => s.milestones.filter((m) => m.required));
  const doneCount = req.filter((m) => m.status === 'completed').length;
  check('overall = completed required / required (rounded down)', a1.overall.completed === doneCount && a1.overall.required === req.length && a1.overall.percentage === Math.floor((doneCount / req.length) * 100), a1.overall);
  check('semestersCompleted counts semesters 1 and 5', a1.overall.semestersCompleted === 2 && a1.semesters[0].state === 'completed');
  check('effort remaining = sum of open required milestones', a1.semesters[1].effortHoursRemaining === a1.semesters[1].milestones.filter((m) => m.required && m.status !== 'completed').reduce((s, m) => s + m.effortHours, 0));
  check('skill mastery comes from milestones; profile skills are marked', a1.skills.find((s) => s.name === 'React')?.onProfile === true && a1.skills.find((s) => s.name === 'React').completed >= 1 && a1.skills.every((s) => s.completed <= s.total));
  check('next milestone: catch-up from an earlier semester once semester 5 is done', a1.nextMilestone?.reason === 'catch-up' && a1.nextMilestone.semester < 5, a1.nextMilestone);
  const summary = await api('GET', '/roadmap/progress', { token: asha.token });
  check('GET /roadmap/progress matches the full roadmap', summary.status === 200 && summary.data.overall.percentage === a1.overall.percentage && summary.data.semesters.length === 8 && summary.data.careerGoal.id === 'full-stack');

  section('Changing the career goal keeps progress');
  const sharedBefore = a1.semesters[0].progress.completed;
  const change = await api('PUT', '/roadmap/preferences', { token: asha.token, body: { careerGoal: 'ai-ml' } });
  check('PUT /preferences careerGoal → 200, goal is now chosen', change.status === 200 && change.data.roadmap.careerGoal.id === 'ai-ml' && change.data.roadmap.careerGoal.source === 'chosen', change.body);
  check('shared milestones stay complete (semester 1 still complete)', change.data.roadmap.semesters[0].state === 'completed' && change.data.roadmap.semesters[0].progress.completed === sharedBefore);
  check('full-stack-only milestones are saved, not deleted', change.data.goalChange.saved >= 3 && change.data.roadmap.savedElsewhere === change.data.goalChange.saved && change.data.goalChange.carriedOver > 0, change.data.goalChange);
  check('semester 5 is no longer complete for the new goal', change.data.roadmap.semesters[4].state !== 'completed');
  const storedAfter = await db.collection('studentroadmapprogresses').findOne({ user: oid(asha.id) });
  check('stored records unchanged by the goal change', storedAfter.milestones['s5-react']?.status === 'completed' && storedAfter.careerGoal === 'ai-ml');
  check('semester 5 award reversed for the new goal, semester 1 kept', Boolean(await eventually(async () => { const r = await roadmapAwards(asha); return r.find((x) => x.sourceId === '5' && x.kind === 'award')?.reversed === true && r.find((x) => x.sourceId === '1' && x.kind === 'award')?.reversed === false; })));
  const back = await api('PUT', '/roadmap/preferences', { token: asha.token, body: { careerGoal: 'full-stack' } });
  check('switching back restores semester 5 as completed', back.data.roadmap.semesters[4].state === 'completed' && back.data.roadmap.savedElsewhere === 0);
  check('…and reinstates (not re-awards) its points', Boolean(await eventually(async () => { const r = await roadmapAwards(asha); return r.filter((x) => x.sourceId === '5' && x.kind === 'award').length === 1 && r.find((x) => x.sourceId === '5' && x.kind === 'award').reversed === false; })));
  check('unknown goal → 422', (await api('PUT', '/roadmap/preferences', { token: asha.token, body: { careerGoal: 'astronaut' } })).status === 422);
  check('operator injection in goal → 422', (await api('PUT', '/roadmap/preferences', { token: asha.token, body: { careerGoal: { $ne: null } } })).status === 422);
  check('empty preferences → 422', (await api('PUT', '/roadmap/preferences', { token: asha.token, body: {} })).status === 422);

  section('Selected semester');
  const pick = await api('PUT', '/roadmap/preferences', { token: asha.token, body: { selectedSemester: 3 } });
  check('selectedSemester saved', pick.status === 200 && pick.data.roadmap.selectedSemester === 3 && pick.data.goalChange === null);
  check('"7" is accepted as 7', (await api('PUT', '/roadmap/preferences', { token: asha.token, body: { selectedSemester: '7' } })).data.roadmap.selectedSemester === 7);
  for (const bad of [0, 9, 2.5, 'x', null]) check(`selectedSemester ${JSON.stringify(bad)} → 422`, (await api('PUT', '/roadmap/preferences', { token: asha.token, body: { selectedSemester: bad } })).status === 422);

  section('Persistence across refresh and sign-in');
  const beforeLogin = await roadmapOf(asha);
  await api('POST', '/auth/logout', { token: asha.token, cookie: asha.cookie });
  check('after logout the old token no longer works', (await api('GET', '/roadmap/me', { token: asha.token })).status === 401);
  await relogin(asha);
  const afterLogin = await roadmapOf(asha);
  check('after signing in again: same goal, selection, progress and timestamps', afterLogin.careerGoal.id === beforeLogin.careerGoal.id && afterLogin.selectedSemester === 7 && afterLogin.overall.completed === beforeLogin.overall.completed && JSON.stringify(afterLogin.semesters.map((s) => s.milestones.map((m) => [m.id, m.status, m.completedAt]))) === JSON.stringify(beforeLogin.semesters.map((s) => s.milestones.map((m) => [m.id, m.status, m.completedAt]))));

  section('Ownership');
  const bilalBefore = await roadmapOf(bilal);
  const forged = await api('PATCH', '/roadmap/milestones/s1-git-github/complete', { token: asha.token, body: { user: bilal.id, userId: bilal.id } });
  check('a user id in the body is ignored: the change lands on the signed-in student only', forged.status === 200 && (await roadmapOf(bilal)).overall.completed === bilalBefore.overall.completed);
  await api('PUT', '/roadmap/preferences', { token: asha.token, body: { careerGoal: 'mobile', user: bilal.id } });
  check("another student's goal is never changed", (await roadmapOf(bilal)).careerGoal.id === 'ai-ml' && (await db.collection('studentroadmapprogresses').countDocuments({ user: oid(bilal.id) })) === 0);
  const bilalView = await roadmapOf(bilal);
  check("students only ever see their own progress (Bilal's roadmap shows none of Asha's)", bilalView.overall.completed === 0 && bilalView.lastActivityAt === null);
  await api('PUT', '/roadmap/preferences', { token: asha.token, body: { careerGoal: 'full-stack' } });

  section('Profile change: a new branch re-checks the awards');
  const awardsBefore = (await roadmapAwards(asha)).filter((r) => r.kind === 'award' && !r.reversed).length;
  await api('PUT', '/profile', { token: asha.token, body: { branch: 'mechanical' } });
  const moved = await roadmapOf(asha);
  check('roadmap follows the new branch track (core)', moved.student.track.id === 'core' && moved.semesters[2].milestones.some((m) => m.id === 's3-branch-bridge-core'));
  check('awards still match completed semesters after the change', Boolean(await eventually(async () => {
    const view = await roadmapOf(asha);
    const live = (await roadmapAwards(asha)).filter((r) => r.kind === 'award' && !r.reversed).map((r) => Number(r.sourceId)).sort().join();
    return live === view.semesters.filter((s) => s.state === 'completed').map((s) => s.semester).join();
  })), awardsBefore);

  section('Next milestone respects prerequisites');
  const b1 = await roadmapOf(bilal);
  check('nothing done: next is a semester-3 milestone without prerequisites (DBMS), not DSA', b1.nextMilestone?.id === 's3-dbms-sql' && b1.nextMilestone.reason === 'current', b1.nextMilestone);
  await complete(bilal, 's2-data-structures');
  const b2 = await roadmapOf(bilal);
  check('once its prerequisite is done, DSA (first in order) becomes next', b2.nextMilestone?.id === 's3-dsa', b2.nextMilestone);
  for (const id of requiredIds(b2, 3)) await complete(bilal, id);
  const b3 = await roadmapOf(bilal);
  check('current semester done → catch up on the earliest ready milestone of an earlier semester', b3.nextMilestone?.reason === 'catch-up' && b3.nextMilestone.id === 's1-programming-fundamentals', b3.nextMilestone);

  section('Rate limit');
  const flood = [];
  for (let i = 0; i < 160; i += 1) flood.push(await api('PUT', '/roadmap/preferences', { token: dev.token, body: { selectedSemester: (i % 8) + 1 } }));
  check('more than 150 changes in 10 minutes → 429', flood.some((r) => r.status === 429) && flood.slice(0, 150).every((r) => r.status === 200), flood.map((r) => r.status).filter((s) => s !== 200).slice(0, 3));
  check('reads still work while changes are limited', (await api('GET', '/roadmap/me', { token: dev.token })).status === 200);

  section('Account status');
  await db.collection('users').updateOne({ _id: oid(chitra.id) }, { $set: { status: 'suspended' } });
  const suspendedRead = await api('GET', '/roadmap/me', { token: chitra.token });
  const suspendedWrite = await complete(chitra, 's1-git-github');
  check('a suspended student can neither read nor change a roadmap (403)', suspendedRead.status === 403 && suspendedWrite.status === 403, [suspendedRead.status, suspendedWrite.status]);
  check('...and nothing was stored', (await db.collection('studentroadmapprogresses').countDocuments({ user: oid(chitra.id) })) === 0);
} catch (error) {
  check('suite ran to the end without crashing', false, error.stack);
}
await t.finish();
