// Opportunities (Phase 8): staff-only management, drafts, college-limited visibility, eligibility from the
// student's own profile, tracking (save/applied/... rules), deadlines and closing, recommendations,
// reports, images, and points for tracking (once).
import { createSuite, oid, sleep } from '../lib/harness.mjs';
import { jpg } from '../lib/files.mjs';

const t = await createSuite('opportunities', { cloudinary: true });
const { check, section, api, register, upload, db } = t;
const DAY = 86_400_000;
const inDays = (days) => new Date(Date.now() + days * DAY).toISOString();
const base = (overrides = {}) => ({ title: 'Campus AI Hackathon 2026', shortDescription: 'A 24 hour hackathon on AI for campus life.', description: 'Build AI tools that make campus life easier. Teams of up to four students from any branch.', type: 'hackathon', organizer: 'CampusX Tech Club', mode: 'online', applicationDeadline: inDays(20), applicationUrl: 'https://apply.example.com/ai-hackathon', ...overrides });

try {
  section('Setup');
  const mod = await register('Milo', 'Moderator');
  const cse5 = await register('Asha', 'Rao', { branch: 'cse', semester: 5 });
  const it3 = await register('Ishan', 'Tiwari', { branch: 'it', semester: 3 });
  const iiit = await register('Chitra', 'Iyer', { college: 'iiit-nagpur' });
  await db.collection('users').updateOne({ _id: oid(mod.id) }, { $set: { role: 'moderator' } });
  await t.relogin(mod);
  check('setup', Boolean(mod.token));

  section('Management is staff-only');
  check('student cannot create (403)', (await api('POST', '/opportunities', { token: cse5.token, body: base() })).status === 403);
  check('student cannot open the management list (403)', (await api('GET', '/opportunities/manage', { token: cse5.token })).status === 403);
  check('invalid opportunity → 422 (missing fields)', (await api('POST', '/opportunities', { token: mod.token, body: { title: 'x' } })).status === 422);
  check('deadline in the past → 422', (await api('POST', '/opportunities', { token: mod.token, body: base({ applicationDeadline: inDays(-2) }) })).status === 422);
  const draft = await api('POST', '/opportunities', { token: mod.token, body: base({ eligibleBranches: ['cse'], eligibleSemesters: [5, 7], createdBy: cse5.id }) });
  check('moderator creates a draft; createdBy is the moderator', draft.status === 201 && draft.data.opportunity.status === 'draft' && String((await db.collection('opportunities').findOne({ _id: oid(draft.data.opportunity.id) })).createdBy) === mod.id, draft.body);
  const draftId = draft.data.opportunity.id;
  check('students cannot see drafts (404)', (await api('GET', `/opportunities/${draftId}`, { token: cse5.token })).status === 404);
  check('students cannot track drafts (404)', (await api('POST', `/opportunities/${draftId}/track`, { token: cse5.token, body: {} })).status === 404);
  check('student cannot publish (403)', (await api('PUT', `/opportunities/${draftId}`, { token: cse5.token, body: { status: 'published' } })).status === 403);
  check('moderator publishes', (await api('PUT', `/opportunities/${draftId}`, { token: mod.token, body: { status: 'published' } })).data?.opportunity?.status === 'published');
  check('staff upload an image; students cannot (403)', (await upload(`/opportunities/${draftId}/image`, mod.token, 'image', [jpg()])).status === 200 && (await upload(`/opportunities/${draftId}/image`, cse5.token, 'image', [jpg()])).status === 403);

  section('Eligibility and visibility');
  const forCse = await api('GET', `/opportunities/${draftId}`, { token: cse5.token });
  check('eligible student (CSE, semester 5): eligible', forCse.status === 200 && forCse.data.opportunity.viewerEligibility?.eligible === true, forCse.data?.opportunity?.viewerEligibility);
  const forIt = await api('GET', `/opportunities/${draftId}`, { token: it3.token });
  check('ineligible student (IT, semester 3): sees why (branch, semester)', forIt.status === 200 && forIt.data.opportunity.viewerEligibility?.eligible === false && JSON.stringify(forIt.data.opportunity.viewerEligibility).match(/branch|semester/gi)?.length >= 2, forIt.data?.opportunity?.viewerEligibility);
  const collegeOnly = await api('POST', '/opportunities', { token: mod.token, body: base({ title: 'VNIT Research Fellowship', type: 'fellowship', visibility: 'college', eligibleColleges: ['vnit-nagpur'], status: 'published' }) });
  check('college-limited opportunity published', collegeOnly.status === 201, collegeOnly.body);
  const collegeId = collegeOnly.data.opportunity.id;
  check('another college: 404, not listed, cannot track or report', (await api('GET', `/opportunities/${collegeId}`, { token: iiit.token })).status === 404 && !JSON.stringify((await api('GET', '/opportunities?limit=30', { token: iiit.token })).body).includes(collegeId) && (await api('POST', `/opportunities/${collegeId}/track`, { token: iiit.token, body: {} })).status === 404 && (await api('POST', `/opportunities/${collegeId}/report`, { token: iiit.token, body: { reason: 'spam' } })).status === 404);
  check('same college: visible', (await api('GET', `/opportunities/${collegeId}`, { token: it3.token })).status === 200);
  check('a college filter in the query never grants access', !JSON.stringify((await api('GET', '/opportunities?college=vnit-nagpur&limit=30', { token: iiit.token })).body).includes(collegeId));
  const recIt = await api('GET', '/opportunities/recommended', { token: it3.token });
  check('recommendations leave out opportunities the student is not eligible for', recIt.status === 200 && !JSON.stringify(recIt.body).includes(draftId), recIt.body);

  section('Tracking');
  const track = (who, id, body = {}) => api('POST', `/opportunities/${id}/track`, { token: who.token, body });
  const setStatus = (who, id, status) => api('PATCH', `/opportunities/${id}/status`, { token: who.token, body: { status } });
  const saved = await track(cse5, draftId);
  check('save → saved (created)', [200, 201].includes(saved.status) && saved.data.tracking.status === 'saved', saved.body);
  const again = await track(cse5, draftId);
  check('saving again changes nothing (one record)', [200, 201].includes(again.status) && (await db.collection('opportunityapplications').countDocuments({ opportunity: oid(draftId), user: oid(cse5.id) })) === 1);
  check('double-click save (5 at once) keeps one record', (await Promise.all(Array.from({ length: 5 }, () => track(it3, draftId)))).every((res) => res.status < 300) && (await db.collection('opportunityapplications').countDocuments({ opportunity: oid(draftId), user: oid(it3.id) })) === 1);
  check('shortlisted before applying → 422', (await setStatus(cse5, draftId, 'shortlisted')).status === 422);
  check('unknown status → 422', (await setStatus(cse5, draftId, 'hired')).status === 422);
  const applied = await setStatus(cse5, draftId, 'applied');
  check('applied → appliedAt set', applied.status === 200 && Boolean(applied.data.tracking.appliedAt), applied.body);
  check('shortlisted after applying → 200', (await setStatus(cse5, draftId, 'shortlisted')).data?.tracking?.status === 'shortlisted');
  const back = await setStatus(cse5, draftId, 'saved');
  check('back to saved clears the applied date', back.status === 200 && !back.data.tracking.appliedAt, back.data?.tracking);
  const mine = await api('GET', '/opportunities/my', { token: cse5.token });
  check('My Opportunities lists it with counts per status', mine.status === 200 && JSON.stringify(mine.body).includes(draftId) && mine.data.counts?.saved >= 1, mine.data?.counts);
  check('another student\'s tracking is untouched by mine', (await db.collection('opportunityapplications').findOne({ opportunity: oid(draftId), user: oid(it3.id) })).status === 'saved');
  const removed = await api('DELETE', `/opportunities/${draftId}/track`, { token: cse5.token });
  check('remove from my list → 200; again → 404', removed.status === 200 && (await api('DELETE', `/opportunities/${draftId}/track`, { token: cse5.token })).status === 404);
  await sleep(600);
  const ledger = await db.collection('pointtransactions').find({ user: oid(it3.id), action: 'OPPORTUNITY_SAVED' }).toArray();
  check('saving awards points once, even after five simultaneous saves', ledger.filter((row) => row.type !== 'reversal').length === 1, ledger.map((row) => [row.type, row.points]));

  section('Deadlines and closing');
  const soon = await api('POST', '/opportunities', { token: mod.token, body: base({ title: 'Weekend Workshop on Rust', type: 'workshop', applicationDeadline: inDays(2), status: 'published' }) });
  const soonId = soon.data.opportunity.id;
  check('deadline within a few days → closing-soon', (await api('GET', `/opportunities/${soonId}`, { token: cse5.token })).data.opportunity.displayStatus === 'closing-soon');
  check('next-7-days filter includes it', JSON.stringify((await api('GET', '/opportunities?deadline=7d', { token: cse5.token })).body).includes(soonId));
  await track(it3, soonId, { status: 'applied' });
  await db.collection('opportunities').updateOne({ _id: oid(soonId) }, { $set: { applicationDeadline: new Date(Date.now() - DAY) } });
  const past = await api('GET', `/opportunities/${soonId}`, { token: cse5.token });
  check('deadline passed → shown as closed (worked out on read)', past.data.opportunity.displayStatus === 'closed', past.data?.opportunity?.displayStatus);
  check('a closed opportunity cannot be newly saved (409)', (await track(cse5, soonId)).status === 409);
  check('an applicant can still record the outcome after closing (selected)', (await setStatus(it3, soonId, 'selected')).status === 200);
  check('open-only filter leaves it out', !JSON.stringify((await api('GET', '/opportunities?deadline=open', { token: cse5.token })).body).includes(soonId));
  await api('PUT', `/opportunities/${collegeId}`, { token: mod.token, body: { status: 'closed' } });
  check('closed by staff: no new saves (409)', (await track(it3, collegeId)).status === 409);
  await api('PUT', `/opportunities/${collegeId}`, { token: mod.token, body: { status: 'archived' } });
  check('archived: gone for students (404)', (await api('GET', `/opportunities/${collegeId}`, { token: it3.token })).status === 404);

  section('Lists, filters, reports');
  check('type filter returns only that type', (await api('GET', '/opportunities?type=hackathon', { token: cse5.token })).data.opportunities.every((item) => item.type === 'hackathon'));
  check('invalid filters → 422 (type, mode, semester, deadline)', (await api('GET', '/opportunities?type=gig', { token: cse5.token })).status === 422 && (await api('GET', '/opportunities?mode=space', { token: cse5.token })).status === 422 && (await api('GET', '/opportunities?semester=12', { token: cse5.token })).status === 422 && (await api('GET', '/opportunities?deadline=yesterday', { token: cse5.token })).status === 422);
  check('report → 201; again → 409; unknown reason → 422', (await api('POST', `/opportunities/${draftId}/report`, { token: it3.token, body: { reason: 'expired' } })).status === 201 && (await api('POST', `/opportunities/${draftId}/report`, { token: it3.token, body: { reason: 'expired' } })).status === 409 && (await api('POST', `/opportunities/${draftId}/report`, { token: cse5.token, body: { reason: 'boring' } })).status === 422);
  check('staff delete → gone; students get 404', (await api('DELETE', `/opportunities/${soonId}`, { token: mod.token })).status === 200 && (await api('GET', `/opportunities/${soonId}`, { token: it3.token })).status === 404);
  check('tracking records of a deleted opportunity are cleaned up', (await db.collection('opportunityapplications').countDocuments({ opportunity: oid(soonId) })) === 0);
} catch (error) {
  check('suite ran to the end without crashing', false, error.stack);
}
await t.finish();
