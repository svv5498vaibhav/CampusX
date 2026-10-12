// Recommendations (Phase 14): cold start, personal fit with plain reasons, eligibility (open, eligible
// opportunities only), privacy (private, own, suspended, other-college), moderation filtering, dismiss and
// not-interested, interactions, home and discover, paging, and no duplicates.
import { createSuite, oid, sleep } from '../lib/harness.mjs';

const t = await createSuite('recommendations');
const { check, section, api, register, db, must } = t;
const recIds = (res) => (res.data?.recommendations ?? []).map((item) => item.id);
const rec = (who, type, query = '') => api('GET', `/recommendations/${type}${query}`, { token: who.token });

try {
  section('Cold start');
  const newbie = await register('Neha', 'Verma', { interests: ['ai-ml', 'data-science', 'web-development'], skills: ['Python'] });
  const home = await api('GET', '/recommendations', { token: newbie.token });
  check('a brand-new student gets a home page (no errors, no empty crash)', home.status === 200, home.body);
  const types = ['posts', 'projects', 'communities', 'opportunities', 'students', 'achievements'];
  for (const type of types) check(`cold start: /recommendations/${type} answers 200`, (await rec(newbie, type)).status === 200);
  check('unknown type → 404', (await api('GET', '/recommendations/memes', { token: newbie.token })).status === 404);

  section('Personal fit and reasons');
  const maker = await register('Rohan', 'Das', { interests: ['ai-ml', 'robotics', 'hackathons'] });
  const other = await register('Sara', 'Khan', { college: 'iiit-nagpur', interests: ['ai-ml', 'data-science', 'ui-ux-design'] });
  const admin = await register('Ada', 'Admin');
  await db.collection('users').updateOne({ _id: oid(admin.id) }, { $set: { role: 'admin' } });
  await t.relogin(admin);
  const aiProject = (await must(api('POST', '/projects', { token: maker.token, body: { title: 'Crop Disease Detector', shortDescription: 'Leaf photos to disease labels with a CNN.', description: 'A Python and TensorFlow model that spots crop diseases from leaf photos taken on a phone camera.', category: 'ai-ml', techStack: ['Python', 'TensorFlow'] } }), 'ai project')).data.project.id;
  const privateProject = (await must(api('POST', '/projects', { token: maker.token, body: { title: 'Secret Thesis Prototype', shortDescription: 'A private prototype for my thesis work.', description: 'Private Python experiments for a thesis that should never be recommended to anyone else.', category: 'ai-ml', techStack: ['Python'], visibility: 'private' } }), 'private project')).data.project.id;
  const ownProject = (await must(api('POST', '/projects', { token: newbie.token, body: { title: 'My Own Notes App', shortDescription: 'A notes app I built for my class.', description: 'A React and Python notes app with tags and search for my semester subjects.', category: 'web', techStack: ['Python', 'React'] } }), 'own project')).data.project.id;
  await sleep(800);
  const projects = await rec(newbie, 'projects');
  const aiItem = projects.data.recommendations.find((item) => item.id === aiProject);
  check('a project matching interests and skills is recommended with a plain reason', Boolean(aiItem) && aiItem.reasons?.length > 0 && aiItem.reasons.every((reason) => typeof reason === 'string' || typeof reason?.text === 'string' || typeof reason?.label === 'string'), aiItem?.reasons);
  check('reasons never expose scores', !/score/i.test(JSON.stringify(projects.data.recommendations.map((item) => item.reasons))) && !/"score"|"profileScore"/.test(projects.text));
  check('private projects are never recommended', !recIds(projects).includes(privateProject));
  check("a student's own projects are never recommended to them", !recIds(projects).includes(ownProject));
  check('no duplicates in a list', new Set(recIds(projects)).size === recIds(projects).length);

  section('Opportunities: open and eligible only');
  const opp = (body) => must(api('POST', '/opportunities', { token: admin.token, body: { shortDescription: 'An opportunity for students interested in AI.', description: 'Work on applied AI and data science problems with mentors from industry and research labs.', type: 'internship', organizer: 'AI Labs', mode: 'online', applicationDeadline: new Date(Date.now() + 20 * 86400000).toISOString(), status: 'published', skills: ['Python'], ...body } }), body.title);
  const open = (await opp({ title: 'AI Research Internship' })).data.opportunity.id;
  const wrongBranch = (await opp({ title: 'AI Internship for Civil Students', eligibleBranches: ['civil'] })).data.opportunity.id;
  const otherCollege = (await opp({ title: 'IIIT Only AI Fellowship', type: 'fellowship', visibility: 'college', eligibleColleges: ['iiit-nagpur'] })).data.opportunity.id;
  const closing = (await opp({ title: 'AI Bootcamp Closing Soon', type: 'workshop' })).data.opportunity.id;
  await db.collection('opportunities').updateOne({ _id: oid(closing) }, { $set: { applicationDeadline: new Date(Date.now() - 3600_000) } });
  const draft = (await must(api('POST', '/opportunities', { token: admin.token, body: { title: 'AI Draft Internship', shortDescription: 'A draft that must stay hidden.', description: 'This draft internship is not published yet and must never be recommended to students.', type: 'internship', organizer: 'AI Labs', mode: 'online', applicationDeadline: new Date(Date.now() + 20 * 86400000).toISOString() } }), 'draft')).data.opportunity.id;
  await sleep(600);
  const opps = recIds(await rec(newbie, 'opportunities', '?refresh=true'));
  check('an open opportunity the student is eligible for is recommended', opps.includes(open), opps);
  check('not recommended: wrong branch, another college only, deadline passed, draft', !opps.includes(wrongBranch) && !opps.includes(otherCollege) && !opps.includes(closing) && !opps.includes(draft), opps);
  check('the other college sees its own fellowship', recIds(await rec(other, 'opportunities')).includes(otherCollege));

  section('Students, posts, moderation');
  const students = recIds(await rec(newbie, 'students'));
  check('student recommendations never include yourself', !students.includes(newbie.id));
  await db.collection('users').updateOne({ _id: oid(maker.id) }, { $set: { status: 'suspended' } });
  await api('POST', '/recommendations/projects/' + aiProject + '/dismiss', { token: other.token, body: { action: 'dismiss' } });
  check('suspended students are never recommended', !recIds(await rec(other, 'students', '?refresh=true')).includes(maker.id));
  await db.collection('users').updateOne({ _id: oid(maker.id) }, { $set: { status: 'active' } });
  const poster = await register('Tanvi', 'Joshi', { interests: ['ai-ml', 'data-science', 'robotics'] });

  const removed = (await must(api('POST', '/posts', { token: poster.token, body: { content: 'A post about machine learning resources that a moderator will remove soon.', visibility: 'public' } }), 'removed post')).data.post.id;
  await must(api('PATCH', `/admin/content/post/${removed}`, { token: admin.token, body: { action: 'remove', reason: 'Removed during QA', confirm: true } }), 'remove');
  await sleep(600);
  const posts = recIds(await rec(newbie, 'posts', '?refresh=true'));
  check('removed posts are never recommended', !posts.includes(removed), posts);

  section('Dismiss, not interested, interactions');
  const before = recIds(await rec(newbie, 'projects'));
  if (before.includes(aiProject)) {
    const dismiss = await api('POST', `/recommendations/projects/${aiProject}/dismiss`, { token: newbie.token, body: { action: 'not_interested' } });
    check('not interested → 200', dismiss.status === 200, dismiss.body);
    check('a dismissed item stops appearing', !recIds(await rec(newbie, 'projects')).includes(aiProject));
  } else {
    check('the AI project was recommended before dismissing (precondition)', false, before);
  }
  const malformed = await api('POST', '/recommendations/projects/xyz/dismiss', { token: newbie.token, body: {} });
  check('dismiss with a malformed id → 404; unknown action → 422', malformed.status === 404 && (await api('POST', `/recommendations/projects/${aiProject}/dismiss`, { token: newbie.token, body: { action: 'hate' } })).status === 422, malformed.status);
  check('dismissing something you cannot see → 404', (await api('POST', `/recommendations/projects/${privateProject}/dismiss`, { token: newbie.token, body: {} })).status === 404);
  const click = await api('POST', '/recommendations/interactions', { token: newbie.token, body: { action: 'click', items: [{ type: 'opportunities', id: open }] } });
  check('interactions recorded (click)', click.status === 200, click.body);
  check('interactions: malformed items → 422; empty list → 422', (await api('POST', '/recommendations/interactions', { token: newbie.token, body: { action: 'click', items: [{ type: 'opportunities', id: 'nope' }] } })).status === 422 && (await api('POST', '/recommendations/interactions', { token: newbie.token, body: { action: 'click', items: [] } })).status === 422);

  section('Home, discover, paging');
  const homeAgain = await api('GET', '/recommendations', { token: newbie.token });
  const discover = await api('GET', '/recommendations/discover', { token: newbie.token });
  check('home and discover answer 200', homeAgain.status === 200 && discover.status === 200);
  check('nothing private, removed or ineligible on home/discover', ![privateProject, removed, wrongBranch, otherCollege, draft].some((id) => homeAgain.text.includes(id) || discover.text.includes(id)));
  const big = await rec(newbie, 'projects', '?limit=500');
  check('a page size above the maximum is lowered (20), page 0 → 422', big.status === 200 && big.data.pagination.limit === 20 && (await rec(newbie, 'projects', '?page=0')).status === 422, big.data?.pagination);
} catch (error) {
  check('suite ran to the end without crashing', false, error.stack);
}
await t.finish();
