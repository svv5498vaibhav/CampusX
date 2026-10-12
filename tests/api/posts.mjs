// Campus feed and posts (Phase 5): create with photos/video, visibility across branches and colleges,
// edit/delete ownership, likes and saves (idempotent, concurrent), comments, reports, removed content,
// feed filters and pagination, media cleanup on failure and delete.
import { collect, createSuite, oid, sleep } from '../lib/harness.mjs';
import { MP4, file, jpg, png, webp } from '../lib/files.mjs';

const t = await createSuite('posts', { cloudinary: true });
const { check, section, api, register, upload, db } = t;
const cloud = t.cloudinary;
const uploadsCount = () => cloud.uploads.length;

try {
  section('Setup');
  const asha = await register('Asha', 'Rao'); // VNIT CSE
  const bilal = await register('Bilal', 'Khan'); // VNIT CSE
  const chitra = await register('Chitra', 'Iyer', { branch: 'it' }); // VNIT IT
  const dev = await register('Dev', 'Patel', { college: 'iiit-nagpur' }); // another college
  const newbie = await register('Neel', 'Joshi', { onboard: false });
  const admin = await register('Ada', 'Admin');
  await db.collection('users').updateOne({ _id: oid(admin.id) }, { $set: { role: 'admin' } });
  await t.relogin(admin);
  check('setup: six accounts', Boolean(asha.token && bilal.token && chitra.token && dev.token && newbie.token && admin.token));

  section('Create: validation');
  const options = await api('GET', '/posts/options', { token: asha.token });
  check('post options: types, visibility, filters, report reasons, limits', options.status === 200 && options.data.types.length >= 5 && options.data.visibility.length === 3 && options.data.filters.length >= 5);
  check('student without a campus profile cannot post (403)', (await api('POST', '/posts', { token: newbie.token, body: { content: 'Hello campus, first post here from a new account.' } })).status === 403);
  check('empty post → 422', (await api('POST', '/posts', { token: asha.token, body: { content: '   ' } })).status === 422);
  check('3001 characters → 422', (await api('POST', '/posts', { token: asha.token, body: { content: 'a'.repeat(3001) } })).status === 422);
  check('unknown type → 422', (await api('POST', '/posts', { token: asha.token, body: { content: 'Valid text for a post with a bad type.', type: 'meme' } })).status === 422);
  check('unknown visibility → 422', (await api('POST', '/posts', { token: asha.token, body: { content: 'Valid text for a post with bad visibility.', visibility: 'world' } })).status === 422);
  check('community id that is not an id → 422', (await api('POST', '/posts', { token: asha.token, body: { content: 'Posting to a broken community id here.', community: 'abc' } })).status === 422);
  check('unknown community → 404', (await api('POST', '/posts', { token: asha.token, body: { content: 'Posting to a community that does not exist.', community: '0123456789abcdef01234567' } })).status === 404);
  check('no token → 401', (await api('POST', '/posts', { body: { content: 'Anonymous attempt without a token here.' } })).status === 401);

  section('Create: text, photos and video');
  const campusPost = await api('POST', '/posts', { token: asha.token, body: { content: 'Robotics club demo on Friday in the main hall, bring your line followers.' } });
  check('text post 201, defaults to campus visibility, author is the signed-in student', campusPost.status === 201 && campusPost.data.post.visibility === 'campus' && campusPost.data.post.author.id === asha.id && campusPost.data.post.type === 'text', campusPost.body);
  const branchPost = await api('POST', '/posts', { token: asha.token, body: { content: 'CSE third years: the compiler lab moved to room 204 from Monday.', visibility: 'branch', type: 'campus-update' } });
  check('branch post 201 (type campus-update)', branchPost.status === 201 && branchPost.data.post.visibility === 'branch' && branchPost.data.post.type === 'campus-update', branchPost.body);
  const publicPost = await api('POST', '/posts', { token: asha.token, body: { content: 'Open-source hackathon this weekend, every college is welcome to join us.', visibility: 'public', type: 'event' } });
  check('public post 201', publicPost.status === 201 && publicPost.data.post.visibility === 'public');
  const [campusId, branchId, publicId] = [campusPost.data.post.id, branchPost.data.post.id, publicPost.data.post.id];

  const before = uploadsCount();
  const photoPost = await upload('/posts', bilal.token, 'media', [jpg(), png(), webp()], { fields: { content: 'Sunset from the hostel terrace, three angles of the same evening.', visibility: 'public' } });
  check('photo post with JPG + PNG + WEBP → 201, type photo, 3 media', photoPost.status === 201 && photoPost.data.post.type === 'photo' && photoPost.data.post.media.length === 3, photoPost.body);
  check('photos uploaded to Cloudinary (posts folder), display URLs from Cloudinary', uploadsCount() - before === 3 && cloud.uploads.slice(-3).every((item) => item.folder?.startsWith('campusx/posts')) && photoPost.data.post.media.every((item) => item.url.startsWith('https://res.cloudinary.com/')), cloud.uploads.slice(-3));
  const photoPostId = photoPost.data?.post?.id;
  const videoPost = await upload('/posts', chitra.token, 'media', [file(MP4, 'video/mp4', 'clip.mp4')], { fields: { content: 'Our dance crew practice clip for the fest.' } });
  check('video post → 201, type video, poster URL', videoPost.status === 201 && videoPost.data.post.type === 'video' && Boolean(videoPost.data.post.media[0]?.posterUrl), videoPost.body);
  check('a small video is served optimised (q_auto)', /\/video\/upload\/q_auto\//.test(videoPost.data?.post?.media?.[0]?.url ?? ''), videoPost.data?.post?.media?.[0]?.url);
  const largeVideo = await upload('/posts', chitra.token, 'media', [file(Buffer.concat([MP4, Buffer.alloc(41 * 1024 * 1024)]), 'video/mp4', 'fest.mp4')], { fields: { content: 'Full fest performance from the main stage.' } });
  check('a 41 MB video (above Cloudinary Free on-the-fly limit) → 201, served as uploaded (no transformation)', largeVideo.status === 201 && /\/video\/upload\/v\d+\//.test(largeVideo.data?.post?.media?.[0]?.url ?? ''), largeVideo.data?.post?.media?.[0]?.url ?? largeVideo.body);
  check('5 photos → 422 (max 4)', (await upload('/posts', bilal.token, 'media', [jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg'), jpg('d.jpg'), jpg('e.jpg')], { fields: { content: 'Too many photos.' } })).status === 422);
  check('photo + video together → 422', (await upload('/posts', bilal.token, 'media', [jpg(), file(MP4, 'video/mp4', 'clip.mp4')], { fields: { content: 'Mixed media.' } })).status === 422);
  check('photo-only post (no text) is fine', (await upload('/posts', dev.token, 'media', [jpg()], {})).status === 201);

  const beforeFailure = uploadsCount();
  const destroyedBefore = cloud.destroyed.length;
  cloud.failNext(1, 1);
  const failed = await upload('/posts', bilal.token, 'media', [jpg('one.jpg'), png('two.png')], { fields: { content: 'Upload where the second photo fails.' } });
  check('a failed upload → 502 with a friendly message', failed.status === 502 && /upload failed/i.test(failed.body.message), failed.body);
  await sleep(300);
  check('the photo that did upload is deleted again (nothing left behind)', uploadsCount() - beforeFailure === 1 && cloud.destroyed.length - destroyedBefore === 1, { uploaded: uploadsCount() - beforeFailure, destroyed: cloud.destroyed.length - destroyedBefore });
  check('no post saved for the failed upload', (await db.collection('posts').countDocuments({ content: 'Upload where the second photo fails.' })) === 0);

  section('Visibility');
  const see = async (who, id) => (await api('GET', `/posts/${id}`, { token: who.token })).status;
  check('same branch sees campus, branch and public posts', (await see(bilal, campusId)) === 200 && (await see(bilal, branchId)) === 200 && (await see(bilal, publicId)) === 200);
  check('same college, other branch: campus + public, not branch', (await see(chitra, campusId)) === 200 && (await see(chitra, branchId)) === 404 && (await see(chitra, publicId)) === 200);
  check('other college: public only', (await see(dev, campusId)) === 404 && (await see(dev, branchId)) === 404 && (await see(dev, publicId)) === 200);
  const devFeed = await api('GET', '/posts?limit=20', { token: dev.token });
  const devIds = devFeed.data.posts.map((post) => post.id);
  check('feed of another college never contains campus/branch posts', devFeed.status === 200 && devIds.includes(publicId) && !devIds.includes(campusId) && !devIds.includes(branchId));
  const branchFeed = await api('GET', '/posts?filter=branch', { token: bilal.token });
  check('"My Branch" filter returns branch posts of the viewer\'s branch', branchFeed.status === 200 && branchFeed.data.posts.some((post) => post.id === branchId));
  const eventFeed = await api('GET', '/posts?filter=event', { token: bilal.token });
  check('type filter (event) returns only events', eventFeed.status === 200 && eventFeed.data.posts.length >= 1 && eventFeed.data.posts.every((post) => post.type === 'event'));
  check('unknown filter → 422', (await api('GET', '/posts?filter=memes', { token: bilal.token })).status === 422);
  const feedJson = JSON.stringify(devFeed.body);
  check('feed never exposes like/save lists, emails or audiences', !feedJson.includes('"likes"') && !feedJson.includes('"saves"') && !feedJson.includes('@qa.campusx.dev') && !feedJson.includes('"audience"'));

  section('Edit and ownership');
  const edit = await api('PUT', `/posts/${publicId}`, { token: asha.token, body: { content: 'Open-source hackathon this weekend (Saturday 10 am), every college welcome.' } });
  check('owner edits → 200, editedAt set', edit.status === 200 && Boolean(edit.data.post.editedAt) && edit.data.post.content.includes('Saturday'), edit.body);
  check('another student edits → 403', (await api('PUT', `/posts/${publicId}`, { token: bilal.token, body: { content: 'Hijacked content that should never be saved.' } })).status === 403);
  check('another college edits → 403', (await api('PUT', `/posts/${publicId}`, { token: dev.token, body: { content: 'Hijacked content from another college.' } })).status === 403);
  check('edit missing post → 404', (await api('PUT', '/posts/0123456789abcdef01234567', { token: asha.token, body: { content: 'Nothing here to edit at all.' } })).status === 404);
  check('edit to empty → 422', (await api('PUT', `/posts/${publicId}`, { token: asha.token, body: { content: '' } })).status === 422);
  const narrow = await api('PUT', `/posts/${publicId}`, { token: asha.token, body: { visibility: 'campus' } });
  check('owner narrows visibility public → campus; other college loses access', narrow.status === 200 && (await see(dev, publicId)) === 404);
  const photoMedia = photoPost.data?.post?.media ?? [];
  const destroyedBeforeEdit = cloud.destroyed.length;
  const keep = await upload(`/posts/${photoPostId}`, bilal.token, 'media', [], { method: 'PUT', fields: { keepMedia: JSON.stringify([photoMedia[0]?.id]) } });
  check('owner removes 2 of 3 photos with keepMedia → 1 left', keep.status === 200 && keep.data.post.media.length === 1, keep.body);
  await sleep(300);
  check('removed photos deleted from Cloudinary', cloud.destroyed.length - destroyedBeforeEdit === 2, cloud.destroyed.length - destroyedBeforeEdit);
  check('post author cannot be changed by an edit', String((await db.collection('posts').findOne({ _id: oid(campusId) })).author) === asha.id);

  section('Likes and saves');
  const like = await api('POST', `/posts/${campusId}/like`, { token: bilal.token });
  check('like → likeCount 1, likedByCurrentUser', like.status === 200 && like.data.likeCount === 1 && like.data.likedByCurrentUser === true, like.body);
  check('repeat like is idempotent (still 1)', (await api('POST', `/posts/${campusId}/like`, { token: bilal.token })).data.likeCount === 1);
  const burst = await Promise.all(Array.from({ length: 6 }, () => api('POST', `/posts/${campusId}/like`, { token: chitra.token })));
  check('6 concurrent likes from one student count once', burst.every((res) => res.status === 200) && (await api('GET', `/posts/${campusId}`, { token: asha.token })).data.post.likeCount === 2);
  const unlike = await api('DELETE', `/posts/${campusId}/like`, { token: bilal.token });
  check('unlike → 1, repeat unlike stays 1', unlike.data.likeCount === 1 && (await api('DELETE', `/posts/${campusId}/like`, { token: bilal.token })).data.likeCount === 1);
  check('liking a post you cannot see → 404', (await api('POST', `/posts/${campusId}/like`, { token: dev.token })).status === 404);
  check('like with a malformed id → 404', (await api('POST', '/posts/not-an-id/like', { token: dev.token })).status === 404);
  const save = await api('POST', `/posts/${campusId}/save`, { token: bilal.token });
  check('save → savedByCurrentUser; unsave → false', save.data?.savedByCurrentUser === true && (await api('DELETE', `/posts/${campusId}/save`, { token: bilal.token })).data.savedByCurrentUser === false);

  section('Comments');
  const comment = await api('POST', `/posts/${campusId}/comments`, { token: bilal.token, body: { content: 'I will bring two bots and spare batteries.' } });
  check('comment → 201, commentCount 1', comment.status === 201 && comment.data.commentCount === 1, comment.body);
  const commentId = comment.data?.comment?.id;
  check('empty comment → 422; 1001 characters → 422', (await api('POST', `/posts/${campusId}/comments`, { token: bilal.token, body: { content: '  ' } })).status === 422 && (await api('POST', `/posts/${campusId}/comments`, { token: bilal.token, body: { content: 'x'.repeat(1001) } })).status === 422);
  check('commenting on a post you cannot see → 404', (await api('POST', `/posts/${campusId}/comments`, { token: dev.token, body: { content: 'Can I join from another college?' } })).status === 404);
  for (const [index, text] of ['Count me in for the demo.', 'Is it open to first years too?', 'Which time does it start?'].entries()) await api('POST', `/posts/${campusId}/comments`, { token: [chitra, asha, bilal][index].token, body: { content: text } });
  const page1 = await api('GET', `/posts/${campusId}/comments?limit=2`, { token: asha.token });
  const page2 = await api('GET', `/posts/${campusId}/comments?limit=2&page=2`, { token: asha.token });
  const commentIds = [...page1.data.comments, ...page2.data.comments].map((item) => item.id);
  check('comments paginate without duplicates (4 total)', page1.data.pagination.total === 4 && new Set(commentIds).size === 4 && page1.data.pagination.hasMore === true && page2.data.pagination.hasMore === false, page1.data.pagination);
  check('comment author edits → 200', (await api('PUT', `/comments/${commentId}`, { token: bilal.token, body: { content: 'I will bring three bots and spare batteries.' } })).status === 200);
  check("post author can't edit someone's comment (403)", (await api('PUT', `/comments/${commentId}`, { token: asha.token, body: { content: 'Rewritten by the post author.' } })).status === 403);
  check("post author can't delete someone's comment (403)", (await api('DELETE', `/comments/${commentId}`, { token: asha.token })).status === 403);
  const deleted = await api('DELETE', `/comments/${commentId}`, { token: bilal.token });
  check('comment author deletes → count goes down to 3', deleted.status === 200 && deleted.data.commentCount === 3, deleted.body);
  check('deleting it again → 404', (await api('DELETE', `/comments/${commentId}`, { token: bilal.token })).status === 404);

  section('Reports and removed content');
  const report = await api('POST', `/posts/${campusId}/report`, { token: bilal.token, body: { reason: 'spam', details: 'Looks like an ad.' } });
  check('report → 201', report.status === 201, report.body);
  check('reporting the same post twice → 409', (await api('POST', `/posts/${campusId}/report`, { token: bilal.token, body: { reason: 'spam' } })).status === 409);
  const selfReport = await api('POST', `/posts/${campusId}/report`, { token: asha.token, body: { reason: 'spam' } });
  check('reporting your own post is refused', selfReport.status >= 400 && selfReport.status < 500, selfReport.status);
  check('report with an unknown reason → 422', (await api('POST', `/posts/${campusId}/report`, { token: chitra.token, body: { reason: 'boring' } })).status === 422);
  const removed = await api('PATCH', `/admin/content/post/${branchId}`, { token: admin.token, body: { action: 'remove', reason: 'Removed during QA testing', confirm: true } });
  check('staff remove a post', removed.status === 200, removed.body);
  check('removed post: hidden from other students (404)', (await see(bilal, branchId)) === 404);
  check('removed post: hidden from its author too (404)', (await see(asha, branchId)) === 404);
  check('removed post: author cannot edit it (409)', (await api('PUT', `/posts/${branchId}`, { token: asha.token, body: { content: 'Trying to bring it back.' } })).status === 409);
  check('removed post never appears in feeds', !(await api('GET', '/posts?limit=20', { token: bilal.token })).data.posts.some((post) => post.id === branchId));

  section('Delete');
  check("another student can't delete (403)", (await api('DELETE', `/posts/${campusId}`, { token: bilal.token })).status === 403);
  const destroyedBeforeDelete = cloud.destroyed.length;
  const delPhoto = await api('DELETE', `/posts/${photoPostId}`, { token: bilal.token });
  await sleep(300);
  check('owner deletes a photo post → its photo deleted from Cloudinary', delPhoto.status === 200 && cloud.destroyed.length - destroyedBeforeDelete === 1);
  const del = await api('DELETE', `/posts/${campusId}`, { token: asha.token });
  check('owner deletes → 200, then 404', del.status === 200 && (await see(asha, campusId)) === 404 && (await see(bilal, campusId)) === 404);
  check("the deleted post's comments are deleted", (await db.collection('comments').countDocuments({ post: oid(campusId) })) === 0);
  check('reports about the deleted post are kept for moderators', (await db.collection('reports').countDocuments({ targetId: oid(campusId) })) >= 1);
  check('deleting again → 404', (await api('DELETE', `/posts/${campusId}`, { token: asha.token })).status === 404);

  section('Feed pagination with many posts');
  const authors = [];
  for (const name of ['Arjun', 'Bhavna', 'Charu', 'Daksh', 'Esha', 'Farid']) authors.push(await register(name, 'Writer'));
  const topics = ['library hours', 'bus timings', 'canteen menu', 'lab schedule', 'sports day', 'placement talk'];
  for (let round = 0; round < 4; round += 1) {
    for (const [index, author] of authors.entries()) {
      await api('POST', '/posts', { token: author.token, body: { content: `Update ${round + 1} from writer ${index} about the ${topics[(index + round) % topics.length]} this week, details in the notice board.`, visibility: 'public' } });
    }
  }
  const seen = [];
  let pageNumber = 1;
  let hasMore = true;
  while (hasMore && pageNumber <= 10) {
    const res = await api('GET', `/posts?limit=10&page=${pageNumber}`, { token: dev.token });
    seen.push(...res.data.posts);
    hasMore = res.data.pagination?.hasMore;
    pageNumber += 1;
  }
  const seenIds = seen.map((post) => post.id);
  check('paging through the feed never repeats a post', new Set(seenIds).size === seenIds.length && seenIds.length >= 24, seenIds.length);
  check('feed is newest first', seen.every((post, index) => index === 0 || new Date(seen[index - 1].createdAt) >= new Date(post.createdAt)));
  check('page size above 20 → 422; page 0 → 422', (await api('GET', '/posts?limit=21', { token: dev.token })).status === 422 && (await api('GET', '/posts?page=0', { token: dev.token })).status === 422);
  check('every listed author is a public summary (no email, role or status)', collect(seen, 'author').every((author) => author && !('email' in author) && !('status' in author)));
} catch (error) {
  check('suite ran to the end without crashing', false, error.stack);
}
await t.finish();
