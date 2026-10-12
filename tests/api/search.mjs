// Search & Discovery (Phase 12): every category, query edge cases (empty, short, long, symbols, regex,
// Unicode), filters, sorting, paging, suggestions, private search history, and that private, removed,
// restricted, flagged or out-of-scope content never comes back.
import { collect, createSuite, oid, sleep } from '../lib/harness.mjs';

const t = await createSuite('search');
const { check, section, api, register, db } = t;
const ids = (res) => new Set(collect(res.data, 'id'));
const search = (who, path) => api('GET', path, { token: who.token });

try {
  // Regression (Phase 17 QA): a fresh backend used to answer requests while its index builds were still
  // running, so the first searches on a new database failed with "text index required for $text query".
  section('Indexes are ready before the API answers');
  const missingTextIndexes = [];
  for (const name of ['posts', 'anonymousposts', 'projects', 'communities', 'opportunities', 'achievements']) {
    const indexes = await db.collection(name).indexes().catch(() => []);
    if (!indexes.some((index) => index.name === 'search_text')) missingTextIndexes.push(name);
  }
  check('all six "search_text" indexes exist as soon as /health answers', missingTextIndexes.length === 0, missingTextIndexes);
  check('the unique email index exists too', (await db.collection('users').indexes()).some((index) => index.key.email === 1 && index.unique));
  const early = await register('Eira', 'Early');
  const earlySearch = await search(early, '/search?q=robotics');
  check("a brand-new database's first search → 200", earlySearch.status === 200, earlySearch.body);

  section('Setup');
  const asha = await register('Asha', 'Rao', { skills: ['React', 'C++'] });
  const bilal = await register('Bilal', 'Khan', { branch: 'it' });
  const dev = await register('Dev', 'Patel', { college: 'iiit-nagpur' });
  const admin = await register('Ada', 'Admin');
  await db.collection('users').updateOne({ _id: oid(admin.id) }, { $set: { role: 'admin' } });
  await t.relogin(admin);
  const post = (who, content, visibility = 'public') => api('POST', '/posts', { token: who.token, body: { content, visibility } });
  const publicPost = (await post(asha, 'Quadcopter workshop this Saturday in the aero lab, bring laptops.')).data.post.id;
  const campusPost = (await post(asha, 'Quadcopter parts sale for VNIT students only, ping me soon.', 'campus')).data.post.id;
  const branchPost = (await post(asha, 'Quadcopter firmware notes for CSE batch are in the drive.', 'branch')).data.post.id;
  const removedPost = (await post(bilal, 'Quadcopter crash videos compilation from the last fest week.')).data.post.id;
  await api('PATCH', `/admin/content/post/${removedPost}`, { token: admin.token, body: { action: 'remove', reason: 'Removed during search QA', confirm: true } });
  const flaggedPost = (await post(bilal, 'Quadcopter racing league signups are open for all colleges now.')).data.post.id;
  await api('PATCH', `/admin/content/post/${flaggedPost}`, { token: admin.token, body: { action: 'flag', reason: 'Flagged during search QA' } });
  const privateProject = (await api('POST', '/projects', { token: asha.token, body: { title: 'Quadcopter Autopilot', shortDescription: 'Autopilot firmware for small drones.', description: 'PID tuning and waypoint navigation for small quadcopters built in the aero lab.', category: 'hardware', visibility: 'private' } })).data.project.id;
  const publicProject = (await api('POST', '/projects', { token: bilal.token, body: { title: 'Drone Delivery Simulator', shortDescription: 'Simulates campus drone deliveries.', description: 'A browser simulator of quadcopter deliveries between hostels and the library.', category: 'web' } })).data.project.id;
  const collegeOpp = (await t.must(api('POST', '/opportunities', { token: admin.token, body: { title: 'Quadcopter Design Challenge', shortDescription: 'Design a quadcopter for disaster relief.', description: 'Teams design and fly a quadcopter that can carry first aid kits across campus.', type: 'competition', organizer: 'VNIT Aero Club', mode: 'offline', location: 'Nagpur', applicationDeadline: new Date(Date.now() + 15 * 86400000).toISOString(), visibility: 'college', eligibleColleges: ['vnit-nagpur'], status: 'published' } }), 'college opportunity')).data.opportunity.id;
  const draftOpp = (await api('POST', '/opportunities', { token: admin.token, body: { title: 'Quadcopter Internship Draft', shortDescription: 'Unpublished internship draft.', description: 'This internship is still a draft and must never show up in any search results.', type: 'internship', organizer: 'Aero Labs', mode: 'online', applicationDeadline: new Date(Date.now() + 15 * 86400000).toISOString() } })).data.opportunity.id;
  const classCommunity = (await api('POST', '/communities', { token: asha.token, body: { name: 'Quadcopter Builders', description: 'CSE class group for the quadcopter build project.', type: 'student-created', visibility: 'branch', tags: ['drones'] } })).data.community.id;
  await sleep(800);
  check('setup content created', Boolean(publicPost && campusPost && branchPost && privateProject && publicProject && collegeOpp && draftOpp && classCommunity));

  section('Query rules');
  check('empty query → 422', (await search(bilal, '/search?q=')).status === 422);
  check('one character → 422', (await search(bilal, '/search?q=a')).status === 422);
  check('101 characters → 422', (await search(bilal, `/search?q=${'a'.repeat(101)}`)).status === 422);
  check('symbols only → 422', (await search(bilal, `/search?q=${encodeURIComponent('!!! ???')}`)).status === 422);
  for (const text of ['(a+)+$', '.*', '[quad', 'quad\\', '$where', 'C++', 'node.js', 'क्वाडकॉप्टर', "'; drop table users; --"]) {
    const res = await search(bilal, `/search?q=${encodeURIComponent(text)}`);
    check(`literal search for ${JSON.stringify(text)} answers safely (200 or 422, never 500)`, [200, 422].includes(res.status), res.status);
  }
  check('regex-like text never matches everything (".*" finds no posts)', !ids(await search(bilal, `/search/posts?q=${encodeURIComponent('.*')}`)).has(publicPost));

  section('Visibility and moderation');
  const forBilal = ids(await search(bilal, '/search/posts?q=quadcopter'));
  check('same college, other branch: public + campus posts, not branch posts', forBilal.has(publicPost) && forBilal.has(campusPost) && !forBilal.has(branchPost));
  const forDev = ids(await search(dev, '/search/posts?q=quadcopter'));
  check('other college: public posts only', forDev.has(publicPost) && !forDev.has(campusPost) && !forDev.has(branchPost));
  check('removed posts never appear', !forBilal.has(removedPost) && !ids(await search(bilal, '/search/posts?q=crash%20videos')).has(removedPost));
  check('flagged posts are kept out of search', !ids(await search(dev, '/search/posts?q=racing%20league')).has(flaggedPost));
  check('private projects never appear (not even to their owner\'s classmates)', !ids(await search(bilal, '/search/projects?q=autopilot')).has(privateProject));
  check('public projects appear', ids(await search(dev, '/search/projects?q=drone%20delivery')).has(publicProject));
  check('college-limited opportunity: hidden from another college, found by its own', !ids(await search(dev, '/search/opportunities?q=quadcopter')).has(collegeOpp) && ids(await search(bilal, '/search/opportunities?q=quadcopter')).has(collegeOpp));
  check('draft opportunities never appear', !ids(await search(bilal, '/search/opportunities?q=quadcopter%20internship')).has(draftOpp));
  check('a branch community is not found from another college', !ids(await search(dev, '/search/communities?q=quadcopter%20builders')).has(classCommunity));
  await db.collection('users').updateOne({ _id: oid(dev.id) }, { $set: { status: 'suspended' } });
  check('suspended students never appear in student search', !ids(await search(asha, '/search/students?q=Dev%20Patel')).has(dev.id));
  await db.collection('users').updateOne({ _id: oid(dev.id) }, { $set: { status: 'active' } });

  section('Students, filters, sorting, paging');
  check('students by name', ids(await search(bilal, '/search/students?q=asha')).has(asha.id));
  check('students by college alias ("VNIT") and branch short name ("CSE")', ids(await search(dev, '/search/students?q=vnit%20cse')).has(asha.id));
  check('students by skill with symbols ("C++")', ids(await search(dev, `/search/students?q=${encodeURIComponent('C++')}`)).has(asha.id));
  const students = await search(dev, '/search/students?q=asha');
  check('student results never include emails or roll numbers', !/@qa\.campusx\.dev|"rollNumber"/.test(students.text));
  check('college filter narrows students', !ids(await search(dev, '/search/students?q=asha&college=iiit-nagpur')).has(asha.id));
  check('unknown filter values → 422 (college, semester, sort)', (await search(dev, '/search/students?q=asha&college=hogwarts')).status === 422 && (await search(dev, '/search/students?q=asha&semester=12')).status === 422 && (await search(dev, '/search/posts?q=quad&sort=random')).status === 422);
  // Varied text from separate students: near-identical or rapid posts are (rightly) flagged and kept out of search.
  const topics = ['line follower tuning tips for beginners', 'sumo bot weight limits explained', 'soldering station booking rules', 'motor driver comparison notes', 'battery safety reminders before demos', 'arduino versus esp32 for our builds', 'sensor calibration walkthrough video', 'chassis printing queue in the maker lab', 'gear ratio cheat sheet for rovers', 'competition rulebook summary for juniors', 'pcb design session recording link', 'wheel encoder debugging story'];
  for (const [index, topic] of topics.entries()) {
    const author = await register(['Aarav', 'Bina', 'Chirag', 'Divya', 'Eshan', 'Fatima', 'Gauri', 'Harsh', 'Ira', 'Jay', 'Kavya', 'Laksh'][index], 'Builder');
    await post(author, `Robotics meetup: ${topic}, everyone from any college is welcome to join us.`);
  }
  await sleep(500);
  const page1 = await search(dev, '/search/posts?q=robotics%20meetup&limit=5&sort=newest');
  const page2 = await search(dev, '/search/posts?q=robotics%20meetup&limit=5&page=2&sort=newest');
  const resultIds = (res) => (res.data?.results ?? []).map((item) => item.id);
  const [firstIds, secondIds] = [resultIds(page1), resultIds(page2)];
  check('paging returns distinct results (5 + 5, no repeats)', firstIds.length === 5 && secondIds.length === 5 && !secondIds.some((id) => firstIds.includes(id)) && page1.data.pagination.total >= 12, [firstIds.length, secondIds.length, page1.data?.pagination]);
  const dates = (page1.data?.results ?? []).map((item) => new Date(item.createdAt).getTime());
  check('sort=newest orders by date', dates.every((value, index) => index === 0 || dates[index - 1] >= value));
  check('a limit above the maximum is lowered, not refused', (await search(dev, '/search/posts?q=robotics&limit=999')).status === 200);
  check('page 51 → 422', (await search(dev, '/search/posts?q=robotics&page=51')).status === 422);
  const global = await search(dev, '/search?q=quadcopter');
  check('global search answers every category at once', global.status === 200 && ['students', 'posts', 'projects', 'communities', 'opportunities', 'achievements'].every((key) => JSON.stringify(global.data).includes(key)), Object.keys(global.data ?? {}));

  section('Suggestions and history');
  const suggestions = await search(dev, '/search/suggestions?q=quad');
  check('suggestions answer and respect visibility', suggestions.status === 200 && !suggestions.text.includes(campusPost) && !suggestions.text.includes(privateProject));
  const history = await search(dev, '/search/history');
  check('searches are remembered privately', history.status === 200 && JSON.stringify(history.body).toLowerCase().includes('quadcopter'));
  const entries = collect(history.data, 'id');
  check("another student can't delete my history entry (404)", entries.length > 0 && (await api('DELETE', `/search/history/${entries[0]}`, { token: asha.token })).status === 404);
  check("my history never shows another student's searches", !JSON.stringify((await search(asha, '/search/history')).body).toLowerCase().includes('robotics meetup'));
  check('delete one entry', (await api('DELETE', `/search/history/${entries[0]}`, { token: dev.token })).status === 200);
  check('clear history', (await api('DELETE', '/search/history', { token: dev.token })).status === 200 && collect((await search(dev, '/search/history')).data, 'id').length === 0);
} catch (error) {
  check('suite ran to the end without crashing', false, error.stack);
}
await t.finish();
