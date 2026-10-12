// Communities (Phase 6): official communities, creation rules, college/branch/class scopes, join/leave,
// roles and removals, members-only posts, editing, archiving, icon uploads, lists and filters.
import { createSuite, oid } from '../lib/harness.mjs';
import { jpg } from '../lib/files.mjs';

const t = await createSuite('communities', { cloudinary: true });
const { check, section, api, register, upload, db } = t;

try {
  section('Setup');
  const asha = await register('Asha', 'Rao', { semester: 5 }); // VNIT CSE 5
  const bilal = await register('Bilal', 'Khan', { semester: 5 }); // VNIT CSE 5 (same class)
  const charu = await register('Charu', 'Mehta', { semester: 3 }); // VNIT CSE 3
  const dhruv = await register('Dhruv', 'Nair', { branch: 'it', semester: 5 }); // VNIT IT 5
  const esha = await register('Esha', 'Gupta', { college: 'iiit-nagpur' }); // another college
  const fresh = await register('Farid', 'Ali', { onboard: false });
  check('setup', Boolean(asha.token && esha.token));

  section('Official communities');
  const list = await api('GET', '/communities?limit=30', { token: asha.token });
  check('list 200', list.status === 200, list.body);
  const official = list.data.communities.filter((item) => item.official);
  check('official college, branch and interest communities exist for the viewer', official.some((item) => item.type === 'college') && official.some((item) => item.type === 'branch') && official.some((item) => item.type === 'interest'), official.map((item) => `${item.type}:${item.name}`));
  const collegeCommunity = official.find((item) => item.type === 'college');
  const esList = await api('GET', '/communities?limit=30', { token: esha.token });
  check("another college never sees VNIT's college community", esList.status === 200 && !esList.data.communities.some((item) => item.id === collegeCommunity.id));
  check("another college can't open it (403 or 404)", [403, 404].includes((await api('GET', `/communities/${collegeCommunity.id}`, { token: esha.token })).status));
  check("official communities can't be edited by students (403)", (await api('PUT', `/communities/${collegeCommunity.id}`, { token: asha.token, body: { description: 'Rewriting the official description here.' } })).status === 403);
  const options = await api('GET', '/communities/options', { token: asha.token });
  check('options: types, visibility, filters, sorts, limits', options.status === 200 && options.data.types?.length === 5 && options.data.visibility?.length === 4, Object.keys(options.data ?? {}));

  section('Create');
  const base = { name: 'Night Owl Coders', description: 'Late night coding sessions and doubt solving for our class.', type: 'student-created', visibility: 'restricted', tags: ['coding', 'night'], rules: ['Be kind', 'No spam'] };
  check('not onboarded → 403', (await api('POST', '/communities', { token: fresh.token, body: base })).status === 403);
  check('name too short → 422; description too short → 422', (await api('POST', '/communities', { token: asha.token, body: { ...base, name: 'AB' } })).status === 422 && (await api('POST', '/communities', { token: asha.token, body: { ...base, description: 'Too short' } })).status === 422);
  check('visibility not allowed for the type (college type, public) → 422', (await api('POST', '/communities', { token: asha.token, body: { ...base, type: 'college', visibility: 'public' } })).status === 422);
  check('no tags → 422; 9 tags → 422; duplicate tags → 422', (await api('POST', '/communities', { token: asha.token, body: { ...base, tags: [] } })).status === 422 && (await api('POST', '/communities', { token: asha.token, body: { ...base, tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] } })).status === 422 && (await api('POST', '/communities', { token: asha.token, body: { ...base, tags: ['code', 'CODE'] } })).status === 422);
  const created = await api('POST', '/communities', { token: asha.token, body: { ...base, college: 'iiit-nagpur', branch: 'civil', semester: 1, official: true, memberCount: 999, createdBy: bilal.id } });
  check('class community created; scope from the creator profile (spoofed scope/official/count ignored)', created.status === 201 && created.data.community.official === false && created.data.community.memberCount === 1, created.body);
  const classId = created.data?.community?.id;
  const stored = await db.collection('communities').findOne({ _id: oid(classId) });
  check('stored scope is VNIT / CSE / semester 5, creator is the signed-in student', stored.college === 'vnit-nagpur' && stored.branch === 'cse' && stored.semester === 5 && String(stored.createdBy) === asha.id, stored);
  check('duplicate name → 409', (await api('POST', '/communities', { token: bilal.token, body: base })).status === 409);
  const pub = await api('POST', '/communities', { token: asha.token, body: { ...base, name: 'Campus Photography Walks', description: 'Weekend photo walks around Nagpur, all colleges welcome.', type: 'interest', visibility: 'public', tags: ['photography'] } });
  check('public interest community created', pub.status === 201, pub.body);
  const publicId = pub.data?.community?.id;

  section('Scopes: join and leave');
  const join = (who, id) => api('POST', `/communities/${id}/join`, { token: who.token });
  check('same class joins → 200', (await join(bilal, classId)).status === 200);
  check('joining twice → 409', (await join(bilal, classId)).status === 409);
  check('another semester → 403', (await join(charu, classId)).status === 403);
  check('another branch → 403', (await join(dhruv, classId)).status === 403);
  check('another college → 403 or 404', [403, 404].includes((await join(esha, classId)).status));
  check('another college joins the public community → 200', (await join(esha, publicId)).status === 200);
  check('unknown community → 404; malformed id → 404', (await join(esha, '0123456789abcdef01234567')).status === 404 && (await join(esha, 'xyz')).status === 404);
  const detail = await api('GET', `/communities/${classId}`, { token: bilal.token });
  check('member sees membership and member count 2', detail.status === 200 && detail.data.community.memberCount === 2 && Boolean(detail.data.community.membership ?? detail.data.membership), detail.body);
  const leave = await api('DELETE', `/communities/${publicId}/leave`, { token: esha.token });
  check('leave → 200; leaving again → 409; rejoin → 200', leave.status === 200 && (await api('DELETE', `/communities/${publicId}/leave`, { token: esha.token })).status === 409 && (await join(esha, publicId)).status === 200);
  check('the only owner cannot leave (409)', (await api('DELETE', `/communities/${classId}/leave`, { token: asha.token })).status === 409);
  const mine = await api('GET', '/communities/me', { token: bilal.token });
  check('"my communities" lists the joined community', mine.status === 200 && JSON.stringify(mine.body).includes(classId));
  const filtered = await api('GET', '/communities?filter=mine', { token: bilal.token });
  check('filter=mine lists only joined ones', filtered.status === 200 && filtered.data.communities.some((item) => item.id === classId));
  check('search finds by name', (await api('GET', '/communities?search=night%20owl', { token: bilal.token })).data.communities.some((item) => item.id === classId));
  check('page size above 30 → 422; unknown filter → 422', (await api('GET', '/communities?limit=31', { token: bilal.token })).status === 422 && (await api('GET', '/communities?filter=secret', { token: bilal.token })).status === 422);

  section('Roles and removals');
  const members = await api('GET', `/communities/${classId}/members`, { token: bilal.token });
  check('members list (owner + member)', members.status === 200 && members.data.members.length === 2, members.body);
  check('members list hides emails', !JSON.stringify(members.body).includes('@qa.campusx.dev'));
  check('a member cannot change roles (403)', (await api('PATCH', `/communities/${classId}/members/${asha.id}/role`, { token: bilal.token, body: { role: 'member' } })).status === 403);
  const promote = await api('PATCH', `/communities/${classId}/members/${bilal.id}/role`, { token: asha.token, body: { role: 'moderator' } });
  check('owner makes a member moderator → 200', promote.status === 200, promote.body);
  check('unknown role → 422', (await api('PATCH', `/communities/${classId}/members/${bilal.id}/role`, { token: asha.token, body: { role: 'king' } })).status === 422);
  const ganesh = await register('Ganesh', 'Rane', { semester: 5 });
  await join(ganesh, classId);
  check('moderator cannot remove the owner (403)', (await api('DELETE', `/communities/${classId}/members/${asha.id}`, { token: bilal.token })).status === 403);
  const removed = await api('DELETE', `/communities/${classId}/members/${ganesh.id}`, { token: bilal.token });
  check('moderator removes a member → 200', removed.status === 200, removed.body);
  check('a removed member cannot rejoin (403)', (await join(ganesh, classId)).status === 403);
  check('non-member cannot see the members of a class community', [403, 404].includes((await api('GET', `/communities/${classId}/members`, { token: esha.token })).status));

  section('Community posts');
  const post = await api('POST', '/posts', { token: bilal.token, body: { content: 'Doubt-solving session tonight at 10 pm for the OS assignment.', community: classId } });
  check('member posts in the community → 201, visibility community', post.status === 201 && post.data.post.visibility === 'community' && post.data.post.community?.id === classId, post.body);
  const postId = post.data?.post?.id;
  check('non-member cannot post there (403)', (await api('POST', '/posts', { token: dhruv.token, body: { content: 'Trying to post in a class I am not in.', community: classId } })).status === 403);
  check('non-member cannot read the post (404)', (await api('GET', `/posts/${postId}`, { token: dhruv.token })).status === 404);
  check('removed member cannot read it either (404)', (await api('GET', `/posts/${postId}`, { token: ganesh.token })).status === 404);
  check('community post never shows in a non-member feed', !(await api('GET', '/posts?limit=20', { token: dhruv.token })).data.posts.some((item) => item.id === postId));
  const feed = await api('GET', `/communities/${classId}/posts`, { token: asha.token });
  check('community feed for members includes it', feed.status === 200 && feed.data.posts.some((item) => item.id === postId), feed.body);
  check('community feed for non-members → 403', (await api('GET', `/communities/${classId}/posts`, { token: dhruv.token })).status === 403);
  const otherPost = await api('POST', '/posts', { token: asha.token, body: { content: 'Owner note: keep the doubt threads tidy please.', community: classId } });
  check('owner (moderator role holder) can remove a post in the community', (await api('DELETE', `/posts/${postId}`, { token: asha.token })).status === 200);
  check('a member cannot remove someone else\'s community post (403)', (await api('DELETE', `/posts/${otherPost.data.post.id}`, { token: ganesh.token })).status === 403);
  const communityAudit = await db.collection('moderationauditlogs').findOne({ action: 'COMMUNITY_REMOVE', targetId: oid(postId) });
  check('community removal is audited', Boolean(communityAudit));

  section('Edit, icon, archive');
  const edit = await api('PUT', `/communities/${classId}`, { token: asha.token, body: { description: 'Late night coding sessions, doubt solving and mock interviews.' } });
  check('owner edits → 200', edit.status === 200, edit.body);
  check('moderator/member edits → 403', (await api('PUT', `/communities/${classId}`, { token: bilal.token, body: { description: 'Moderator changing the description here.' } })).status === 403);
  const second = await api('POST', '/communities', { token: esha.token, body: { ...base, name: 'Weekend Hikers', description: 'Short treks around Nagpur every other Sunday morning.', type: 'interest', visibility: 'public', tags: ['hiking'] } });
  const rename = await api('PUT', `/communities/${second.data?.community?.id}`, { token: esha.token, body: { name: 'Campus Photography Walks' } });
  check('renaming onto a name already used in the same scope → 409', rename.status === 409, [second.status, rename.status]);
  check('names are unique per campus scope: a public community may share a class community name', (await api('PUT', `/communities/${publicId}`, { token: asha.token, body: { name: 'Night Owl Coders' } })).status === 200);
  // Regression (QA-02): a repeated name with a different description is not an "exact duplicate".
  check('sharing a name with your other community is not treated as duplicate spam', (await db.collection('communities').findOne({ _id: oid(publicId) })).moderationStatus === 'approved');
  const scopeEdit = await api('PUT', `/communities/${classId}`, { token: asha.token, body: { visibility: 'public', college: 'iiit-nagpur' } });
  const scopeDoc = await db.collection('communities').findOne({ _id: oid(classId) });
  check('scope fields can\'t be edited (nothing else sent → 422 "nothing to update", scope unchanged)', scopeEdit.status === 422 && scopeDoc.visibility === 'restricted' && scopeDoc.college === 'vnit-nagpur', [scopeEdit.status, scopeEdit.body?.message, scopeDoc.visibility, scopeDoc.college]);
  check('owner uploads an icon → 200', (await upload(`/communities/${classId}/icon`, asha.token, 'icon', [jpg()])).status === 200);
  check('member uploads an icon → 403', (await upload(`/communities/${classId}/icon`, bilal.token, 'icon', [jpg()])).status === 403);
  const archive = await api('DELETE', `/communities/${classId}`, { token: asha.token });
  check('owner archives → 200', archive.status === 200, archive.body);
  const joinPublic = await join(charu, publicId);
  const joinArchived = await join(bilal, classId);
  check('archived: no new members (409), active public community still joinable', joinPublic.status === 200 && joinArchived.status === 409, [joinPublic.status, joinPublic.body?.message, joinArchived.status]);
  check('archived: no new posts (409)', (await api('POST', '/posts', { token: bilal.token, body: { content: 'Posting after the archive happened.', community: classId } })).status === 409);
  check('archiving by a non-owner → 403', (await api('DELETE', `/communities/${publicId}`, { token: esha.token })).status === 403);

  section('Recommendations');
  const recommended = await api('GET', '/communities/recommended', { token: charu.token });
  check('recommended communities 200, only joinable ones', recommended.status === 200 && !JSON.stringify(recommended.body).includes(classId), recommended.body);
} catch (error) {
  check('suite ran to the end without crashing', false, error.stack);
}
await t.finish();
