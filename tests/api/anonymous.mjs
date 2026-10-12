// Anonymous Zone (Phase 9) and Journey 8: posting with photos (metadata stripped), visibility, comments,
// likes, reports, edit/delete ownership, soft delete, personal-information checks, and that the author
// can't be identified anywhere a student, a report, search, recommendations, notifications, rankings or
// staff screens can see (only the audited moderation reveal can).
import { collect, createSuite, oid, sleep } from '../lib/harness.mjs';
import { EXIF_SECRET, JPG_WITH_EXIF, file, png } from '../lib/files.mjs';

const t = await createSuite('anonymous', { cloudinary: true });
const { check, section, api, register, upload, db } = t;
const cloud = t.cloudinary;

try {
  section('Setup');
  const asha = await register('Asha', 'Rao', { roll: 'ANON001' });
  const bilal = await register('Bilal', 'Khan');
  const chitra = await register('Chitra', 'Iyer', { college: 'iiit-nagpur' });
  const mod = await register('Milo', 'Moderator');
  await db.collection('users').updateOne({ _id: oid(mod.id) }, { $set: { role: 'moderator' } });
  await t.relogin(mod);
  const identity = [asha.id, asha.email, 'Asha', 'Rao', 'ANON001'];
  const leaks = (value) => identity.filter((needle) => JSON.stringify(value ?? null).includes(needle));
  const pointsBefore = (await api('GET', '/gamification/me', { token: asha.token })).data;
  check('setup', Boolean(mod.token && pointsBefore));

  section('Journey 8: Asha posts anonymously with a photo');
  const before = cloud.uploads.length;
  const created = await upload('/anonymous/posts', asha.token, 'images', [file(JPG_WITH_EXIF, 'image/jpeg', 'IMG_20261008_hostel.jpg')], { fields: { category: 'hostel', title: 'Water cooler on floor two', content: 'The water cooler on the second floor has been leaking for a week and nobody has fixed it yet.' } });
  check('anonymous post with a photo → 201', created.status === 201, created.body);
  const postId = created.data?.post?.id;
  check('response never carries the author (even to the author)', leaks(created.body).length === 0 && !('author' in (created.data?.post ?? {})), leaks(created.body));
  const uploaded = cloud.uploads.slice(before);
  const sent = uploaded[0]?.content ? Buffer.from(uploaded[0].content, 'base64').toString('latin1') : '';
  check('photo metadata (camera, GPS) stripped before it left the server', uploaded.length === 1 && sent.length > 100 && !sent.includes(EXIF_SECRET) && !sent.includes('Exif\0\0Pixel'), { uploads: uploaded.length, hasSecret: sent.includes(EXIF_SECRET) });
  check('photo stored per post, never per student', uploaded[0]?.folder === `campusx/anonymous/${postId}`, uploaded[0]?.folder);
  check('stored author is the signed-in student', String((await db.collection('anonymousposts').findOne({ _id: oid(postId) })).author) === asha.id);
  await sleep(500);
  const pointsAfter = (await api('GET', '/gamification/me', { token: asha.token })).data;
  check('anonymous posting never earns points', JSON.stringify(pointsAfter.totalPoints ?? pointsAfter.points ?? pointsAfter) === JSON.stringify(pointsBefore.totalPoints ?? pointsBefore.points ?? pointsBefore) && (await db.collection('pointtransactions').countDocuments({ user: oid(asha.id), sourceType: { $regex: /anonymous/i } })) === 0);

  section('Journey 8: Bilal reads, comments, likes and reports');
  const list = await api('GET', '/anonymous/posts', { token: bilal.token });
  const item = list.data.posts.find((post) => post.id === postId);
  check('same college reads it (default visibility: college)', Boolean(item) && item.isOwner === false);
  check('list item: no author identity', leaks(item).length === 0, leaks(item));
  check('another college cannot see a college post (404, not listed)', (await api('GET', `/anonymous/posts/${postId}`, { token: chitra.token })).status === 404 && !JSON.stringify((await api('GET', '/anonymous/posts', { token: chitra.token })).body).includes(postId));
  const comment = await api('POST', `/anonymous/posts/${postId}/comments`, { token: bilal.token, body: { content: 'Same on our floor, the maintenance desk says parts are on order.' } });
  check('comment → 201, commenter not identified', comment.status === 201 && !JSON.stringify(comment.body).includes(bilal.id), comment.body);
  const ownReply = await api('POST', `/anonymous/posts/${postId}/comments`, { token: asha.token, body: { content: 'Thanks, I will follow up with the warden on Monday morning.' } });
  check('author replies: comment carries no identity either', ownReply.status === 201 && leaks(ownReply.body).length === 0);
  const like = await api('POST', `/anonymous/posts/${postId}/like`, { token: bilal.token });
  check('like (idempotent)', like.status === 200 && (await api('POST', `/anonymous/posts/${postId}/like`, { token: bilal.token })).data.likeCount === 1);
  const comments = await api('GET', `/anonymous/posts/${postId}/comments`, { token: bilal.token });
  check('comment list: nobody identified', comments.status === 200 && leaks(comments.body).length === 0 && !JSON.stringify(comments.body).includes(bilal.id));
  const report = await api('POST', `/anonymous/posts/${postId}/report`, { token: bilal.token, body: { reason: 'personal-info', details: 'Might identify the warden.' } });
  check('report → 201, no author in the response', report.status === 201 && leaks(report.body).length === 0, report.body);
  check('reporting twice → 409', (await api('POST', `/anonymous/posts/${postId}/report`, { token: bilal.token, body: { reason: 'spam' } })).status === 409);
  await sleep(700);

  section('Nowhere identifies the author');
  const single = await api('GET', `/anonymous/posts/${postId}`, { token: bilal.token });
  check('single post: no identity', single.status === 200 && leaks(single.body).length === 0);
  const notes = await api('GET', '/notifications', { token: asha.token });
  const anonNotes = notes.data.notifications.filter((note) => /ANONYMOUS/.test(note.type));
  check('author notified of comment and like as "Someone", with no actor', anonNotes.length >= 2 && anonNotes.every((note) => note.actor === null && /someone/i.test(note.message) && !JSON.stringify(note).includes(bilal.id)), anonNotes.map((note) => [note.type, note.message]));
  check("the author's own reply doesn't notify them", anonNotes.filter((note) => note.type === 'ANONYMOUS_POST_COMMENTED').length === 1);
  const bilalNotes = await api('GET', '/notifications', { token: bilal.token });
  check("other students' notifications never mention the author", leaks(bilalNotes.data).length === 0);
  const search = await api('GET', '/search?q=water%20cooler', { token: bilal.token });
  const found = collect(search.data, 'id').includes(postId);
  check('search finds the post by its text, with no author', found && leaks(search.data).length === 0, leaks(search.data));
  check("searching the author's name never finds it", !JSON.stringify((await api('GET', '/search?q=Asha%20Rao', { token: bilal.token })).body).includes(postId));
  const recs = [await api('GET', '/recommendations', { token: bilal.token }), await api('GET', '/recommendations/discover', { token: bilal.token })];
  // Asha may rightly be recommended as a student with shared interests; what matters is that no anonymous
  // item carries her identity and nothing ties her to the anonymous post.
  const anonymousItems = (value, found = []) => {
    if (Array.isArray(value)) value.forEach((entry) => anonymousItems(entry, found));
    else if (value && typeof value === 'object') {
      if (value.anonymous === true || value.id === postId) found.push(value);
      Object.values(value).forEach((entry) => anonymousItems(entry, found));
    }
    return found;
  };
  const recAnonymous = recs.flatMap((res) => anonymousItems(res.data));
  check('recommendations: anonymous items carry no author identity', recs.every((res) => res.status === 200) && recAnonymous.every((entry) => leaks(entry).length === 0 && !('author' in entry)), recAnonymous.slice(0, 2));
  const rankings = await api('GET', '/rankings/overall', { token: bilal.token });
  check('rankings never count or reveal anonymous activity', rankings.status === 200 && !JSON.stringify(rankings.body).includes(postId));
  const profile = await api('GET', `/profile/${asha.id}`, { token: bilal.token });
  check("the author's public profile never links the post", profile.status === 200 && !JSON.stringify(profile.body).includes(postId));
  const queue = await api('GET', '/admin/moderation?status=all', { token: mod.token });
  const anonCase = queue.data.cases.find((entry) => entry.targetId === postId);
  check('moderator queue: case shows "anonymous", no identity', Boolean(anonCase) && leaks(queue.body).length === 0, leaks(queue.body));
  const reports = await api('GET', '/admin/reports?status=all', { token: mod.token });
  check('staff report list: no author identity, no reporter identity', leaks(reports.body).length === 0 && !JSON.stringify(reports.body).includes(bilal.id));
  const reveal = await api('POST', `/admin/moderation/${anonCase.id}/reveal-author`, { token: mod.token, body: { reason: 'Report says it identifies a staff member; follow-up needed.' } });
  check('only the audited moderation reveal returns the author', reveal.status === 200 && reveal.data.author.id === asha.id);
  check('a student cannot use the reveal (403)', (await api('POST', `/admin/moderation/${anonCase.id}/reveal-author`, { token: bilal.token, body: { reason: 'Just curious about who wrote this one.' } })).status === 403);

  section('Visibility, personal information, validation');
  const campusWide = await api('POST', '/anonymous/posts', { token: bilal.token, body: { category: 'question', title: 'Best place to study late', content: 'Which reading rooms stay open after midnight during exam weeks around Nagpur?', visibility: 'campus' } });
  check('campus-wide anonymous post is readable from another college', campusWide.status === 201 && (await api('GET', `/anonymous/posts/${campusWide.data.post.id}`, { token: chitra.token })).status === 200);
  check('community visibility without a community → 422 or 403', [403, 422].includes((await api('POST', '/anonymous/posts', { token: bilal.token, body: { category: 'other', title: 'Community only post', content: 'This should only be visible inside one community.', visibility: 'community' } })).status));
  const phone = await api('POST', '/anonymous/posts', { token: bilal.token, body: { category: 'other', title: 'Selling my old cycle', content: 'Call me on 9876543210 if you want the cycle, good condition.' } });
  check('phone number in an anonymous post → 422 (personal information)', phone.status === 422, phone.body);
  const email = await api('POST', `/anonymous/posts/${postId}/comments`, { token: bilal.token, body: { content: 'Email me at bilal.khan@college.edu for the details please.' } });
  check('email address in an anonymous comment → 422', email.status === 422, email.body);
  check('unknown category → 422; title too short → 422', (await api('POST', '/anonymous/posts', { token: bilal.token, body: { category: 'gossip', title: 'Hello there', content: 'Content long enough to pass the minimum length rules.' } })).status === 422 && (await api('POST', '/anonymous/posts', { token: bilal.token, body: { category: 'other', title: 'Hi', content: 'Content long enough to pass the minimum length rules.' } })).status === 422);
  check('a program disguised as a photo → 415', (await upload('/anonymous/posts', bilal.token, 'images', [file(Buffer.from('MZ'.padEnd(128, 'x')), 'image/png', 'photo.png')], { fields: { category: 'other', title: 'Photo test post', content: 'This post tries to upload a disguised program as a photo.' } })).status === 415);
  const png2 = await upload('/anonymous/posts', bilal.token, 'images', [png()], { fields: { category: 'event', title: 'Fest stage setup', content: 'The main stage is almost ready for tonight, lights look amazing from the lawn.' } });
  check('PNG photo post → 201', png2.status === 201, png2.body);

  section('Edit, delete, my posts');
  check('someone else edits → 403', (await api('PUT', `/anonymous/posts/${postId}`, { token: bilal.token, body: { title: 'Changed by someone else' } })).status === 403);
  check('someone else deletes → 403', (await api('DELETE', `/anonymous/posts/${postId}`, { token: bilal.token })).status === 403);
  const edit = await api('PUT', `/anonymous/posts/${postId}`, { token: asha.token, body: { content: 'Update: the water cooler on the second floor was fixed today, thanks everyone.' } });
  check('author edits → 200, still anonymous', edit.status === 200 && leaks(edit.body).length === 0, edit.body);
  const mine = await api('GET', '/anonymous/me', { token: asha.token });
  check("'my anonymous posts' lists only the author's own", mine.status === 200 && mine.data.posts.some((post) => post.id === postId) && !mine.data.posts.some((post) => post.id === campusWide.data.post.id));
  const bilalComment = comment.data.comment.id;
  check('comment author edits → 200; post author cannot edit it (403)', (await api('PUT', `/anonymous/comments/${bilalComment}`, { token: bilal.token, body: { content: 'Same on our floor, the parts arrived on Friday.' } })).status === 200 && (await api('PUT', `/anonymous/comments/${bilalComment}`, { token: asha.token, body: { content: 'Edited by the post author here.' } })).status === 403);
  check('comment author deletes → 200', (await api('DELETE', `/anonymous/comments/${bilalComment}`, { token: bilal.token })).status === 200);
  const del = await api('DELETE', `/anonymous/posts/${postId}`, { token: asha.token });
  check('author deletes → gone for everyone (404), including the author', del.status === 200 && (await api('GET', `/anonymous/posts/${postId}`, { token: bilal.token })).status === 404 && (await api('GET', `/anonymous/posts/${postId}`, { token: asha.token })).status === 404);
  const softDeleted = await db.collection('anonymousposts').findOne({ _id: oid(postId) });
  check('soft delete: kept for safety reviews (status deleted, deletedAt)', softDeleted?.status === 'deleted' && Boolean(softDeleted.deletedAt));
  check('deleted post: no new comments (404)', (await api('POST', `/anonymous/posts/${postId}/comments`, { token: bilal.token, body: { content: 'Commenting after it was deleted.' } })).status === 404);
  check('malformed id → 404', (await api('GET', '/anonymous/posts/not-an-id', { token: bilal.token })).status === 404);
} catch (error) {
  check('suite ran to the end without crashing', false, error.stack);
}
await t.finish();
