// Trust & Safety (Phase 13): ordinary student writing is never held (false-positive check on 30 realistic
// posts), spam / clickbait / capitals / punctuation / duplicates / links / threats / posting speed, flagged
// vs restricted vs removed, reports and cases, staff decisions, soft deletion, the enforcement ladder
// (warning → posting pause), report abuse, and the audit trail.
import { createSuite, oid, sleep } from '../lib/harness.mjs';

const t = await createSuite('moderation');
const { check, section, api, register, db, must } = t;
const statusOf = async (id) => (await db.collection('posts').findOne({ _id: oid(id) }))?.moderationStatus;
const NAMES = ['Aarav', 'Bina', 'Chirag', 'Divya', 'Eshan', 'Fatima', 'Gauri', 'Harsh', 'Ira', 'Jay', 'Kavya', 'Laksh', 'Meera', 'Nikhil', 'Ojas', 'Pari', 'Qadir', 'Riddhi', 'Sahil', 'Tara', 'Uday', 'Vani', 'Wasim', 'Yash', 'Zoya', 'Aditi', 'Bhuvan', 'Charvi', 'Daksh', 'Esha'];

try {
  section('Ordinary student writing is never held');
  const realistic = [
    'Does anyone have the DBMS lab manual for semester 5? Need it before Thursday.',
    'Lost my ID card near the canteen around 2 pm, please DM if found 🙏',
    'Exam schedule for midsems is out on the ERP portal, check before the weekend.',
    'Kal ka OS lecture cancel ho gaya kya? Koi confirm kar sakta hai?',
    'Our team just pushed v2 of the attendance app: https://github.com/campusx/attendance',
    'Notes for Computer Networks unit 3 are here https://drive.google.com/drive/folders/abc123',
    'Placement prep group meets in the library seminar room every Sunday at 10.',
    'Anyone up for badminton at 6 tomorrow? We need two more players.',
    'The new canteen menu is actually good, try the paneer wrap!',
    'Reminder: hostel fee deadline is 15th, late fee after that.',
    'Watching the recorded lecture on YouTube helped a lot https://youtu.be/dQw4w9WgXcQ',
    'Can someone explain why my React useEffect runs twice in development mode?',
    'Free coding workshop by the GDG chapter this Friday, registration form in bio.',
    'Congratulations to our robotics team for winning the regional round! 🎉',
    'Selling my engineering graphics drafter, barely used, 400 rupees.',
    'Is the gym open during the Diwali break? Asking for the hostel folks.',
    'Results revealed today for the coding contest, check your mail.',
    'You must see the sunset from the new library terrace, it is beautiful.',
    'NPTEL exam registration closes tonight, do not miss it.',
    'What happened to the WiFi in block C? It has been down since morning.',
    'Our startup idea pitch is ready, feedback welcome before the demo day.',
    'Thanks everyone for the birthday wishes, you made my day!',
    'Need a teammate who knows Figma for the UI/UX hackathon next week.',
    'Got my first internship offer today, thank you seniors for the guidance.',
    'Mess food was cold again today, raising it with the committee.',
    'Is there any study group for GATE CSE preparation in our college?',
    'Uploaded the photos from the cultural fest, tag yourselves!',
    'Bus 7 was 40 minutes late, anyone else stuck at the gate?',
    'Our club is recruiting first years for design and tech roles.',
    'Please return the library book on compilers if you borrowed it from me.',
  ];
  const authors = [];
  for (const name of NAMES) authors.push(await register(name, 'Student'));
  const ids = [];
  for (const [index, text] of realistic.entries()) ids.push((await must(api('POST', '/posts', { token: authors[index].token, body: { content: text, visibility: 'public' } }), `post ${index}`)).data.post.id);
  const statuses = await Promise.all(ids.map(statusOf));
  const notApproved = statuses.map((status, index) => [status, realistic[index]]).filter(([status]) => status !== 'approved');
  check('30 realistic posts (Hinglish, links, emoji, acronyms, "revealed", "must see", "free workshop"): none restricted or removed', statuses.every((status) => !['restricted', 'removed'].includes(status)), notApproved);
  check('…and none even flagged', notApproved.length === 0, notApproved);
  const comment = await api('POST', `/posts/${ids[0]}/comments`, { token: authors[1].token, body: { content: 'ok' } });
  await api('POST', `/posts/${ids[1]}/comments`, { token: authors[1].token, body: { content: 'ok' } });
  check('short repeated replies ("ok") are never treated as duplicates', comment.status === 201 && (await db.collection('comments').countDocuments({ author: oid(authors[1].id), moderationStatus: 'approved' })) === 2);

  section('Spam, clickbait, capitals, punctuation');
  const spammer = await register('Spam', 'Account');
  const spam = await must(api('POST', '/posts', { token: spammer.token, body: { content: 'Make money fast! Click here for free cash, get rich with this investment plan!!!', visibility: 'public' } }), 'spam post');
  const spamId = spam.data.post.id;
  check('obvious spam is restricted (owner-only), with a notice for the author', (await statusOf(spamId)) === 'restricted' && Boolean(spam.data.post.moderation), spam.data.post.moderation);
  check('restricted: other students get 404', (await api('GET', `/posts/${spamId}`, { token: authors[0].token })).status === 404);
  const spamCase = await db.collection('moderationcases').findOne({ targetId: oid(spamId) });
  check('an automated case is opened with plain reasons', Boolean(spamCase) && spamCase.sources.includes('automated') && spamCase.reasons.some((reason) => /spam phrase/i.test(reason)), spamCase?.reasons);
  check('a violation is recorded and the author warned (first rung)', (await db.collection('users').findOne({ _id: oid(spammer.id) })).moderation?.violationCount >= 1 && Boolean(await db.collection('moderationauditlogs').findOne({ action: 'WARN_USER', targetId: oid(spammer.id) })));
  const shouty = await register('Loud', 'Poster');
  const caps = await must(api('POST', '/posts', { token: shouty.token, body: { content: 'EXAM POSTPONED TO MONDAY!!! CHECK THE NOTICE BOARD NOW', visibility: 'public' } }), 'caps post');
  check('capitals + "!!!" together → flagged (still public, kept out of search)', (await statusOf(caps.data.post.id)) === 'flagged' && (await api('GET', `/posts/${caps.data.post.id}`, { token: authors[0].token })).status === 200);

  section('Links');
  const linker = await register('Link', 'Sharer');
  const js = await must(api('POST', '/posts', { token: linker.token, body: { content: 'Click this to fix your wifi javascript:alert(document.cookie) works every time', visibility: 'public' } }), 'js link');
  check('a javascript: link is held for a moderator (restricted, escalated)', (await statusOf(js.data.post.id)) === 'restricted' && (await db.collection('moderationcases').findOne({ targetId: oid(js.data.post.id) }))?.flags?.includes('dangerous_link'));
  const linker2 = await register('Form', 'Sharer');
  const short = await must(api('POST', '/posts', { token: linker2.token, body: { content: 'Fill the fest volunteer form here: https://bit.ly/fest-volunteers', visibility: 'public' } }), 'short link');
  check('a single shortened link alone is fine (approved)', (await statusOf(short.data.post.id)) === 'approved');

  section('Threats and harassment');
  const angry = await register('Angry', 'Student');
  const threat = await must(api('POST', '/posts', { token: angry.token, body: { content: 'I will hurt you if you keep posting this nonsense in the group.', visibility: 'public' } }), 'threat');
  const threatCase = await db.collection('moderationcases').findOne({ targetId: oid(threat.data.post.id) });
  check('a threat is held and escalated (high or critical risk)', (await statusOf(threat.data.post.id)) === 'restricted' && ['high', 'critical'].includes(threatCase?.riskLevel), threatCase?.riskLevel);

  section('Duplicates and posting speed');
  const copier = await register('Copy', 'Paster');
  const text = 'Join our coding club orientation in the main auditorium this Friday at five.';
  await must(api('POST', '/posts', { token: copier.token, body: { content: text, visibility: 'public' } }), 'original');
  const dup = await must(api('POST', '/posts', { token: copier.token, body: { content: text, visibility: 'public' } }), 'duplicate');
  check('the same text again within an hour → restricted (exact duplicate)', (await statusOf(dup.data.post.id)) === 'restricted');
  const fast = await register('Fast', 'Poster');
  const topics = ['library timing change', 'sports day registrations', 'mess menu feedback form', 'lab assignment deadline', 'club recruitment drive', 'guest lecture on cloud'];
  const fastIds = [];
  for (const topic of topics) fastIds.push((await must(api('POST', '/posts', { token: fast.token, body: { content: `Quick update about the ${topic}, details are on the official notice board today.`, visibility: 'public' } }), topic)).data.post.id);
  check('a 6th post within 10 minutes is flagged (rapid posting), the first five are fine', (await statusOf(fastIds[5])) === 'flagged' && (await Promise.all(fastIds.slice(0, 5).map(statusOf))).every((status) => status === 'approved'), await Promise.all(fastIds.map(statusOf)));

  section('Reports, cases and staff decisions');
  const admin = await register('Ada', 'Admin');
  await db.collection('users').updateOne({ _id: oid(admin.id) }, { $set: { role: 'admin' } });
  await t.relogin(admin);
  const target = ids[8];
  for (const reporter of authors.slice(10, 12)) await must(api('POST', '/reports', { token: reporter.token, body: { targetType: 'post', targetId: target, reason: 'misleading' } }), 'report');
  check('two reports: the post stays approved (reports alone never hide content)', (await statusOf(target)) === 'approved');
  await must(api('POST', '/reports', { token: authors[12].token, body: { targetType: 'post', targetId: target, reason: 'misleading' } }), 'third report');
  const reported = await db.collection('moderationcases').findOne({ targetId: oid(target), active: true });
  check('three different reporters: flagged for review, one case with 3 reports', (await statusOf(target)) === 'flagged' && reported?.reportCount === 3, reported?.reportCount);
  check('report validation: unknown reason → 422; unknown target → 404; own content → 400', (await api('POST', '/reports', { token: authors[13].token, body: { targetType: 'post', targetId: target, reason: 'ugly' } })).status === 422 && (await api('POST', '/reports', { token: authors[13].token, body: { targetType: 'post', targetId: '0123456789abcdef01234567', reason: 'spam' } })).status === 404 && (await api('POST', '/reports', { token: authors[8].token, body: { targetType: 'post', targetId: target, reason: 'spam' } })).status === 400);
  const myReports = await api('GET', '/reports/me', { token: authors[10].token });
  check('a student sees their own reports (never others\')', myReports.status === 200 && myReports.data.reports.length === 1);
  const dismiss = await api('PATCH', `/admin/moderation/${reported._id}`, { token: admin.token, body: { decision: 'dismiss' } });
  check('staff dismiss the case → content back to approved, reports closed', dismiss.status === 200 && (await statusOf(target)) === 'approved' && (await db.collection('reports').countDocuments({ targetId: oid(target), active: true })) === 0, dismiss.body);
  const removeCase = await db.collection('moderationcases').findOne({ targetId: oid(spamId), active: true });
  const remove = await api('PATCH', `/admin/moderation/${removeCase._id}`, { token: admin.token, body: { decision: 'remove', note: 'Spam, removed during QA', confirm: true } });
  check('staff remove → removed (soft delete: the document is kept)', remove.status === 200 && (await statusOf(spamId)) === 'removed', remove.body);
  check('removed content: gone for the author too, edits refused (409)', (await api('GET', `/posts/${spamId}`, { token: spammer.token })).status === 404 && (await api('PUT', `/posts/${spamId}`, { token: spammer.token, body: { content: 'Trying again with new words.' } })).status === 409);
  const trail = await db.collection('moderationauditlogs').find({ targetId: oid(spamId) }).toArray();
  check('audit trail: automated hold and the staff removal, with actor and reason', trail.some((row) => row.actorRole === 'system') && trail.some((row) => String(row.actor) === admin.id && /removed during QA/i.test(row.reason ?? '')), trail.map((row) => `${row.actorRole}:${row.action}`));
  check('audit rows hold no post text', !JSON.stringify(trail).includes('Make money fast'));

  section('Enforcement ladder: warning, then a posting pause');
  const repeat = await register('Repeat', 'Offender');
  const bad = ['Win free cash now, click here and get rich today with our plan!!!', 'Unlimited free followers, click here to earn money from home online!!!', 'Crypto wealth investment plan, double your money, claim reward now!!!'];
  for (const content of bad) await api('POST', '/posts', { token: repeat.token, body: { content, visibility: 'public' } });
  const repeatDoc = await db.collection('users').findOne({ _id: oid(repeat.id) });
  check('three violations → a 24-hour posting pause', repeatDoc.moderation?.violationCount === 3 && new Date(repeatDoc.moderation?.restrictedUntil) > new Date(), repeatDoc.moderation);
  const paused = await api('POST', '/posts', { token: repeat.token, body: { content: 'A perfectly normal post about the library timings today.', visibility: 'public' } });
  check('while paused, new posts are refused with a clear message (403)', paused.status === 403 && /until/i.test(paused.body.message), paused.body);
  check('while paused, reading still works', (await api('GET', '/posts', { token: repeat.token })).status === 200);
  await db.collection('users').updateOne({ _id: oid(repeat.id) }, { $set: { 'moderation.restrictedUntil': new Date(Date.now() - 60_000) } });
  check('after the pause ends, posting works again', (await api('POST', '/posts', { token: repeat.token, body: { content: 'Back to normal: the reading room is open late this week.', visibility: 'public' } })).status === 201);
  check('never an automatic ban: the account is still active', (await db.collection('users').findOne({ _id: oid(repeat.id) })).status === 'active');
  const notes = (await api('GET', '/notifications?limit=50', { token: repeat.token })).data.notifications.map((note) => note.type);
  check('the student was told: warning and posting pause notifications', notes.includes('MODERATION_WARNING') && notes.includes('ACCOUNT_RESTRICTED'), notes);
  check('students never see their risk score', !/riskScore|riskLevel/.test((await api('GET', '/profile', { token: repeat.token })).text) && !/riskScore|riskLevel/.test((await api('GET', '/auth/me', { token: repeat.token })).text));
} catch (error) {
  check('suite ran to the end without crashing', false, error.stack);
}
await t.finish();
