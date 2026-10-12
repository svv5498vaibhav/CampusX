// Projects and achievements (Phase 7): create/edit/delete with ownership, team invitations, images and
// proof on Cloudinary, likes, views, visibility, the moderator-only verification flow, lists.
import { createSuite, oid, sleep } from '../lib/harness.mjs';
import { PDF, PDF_JS, file, jpg, png, webp } from '../lib/files.mjs';

const t = await createSuite('showcase', { cloudinary: true });
const { check, section, api, register, upload, db } = t;
const cloud = t.cloudinary;
const project = (overrides = {}) => ({ title: 'Campus Bus Tracker', shortDescription: 'Live bus locations for the college shuttle.', description: 'A web app that shows where the college shuttle is, using GPS pings from the driver phone every few seconds.', category: 'web', techStack: ['react', 'node.js', 'MongoDB'], ...overrides });

try {
  section('Setup');
  const asha = await register('Asha', 'Rao');
  const bilal = await register('Bilal', 'Khan');
  const chitra = await register('Chitra', 'Iyer', { college: 'iiit-nagpur' });
  const mod = await register('Milo', 'Moderator');
  const pending = await register('Pooja', 'Shah', { onboard: false });
  await db.collection('users').updateOne({ _id: oid(mod.id) }, { $set: { role: 'moderator' } });
  await t.relogin(mod);
  check('setup', Boolean(mod.token));

  section('Projects: create and validate');
  check('not onboarded → 403', (await api('POST', '/projects', { token: pending.token, body: project() })).status === 403);
  check('missing description → 422; short title → 422; unknown category → 422', (await api('POST', '/projects', { token: asha.token, body: project({ description: undefined }) })).status === 422 && (await api('POST', '/projects', { token: asha.token, body: project({ title: 'AB' }) })).status === 422 && (await api('POST', '/projects', { token: asha.token, body: project({ category: 'magic' }) })).status === 422);
  check('16 technologies → 422', (await api('POST', '/projects', { token: asha.token, body: project({ techStack: Array.from({ length: 16 }, (_, i) => `Tech${String.fromCharCode(65 + i)}`) }) })).status === 422);
  check('teammate that is not a student → 422; yourself as teammate → 422', (await api('POST', '/projects', { token: asha.token, body: project({ teamMembers: [{ user: '0123456789abcdef01234567' }] }) })).status === 422 && (await api('POST', '/projects', { token: asha.token, body: project({ teamMembers: [{ user: asha.id }] }) })).status === 422);
  const created = await api('POST', '/projects', { token: asha.token, body: project({ teamMembers: [{ user: bilal.id, role: 'designer' }], owner: bilal.id, views: 999, likes: [bilal.id], visibility: 'campus', status: 'in-progress' }) });
  check('project created; tech stack canonical; owner/views/likes from the client ignored', created.status === 201 && created.data.project.owner?.id === asha.id && created.data.project.views === 0 && created.data.project.likeCount === 0 && created.data.project.techStack.includes('React'), created.body);
  const projectId = created.data?.project?.id;
  check('teammate starts as invited', created.data?.project?.team?.some((member) => member.student?.id === bilal.id && member.status === 'invited'), created.data?.project?.team);
  await sleep(500);
  const invite = await api('GET', '/notifications', { token: bilal.token });
  check('teammate gets an invitation notification', invite.data.notifications.some((note) => /team|invit/i.test(`${note.type} ${note.message}`)), invite.data.notifications.map((note) => note.type));
  const accept = await api('POST', `/projects/${projectId}/team/accept`, { token: bilal.token });
  check('teammate accepts → accepted', accept.status === 200 && accept.data.project.team.some((member) => member.student?.id === bilal.id && member.status === 'accepted'), accept.body);
  check('accepting again → 404 (no open invitation)', (await api('POST', `/projects/${projectId}/team/accept`, { token: bilal.token })).status === 404);
  check('a non-invited student cannot accept (404)', (await api('POST', `/projects/${projectId}/team/accept`, { token: chitra.token })).status === 404);

  section('Projects: images');
  const images = await upload(`/projects/${projectId}/images`, asha.token, 'images', [jpg(), png(), webp()]);
  check('owner uploads JPG + PNG + WEBP → 3 images', images.status === 200 && images.data.project.images.length === 3, images.body);
  check('images stored per project on Cloudinary', cloud.uploads.slice(-3).every((item) => item.folder === `campusx/projects/${projectId}`), cloud.uploads.slice(-3).map((item) => item.folder));
  check('teammate cannot upload images (403)', (await upload(`/projects/${projectId}/images`, bilal.token, 'images', [jpg()])).status === 403);
  check('6 more images (over 8) → 422', (await upload(`/projects/${projectId}/images`, asha.token, 'images', Array.from({ length: 6 }, (_, i) => jpg(`p${i}.jpg`)))).status === 422);
  const imageId = images.data.project.images[0].id;
  const destroyedBefore = cloud.destroyed.length;
  const removeImage = await api('DELETE', `/projects/${projectId}/images/${imageId}`, { token: asha.token });
  await sleep(200);
  check('owner removes an image → 2 left, file deleted', removeImage.status === 200 && removeImage.data.project.images.length === 2 && cloud.destroyed.length - destroyedBefore === 1);
  check('removing an unknown image → 404', (await api('DELETE', `/projects/${projectId}/images/0123456789abcdef01234567`, { token: asha.token })).status === 404);

  section('Projects: edit, visibility, likes, views');
  check('teammate cannot edit (403); stranger cannot edit (403)', (await api('PUT', `/projects/${projectId}`, { token: bilal.token, body: { title: 'Taken over' } })).status === 403 && (await api('PUT', `/projects/${projectId}`, { token: chitra.token, body: { title: 'Taken over' } })).status === 403);
  const edit = await api('PUT', `/projects/${projectId}`, { token: asha.token, body: { status: 'completed', liveUrl: 'https://bus.campusx.example', thumbnailImageId: removeImage.data.project.images[1].id } });
  check('owner edits status, link and thumbnail', edit.status === 200 && edit.data.project.status === 'completed' && edit.data.project.liveUrl === 'https://bus.campusx.example', edit.body);
  check('clearing a link with "" removes it', (await api('PUT', `/projects/${projectId}`, { token: asha.token, body: { liveUrl: '' } })).data.project.liveUrl === null);
  const view1 = await api('GET', `/projects/${projectId}`, { token: chitra.token });
  await api('GET', `/projects/${projectId}`, { token: chitra.token });
  const viewsAfter = (await api('GET', `/projects/${projectId}`, { token: asha.token })).data.project.views;
  check('views counted once per student (owner views don\'t count)', view1.status === 200 && viewsAfter === 1, viewsAfter);
  const like = await api('POST', `/projects/${projectId}/like`, { token: chitra.token });
  check('like (idempotent) and unlike', like.data.likeCount === 1 && (await api('POST', `/projects/${projectId}/like`, { token: chitra.token })).data.likeCount === 1 && (await api('DELETE', `/projects/${projectId}/like`, { token: chitra.token })).data.likeCount === 0);
  await api('PUT', `/projects/${projectId}`, { token: asha.token, body: { visibility: 'college' } });
  check('college visibility: another college gets 404', (await api('GET', `/projects/${projectId}`, { token: chitra.token })).status === 404);
  check('college visibility: same college still sees it', (await api('GET', `/projects/${projectId}`, { token: bilal.token })).status === 200);
  await api('PUT', `/projects/${projectId}`, { token: asha.token, body: { visibility: 'private' } });
  check('private: hidden from others (404), visible to the owner', (await api('GET', `/projects/${projectId}`, { token: chitra.token })).status === 404 && (await api('GET', `/projects/${projectId}`, { token: asha.token })).status === 200);
  check('private projects never appear in lists', !JSON.stringify((await api('GET', '/projects?limit=30', { token: chitra.token })).body).includes(projectId));
  await api('PUT', `/projects/${projectId}`, { token: asha.token, body: { visibility: 'public' } });
  const listed = await api('GET', '/projects?category=web&sort=popular', { token: chitra.token });
  check('lists filter by category and sort', listed.status === 200 && listed.data.projects.some((item) => item.id === projectId));
  check('my projects lists owned and team projects', JSON.stringify((await api('GET', '/projects/me', { token: bilal.token })).body).includes(projectId));
  const userProjects = await api('GET', `/projects/user/${asha.id}`, { token: chitra.token });
  check("a student's profile project list", userProjects.status === 200 && JSON.stringify(userProjects.body).includes(projectId));
  check('unknown category filter → 422; page size 31 → 422', (await api('GET', '/projects?category=magic', { token: chitra.token })).status === 422 && (await api('GET', '/projects?limit=31', { token: chitra.token })).status === 422);
  check('team candidate search excludes yourself', !JSON.stringify((await api('GET', '/projects/team-candidates?search=Asha', { token: asha.token })).body).includes(asha.id));

  section('Projects: leave team and delete');
  check('teammate leaves → 200; leaving again → 404', (await api('DELETE', `/projects/${projectId}/team/me`, { token: bilal.token })).status === 200 && (await api('DELETE', `/projects/${projectId}/team/me`, { token: bilal.token })).status === 404);
  check('stranger cannot delete (403)', (await api('DELETE', `/projects/${projectId}`, { token: chitra.token })).status === 403);
  const destroyedBeforeDelete = cloud.destroyed.length;
  const del = await api('DELETE', `/projects/${projectId}`, { token: asha.token });
  await sleep(300);
  check('owner deletes → images deleted from Cloudinary, then 404', del.status === 200 && cloud.destroyed.length - destroyedBeforeDelete === 2 && (await api('GET', `/projects/${projectId}`, { token: asha.token })).status === 404, cloud.destroyed.length - destroyedBeforeDelete);
  const second = await api('POST', '/projects', { token: asha.token, body: project({ title: 'Campus Bus Tracker', description: 'A second, unrelated project that reuses the title: a printable timetable of every bus route.' }) });
  check('a second project with the same title but different text is not held as a duplicate', second.status === 201 && (await db.collection('projects').findOne({ _id: oid(second.data.project.id) })).moderationStatus === 'approved', second.data?.project);

  section('Achievements');
  const ach = { title: 'Certificate of Participation', type: 'certification', date: '2026-02-10', organization: 'Google Developer Groups', eventName: 'DevFest Nagpur' };
  check('date in the future → 422; unknown type → 422', (await api('POST', '/achievements', { token: asha.token, body: { ...ach, date: '2099-01-01' } })).status === 422 && (await api('POST', '/achievements', { token: asha.token, body: { ...ach, type: 'trophy' } })).status === 422);
  const a1 = await api('POST', '/achievements', { token: asha.token, body: { ...ach, verificationStatus: 'verified', verification: { reviewedBy: mod.id }, owner: bilal.id } });
  check('achievement created unverified (client verification fields ignored), owner is the student', a1.status === 201 && a1.data.achievement.verificationStatus === 'unverified' && a1.data.achievement.owner?.id === asha.id, a1.body);
  const a2 = await api('POST', '/achievements', { token: asha.token, body: { ...ach, date: '2026-03-15', eventName: 'Google I/O Extended Nagpur' } });
  const a2Doc = await db.collection('achievements').findOne({ _id: oid(a2.data?.achievement?.id) });
  check('two achievements with the same title (different events) are both approved (QA-02)', a2.status === 201 && a2Doc.moderationStatus === 'approved', a2Doc?.moderationStatus);
  const a1Id = a1.data.achievement.id;
  check('student cannot verify their own achievement (no verification route access: 403)', (await api('PATCH', `/achievements/${a1Id}/verification`, { token: asha.token, body: { status: 'verified' } })).status === 403);
  check('editing verificationStatus is ignored', (await api('PUT', `/achievements/${a1Id}`, { token: asha.token, body: { verificationStatus: 'verified', rank: 'Participant' } })).data.achievement.verificationStatus === 'unverified');
  check('moderator cannot review an achievement without proof (409)', (await api('PATCH', `/achievements/${a1Id}/verification`, { token: mod.token, body: { status: 'verified' } })).status === 409);
  const proof = await upload(`/achievements/${a1Id}/proof`, asha.token, 'proof', [file(PDF, 'application/pdf', 'certificate.pdf'), jpg('photo.jpg')]);
  check('owner adds PDF + photo proof → pending', proof.status === 200 && proof.data.achievement.verificationStatus === 'pending' && proof.data.achievement.proof?.length === 2, proof.body);
  check('PDF stored as a raw Cloudinary file', cloud.uploads.some((item) => item.resourceType === 'raw' && item.folder === `campusx/achievements/proof/${a1Id}`));
  check('PDF with JavaScript as proof → 415', (await upload(`/achievements/${a1Id}/proof`, asha.token, 'proof', [file(PDF_JS, 'application/pdf', 'evil.pdf')])).status === 415);
  check('someone else adds proof → 403', (await upload(`/achievements/${a1Id}/proof`, bilal.token, 'proof', [jpg()])).status === 403);
  check('student reviewer → 403', (await api('PATCH', `/achievements/${a1Id}/verification`, { token: bilal.token, body: { status: 'verified' } })).status === 403);
  check('invalid review status → 422', (await api('PATCH', `/achievements/${a1Id}/verification`, { token: mod.token, body: { status: 'super-verified' } })).status === 422);
  const review = await api('PATCH', `/achievements/${a1Id}/verification`, { token: mod.token, body: { status: 'verified', note: 'Certificate checked.' } });
  check('moderator verifies a pending achievement → verified', review.status === 200 && review.data.achievement.verificationStatus === 'verified', review.body);
  check('reviewing twice → 409', (await api('PATCH', `/achievements/${a1Id}/verification`, { token: mod.token, body: { status: 'rejected' } })).status === 409);
  await sleep(500);
  check('owner is notified of the review', (await api('GET', '/notifications', { token: asha.token })).data.notifications.some((note) => /achievement/i.test(note.type)));
  const changed = await api('PUT', `/achievements/${a1Id}`, { token: asha.token, body: { organization: 'GDG Nagpur Chapter' } });
  check('changing the claim of a verified achievement sends it back for review', changed.status === 200 && changed.data.achievement.verificationStatus !== 'verified', changed.data?.achievement?.verificationStatus);
  const modSelf = await api('POST', '/achievements', { token: mod.token, body: { ...ach, title: 'Moderator own award', date: '2026-01-05' } });
  await upload(`/achievements/${modSelf.data.achievement.id}/proof`, mod.token, 'proof', [jpg()]);
  check('a moderator cannot review their own achievement (403)', (await api('PATCH', `/achievements/${modSelf.data.achievement.id}/verification`, { token: mod.token, body: { status: 'verified' } })).status === 403);
  await api('PUT', `/achievements/${a1Id}`, { token: asha.token, body: { visibility: 'private' } });
  check('private achievement hidden from others (404)', (await api('GET', `/achievements/${a1Id}`, { token: bilal.token })).status === 404);
  check('verified filter lists only verified achievements', (await api('GET', '/achievements?verified=true', { token: bilal.token })).data.achievements.every((item) => item.verificationStatus === 'verified'));
  const destroyedBeforeAch = cloud.destroyed.length;
  const delAch = await api('DELETE', `/achievements/${a1Id}`, { token: asha.token });
  await sleep(300);
  check('owner deletes the achievement → proof files deleted (raw + image)', delAch.status === 200 && cloud.destroyed.length - destroyedBeforeAch === 2, cloud.destroyed.length - destroyedBeforeAch);
  check('deleting someone else\'s achievement → 403 or 404', [403, 404].includes((await api('DELETE', `/achievements/${a2.data.achievement.id}`, { token: bilal.token })).status));
} catch (error) {
  check('suite ran to the end without crashing', false, error.stack);
}
await t.finish();
