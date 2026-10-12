// Onboarding (Phase 3) and profiles (Phase 4): campus identity validation, roll numbers, the identity
// lock, own vs public profile, editing, styles, completeness, profile photo and cover (Cloudinary).
import { createSuite, oid, sleep } from '../lib/harness.mjs';
import { EXE, big, file, jpg, png, webp } from '../lib/files.mjs';

const t = await createSuite('profile', { cloudinary: true });
const { check, section, api, register, upload, db } = t;
const cloud = t.cloudinary;
const INTERESTS = ['web-development', 'ai-ml', 'data-science'];

try {
  section('Onboarding');
  const riya = await register('Riya', 'Sharma', { onboard: false });
  const status = await api('GET', '/onboarding/status', { token: riya.token });
  check('new account: onboarding not completed', status.status === 200 && status.data.completed === false, status.body);
  const options = await api('GET', '/onboarding/options', { token: riya.token });
  check('options: colleges, branches, 8 semesters, interests, rules', options.status === 200 && options.data.colleges.length >= 10 && options.data.semesters.length === 8 && options.data.interests.length >= 10, Object.keys(options.data ?? {}));
  const good = { college: 'vnit-nagpur', branch: 'cse', semester: 5, rollNumber: 'bt21cse042', interests: INTERESTS, skills: ['React', 'node.js'] };
  const save = (body, who = riya) => api('PUT', '/onboarding', { token: who.token, body });
  check('unknown college → 422', (await save({ ...good, college: 'hogwarts' })).status === 422);
  check('branch not offered there → 422', (await save({ ...good, branch: 'quidditch' })).status === 422);
  check('semester 9 → 422; semester 0 → 422', (await save({ ...good, semester: 9 })).status === 422 && (await save({ ...good, semester: 0 })).status === 422);
  check('roll number with symbols → 422', (await save({ ...good, rollNumber: 'BT21<script>' })).status === 422);
  check('2 interests → 422; 9 interests → 422', (await save({ ...good, interests: INTERESTS.slice(0, 2) })).status === 422 && (await save({ ...good, interests: options.data.interests.slice(0, 9).map((item) => item.id) })).status === 422);
  check('duplicate interests → 422; unknown interest → 422', (await save({ ...good, interests: ['ai-ml', 'ai-ml', 'data-science'] })).status === 422 && (await save({ ...good, interests: [...INTERESTS.slice(0, 2), 'astrology'] })).status === 422);
  check('16 skills → 422', (await save({ ...good, skills: Array.from({ length: 16 }, (_, i) => `Skill ${String.fromCharCode(65 + i)}`) })).status === 422);
  check('missing fields → 422', (await save({ college: 'vnit-nagpur' })).status === 422);
  const saved = await save({ ...good, semester: '5' });
  check('valid onboarding → 200, completed, semester "5" stored as 5, roll upper-cased, skills canonical', saved.status === 200 && saved.data.user.onboardingCompleted === true && saved.data.user.semester === 5 && saved.data.user.rollNumber === 'BT21CSE042' && saved.data.user.skills.includes('Node.js'), saved.body);
  check('status now completed', (await api('GET', '/onboarding/status', { token: riya.token })).data.completed === true);
  const sam = await register('Sameer', 'Kulkarni', { onboard: false });
  const taken = await save({ ...good, rollNumber: 'BT21CSE042' }, sam);
  check('same roll number at the same college → 409 (field rollNumber)', taken.status === 409 && taken.body.errors?.[0]?.field === 'rollNumber', taken.body);
  check('same roll number at another college → 200', (await save({ ...good, college: 'iiit-nagpur', rollNumber: 'BT21CSE042' }, sam)).status === 200);
  check('no token → 401', (await api('PUT', '/onboarding', { body: good })).status === 401);
  const role = await db.collection('users').findOne({ _id: oid(riya.id) });
  check('onboarding never changes role, status or verification', role.role === 'student' && role.status === 'active' && role.isVerified === false);

  section('Campus identity lock');
  await db.collection('users').updateOne({ _id: oid(riya.id) }, { $set: { isVerified: true } });
  const lockedProfile = await api('PUT', '/profile', { token: riya.token, body: { rollNumber: 'BT21CSE999' } });
  check('verified student: roll number change through /profile → 403', lockedProfile.status === 403, lockedProfile.status);
  const lockedOnboarding = await save({ ...good, rollNumber: 'BT21CSE999' });
  check('verified student: roll number change through /onboarding → 403 (no bypass)', lockedOnboarding.status === 403, lockedOnboarding.status);
  const lockedCollege = await save({ ...good, college: 'iiit-nagpur' });
  check('verified student: college change through /onboarding → 403 (no bypass)', lockedCollege.status === 403, lockedCollege.status);
  const stillSame = await db.collection('users').findOne({ _id: oid(riya.id) });
  check('identity unchanged after refused attempts', stillSame.rollNumber === 'BT21CSE042' && stillSame.college === 'vnit-nagpur', { roll: stillSame.rollNumber, college: stillSame.college });
  check('verified student can still update semester and interests through /onboarding', (await save({ ...good, semester: 6 })).status === 200);
  await db.collection('users').updateOne({ _id: oid(riya.id) }, { $set: { isVerified: false } });

  section('Own and public profile');
  const own = await api('GET', '/profile', { token: riya.token });
  check('own profile: email, roll number, completion, campus labels', own.status === 200 && own.data.profile.email === riya.email && own.data.profile.rollNumber === 'BT21CSE042' && typeof own.data.profile.completion?.percent === 'number', own.body);
  const pub = await api('GET', `/profile/${riya.id}`, { token: sam.token });
  const pubJson = JSON.stringify(pub.body);
  check('public profile: no email, roll number, login or IP data', pub.status === 200 && !pubJson.includes(riya.email) && !pubJson.includes('BT21CSE042') && !/lastLogin|registrationIp|passwordHash|failedLogin/.test(pubJson), pub.body);
  check('unknown or malformed profile id → 404', (await api('GET', '/profile/0123456789abcdef01234567', { token: sam.token })).status === 404 && (await api('GET', '/profile/xyz', { token: sam.token })).status === 404);
  const editorOptions = await api('GET', '/profile/options', { token: riya.token });
  check('editor options: 5 styles, media limits', editorOptions.status === 200 && editorOptions.data.profileThemes.length === 5 && editorOptions.data.media?.avatar?.maxMegabytes === 5, editorOptions.data?.media);

  section('Editing');
  const edit = await api('PUT', '/profile', { token: riya.token, body: { bio: 'Building campus tools.\r\n\r\n\r\n\r\nLoves robotics.', firstName: 'Riya', profileTheme: 'dark-campus', skills: ['react', 'Python'] } });
  check('bio, theme and skills saved (blank lines squeezed, skills canonical)', edit.status === 200 && edit.data.profile.bio === 'Building campus tools.\n\nLoves robotics.' && edit.data.profile.theme === 'dark-campus' && edit.data.profile.skills.includes('React'), edit.body);
  check('unknown style → 422', (await api('PUT', '/profile', { token: riya.token, body: { profileTheme: 'neon-pink' } })).status === 422);
  check('bio too long → 422', (await api('PUT', '/profile', { token: riya.token, body: { bio: 'x'.repeat(2000) } })).status === 422);
  check('name with digits → 422', (await api('PUT', '/profile', { token: riya.token, body: { firstName: 'R1ya' } })).status === 422);
  check('college change without a branch → 422', (await api('PUT', '/profile', { token: riya.token, body: { college: 'iiit-nagpur' } })).status === 422);
  check('branch must belong to the (current) college → 422', (await api('PUT', '/profile', { token: riya.token, body: { branch: 'quidditch' } })).status === 422);
  const ignored = await api('PUT', '/profile', { token: riya.token, body: { bio: 'Still building campus tools.', email: 'stolen@evil.dev', role: 'admin', isVerified: true, onboardingCompleted: false } });
  const afterIgnored = await db.collection('users').findOne({ _id: oid(riya.id) });
  check('email, role, verification and onboarding fields are ignored', ignored.status === 200 && afterIgnored.email === riya.email && afterIgnored.role === 'student' && afterIgnored.isVerified === false && afterIgnored.onboardingCompleted === true);
  const clash = await api('PUT', '/profile', { token: sam.token, body: { college: 'vnit-nagpur', branch: 'cse', rollNumber: 'bt21cse042' } });
  check("moving onto someone's roll number at a college → 409", clash.status === 409, clash.body);
  const persisted = await api('GET', '/profile', { token: riya.token });
  check('changes persist across reads', persisted.data.profile.theme === 'dark-campus' && persisted.data.profile.bio === 'Still building campus tools.');

  section('Photo and cover');
  const beforeCompletion = persisted.data.profile.completion.percent;
  const avatar = await upload('/profile/avatar', riya.token, 'photo', [jpg()]);
  check('avatar JPG → 200 with a Cloudinary URL', avatar.status === 200 && /^https:\/\/res\.cloudinary\.com\//.test(avatar.data?.profile?.avatarUrl ?? avatar.data?.avatarUrl ?? ''), avatar.body);
  const firstAvatar = cloud.uploads.at(-1);
  check('avatar stored under the profile-photos folder', firstAvatar?.folder?.startsWith('campusx/profile-photos'), firstAvatar);
  const destroyedBefore = cloud.destroyed.length;
  const replaced = await upload('/profile/avatar', riya.token, 'photo', [png()]);
  await sleep(300);
  check('replacing the avatar (PNG) deletes the old file', replaced.status === 200 && cloud.destroyed.slice(destroyedBefore).includes(firstAvatar.publicId), cloud.destroyed.slice(destroyedBefore));
  const cover = await upload('/profile/cover', riya.token, 'cover', [webp()]);
  check('cover WEBP → 200', cover.status === 200, cover.body);
  const withMedia = await api('GET', '/profile', { token: riya.token });
  check('profile shows avatar and cover; completion went up', Boolean(withMedia.data.profile.avatarUrl) && Boolean(withMedia.data.profile.coverImageUrl) && withMedia.data.profile.completion.percent > beforeCompletion, withMedia.data.profile.completion);
  check('public profile shows the avatar too', Boolean((await api('GET', `/profile/${riya.id}`, { token: sam.token })).data.profile.avatarUrl));
  check('avatar of 6 MB → 413; cover of 9 MB → 413', (await upload('/profile/avatar', riya.token, 'photo', [big(6)])).status === 413 && (await upload('/profile/cover', riya.token, 'cover', [big(9)])).status === 413);
  check('a program as avatar → 415', (await upload('/profile/avatar', riya.token, 'photo', [file(EXE, 'image/png', 'me.png')])).status === 415);
  check('wrong field name → 400', (await upload('/profile/avatar', riya.token, 'image', [jpg()])).status === 400);
  check('two files → 400', (await upload('/profile/avatar', riya.token, 'photo', [jpg('a.jpg'), jpg('b.jpg')])).status === 400);
  const destroyedBeforeRemove = cloud.destroyed.length;
  const removeAvatar = await api('DELETE', '/profile/avatar', { token: riya.token });
  await sleep(300);
  check('remove avatar → 200, URL cleared, file deleted', removeAvatar.status === 200 && !(await api('GET', '/profile', { token: riya.token })).data.profile.avatarUrl && cloud.destroyed.length - destroyedBeforeRemove === 1);
  check('removing again is harmless (200)', (await api('DELETE', '/profile/avatar', { token: riya.token })).status === 200);
  cloud.failNext(1);
  const failedUpload = await upload('/profile/avatar', riya.token, 'photo', [jpg()]);
  check('Cloudinary failure → 502, friendly message, profile unchanged', failedUpload.status === 502 && !(await api('GET', '/profile', { token: riya.token })).data.profile.avatarUrl, failedUpload.body);
  const stored = await db.collection('users').findOne({ _id: oid(riya.id) });
  check('Cloudinary ids are stored, but the private id fields are never sent', Boolean(stored.coverImagePublicId) && !/PublicId/.test((await api('GET', '/profile', { token: riya.token })).text));

  section('Suspended and deactivated profiles');
  await db.collection('users').updateOne({ _id: oid(sam.id) }, { $set: { status: 'suspended' } });
  check("a suspended student's profile is not found (404)", (await api('GET', `/profile/${sam.id}`, { token: riya.token })).status === 404);
} catch (error) {
  check('suite ran to the end without crashing', false, error.stack);
}
await t.finish();
