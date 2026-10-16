// Resume Builder API: access and ownership on every route, the CampusX profile import (only the student's
// own, non-removed records; nothing invented; nothing written), create/list/get/update/duplicate/default/
// export/delete, revision conflicts, validation and the request-size budget, the resume checker, the AI
// assistant through a stand-in Gemini server (guard rails, quota and outage errors, rate limit), the assistant switched
// off, privacy (no resume data in profiles or search) and account deletion.
import { PASSWORD, clientFor, collect, createSuite, eventually, oid } from '../lib/harness.mjs';
import { startFakeGemini } from '../lib/fake-gemini.mjs';
import { API_PORT } from '../lib/paths.mjs';
import { startBackend } from '../lib/stack.mjs';

const ai = await startFakeGemini(API_PORT + 9);
const t = await createSuite('resumes', { env: ai.env });
t.cleanups.push(() => ai.stop());
const { check, section, api, register, db } = t;

const project = (overrides = {}) => ({ title: 'Campus Bus Tracker', shortDescription: 'Live bus locations for the college shuttle.', description: 'A web app that shows where the college shuttle is.\nBuilt the driver app that sends GPS pings every few seconds.\nDesigned the map view for students.', category: 'web', techStack: ['React', 'Node.js', 'MongoDB'], githubUrl: 'https://github.com/asharao/bus-tracker', ...overrides });
const resumes = (who) => api('GET', '/resumes', { token: who.token });
const create = (who, body) => api('POST', '/resumes', { token: who.token, body });
const get = (who, id) => api('GET', `/resumes/${id}`, { token: who.token });
const patch = (who, id, body) => api('PATCH', `/resumes/${id}`, { token: who.token, body });
const fieldsOf = (res) => (res.body?.errors ?? []).map((error) => error.field);
const countKeys = (value) => (Array.isArray(value) ? value.reduce((sum, item) => sum + countKeys(item), 0) : value && typeof value === 'object' ? Object.keys(value).length + Object.values(value).reduce((sum, item) => sum + countKeys(item), 0) : 0);

try {
  section('Setup');
  const asha = await register('Asha', 'Rao', { branch: 'cse', semester: 5, skills: ['React', 'Python', 'Git'] });
  const bilal = await register('Bilal', 'Khan', { branch: 'it', semester: 7 });
  const fresh = await register('Fara', 'Shaikh', { onboard: false });
  await t.must(api('PUT', '/profile', { token: asha.token, body: { bio: 'Third-year CSE student who enjoys building web apps for the campus.' } }), 'bio');
  const p1 = (await t.must(api('POST', '/projects', { token: asha.token, body: project({ featured: true, status: 'completed' }) }), 'project 1')).data.project;
  const p2 = (await t.must(api('POST', '/projects', { token: asha.token, body: project({ title: 'Hostel Mess Feedback', shortDescription: 'Weekly ratings for the hostel mess menu.', description: 'Students rate each meal and the warden sees weekly trends on a dashboard.', techStack: ['Flask', 'PostgreSQL'], githubUrl: '', liveUrl: 'https://mess-feedback.example.app', status: 'in-progress', visibility: 'private' }) }), 'project 2')).data.project;
  const removed = (await t.must(api('POST', '/projects', { token: asha.token, body: project({ title: 'Old Quiz App', shortDescription: 'A quiz app removed by moderation.', description: 'This project was taken down by a moderator for testing the importer.', techStack: ['Vue'] }) }), 'project 3')).data.project;
  await db.collection('projects').updateOne({ _id: oid(removed.id) }, { $set: { moderationStatus: 'removed', deletedAt: new Date() } });
  const team = (await t.must(api('POST', '/projects', { token: bilal.token, body: project({ title: 'Placement Portal', shortDescription: 'Tracks campus placement drives.', description: 'A portal for the placement cell to post drives and for students to register.', techStack: ['Django'], teamMembers: [{ user: asha.id, role: 'designer' }] }) }), 'team project')).data.project;
  await t.must(api('POST', `/projects/${team.id}/team/accept`, { token: asha.token }), 'accept invite');
  await t.must(api('POST', '/projects', { token: bilal.token, body: project({ title: 'Bilal Secret Robot', shortDescription: 'A robot only Bilal built.', description: 'Private project of another student that must never be imported.', techStack: ['Arduino'], visibility: 'private' }) }), 'bilal project');
  const ach = (body) => api('POST', '/achievements', { token: asha.token, body });
  await t.must(ach({ title: 'Smart India Hackathon', type: 'hackathon', date: '2025-12-10', rank: 'Winner', eventName: 'SIH 2025', organization: 'Ministry of Education', description: 'Built an attendance app with five teammates.' }), 'hackathon');
  await t.must(ach({ title: 'AWS Cloud Practitioner', type: 'certification', date: '2026-01-15', organization: 'Amazon Web Services', certificateUrl: 'https://www.credly.com/badges/example' }), 'certification');
  await t.must(ach({ title: 'Web Development Intern', type: 'internship', date: '2025-06-01', organization: 'Orange Tech Labs', description: 'Built dashboard widgets in React.\nFixed accessibility issues reported by QA.', skills: ['Tailwind CSS'] }), 'internship');
  await t.must(ach({ title: 'Docker Workshop', type: 'workshop', date: '2025-09-01', organization: 'GDG Nagpur' }), 'workshop');
  const rejected = (await t.must(ach({ title: 'Unverifiable Award', type: 'award', date: '2025-03-01' }), 'rejected')).data.achievement;
  await db.collection('achievements').updateOne({ _id: oid(rejected.id) }, { $set: { verificationStatus: 'rejected' } });
  const takenDown = (await t.must(ach({ title: 'Removed Competition', type: 'competition', date: '2025-04-01' }), 'removed')).data.achievement;
  await db.collection('achievements').updateOne({ _id: oid(takenDown.id) }, { $set: { moderationStatus: 'removed', deletedAt: new Date() } });
  await api('POST', '/achievements', { token: bilal.token, body: { title: 'Bilal Only Award', type: 'award', date: '2025-05-05' } });
  await t.must(api('PATCH', '/roadmap/milestones/s1-git-github/complete', { token: asha.token }), 'roadmap milestone');
  check('setup done', true);

  section('Access');
  const routes = [['GET', '/resumes'], ['GET', '/resumes/options'], ['GET', '/resumes/import'], ['POST', '/resumes', { targetRole: 'fresher' }], ['GET', `/resumes/${p1.id}`], ['PATCH', `/resumes/${p1.id}`, { revision: 0, name: 'x' }], ['DELETE', `/resumes/${p1.id}`], ['POST', `/resumes/${p1.id}/duplicate`], ['POST', `/resumes/${p1.id}/default`], ['POST', `/resumes/${p1.id}/export`], ['POST', `/resumes/${p1.id}/analyze`], ['POST', `/resumes/${p1.id}/ai`, { task: 'review' }]];
  const anonymous = await Promise.all(routes.map(([method, path, body]) => api(method, path, { body })));
  check('every resume route without a token → 401', anonymous.every((res) => res.status === 401), anonymous.map((res) => res.status));
  const notReady = await resumes(fresh);
  check('not onboarded → 409 with a clear message', notReady.status === 409 && /profile/i.test(notReady.body?.message), notReady.body);
  const optionsRes = await api('GET', '/resumes/options', { token: asha.token });
  const options = optionsRes.data;
  check('options: 10 templates, 6 fresher & internship templates, 9 target roles', options.templates.length === 10 && options.templates.filter((item) => item.category === 'fresher').length === 6 && options.targetRoles.length === 9, options.templates.map((item) => item.id));
  check('the six required fresher templates exist', ['fresher-ats-classic', 'modern-graduate', 'software-developer-fresher', 'internship-applicant', 'minimal-one-page', 'academic-achievement'].every((id) => options.templates.some((item) => item.id === id && item.category === 'fresher')));
  check('general templates kept: ATS Classic, Modern Developer, Minimal Professional, Two-Column Professional', ['ats-classic', 'modern-developer', 'minimal-professional', 'two-column-professional'].every((id) => options.templates.some((item) => item.id === id && item.category === 'general')));
  check('AI reported available (stand-in configured), and the API key never appears in any response', options.ai.available === true && !optionsRes.text.includes('sk-ant-test-key'), options.ai);
  check('responses are never cached (Cache-Control: no-store)', optionsRes.headers.get('cache-control') === 'no-store');

  section('Import My CampusX Profile');
  const imp = await api('GET', '/resumes/import', { token: asha.token });
  const draft = imp.data?.draft;
  check('import → 200 with a draft', imp.status === 200 && Boolean(draft), imp.body);
  check('personal: own name and account email; phone, location and links left empty (not stored on CampusX)', draft.personal.fullName === 'Asha Rao' && draft.personal.email === asha.email && draft.personal.phone === '' && draft.personal.links.length === 0, draft.personal);
  check('education: college name, branch and city; degree, dates and CGPA left empty', draft.education.length === 1 && /VNIT/.test(draft.education[0].institution) && draft.education[0].field === 'Computer Science Engineering' && draft.education[0].location === 'Nagpur' && !draft.education[0].degree && !draft.education[0].startDate && !draft.education[0].endDate && !draft.education[0].score, draft.education);
  const skillGroups = Object.fromEntries(draft.skills.map((group) => [group.label, group.items]));
  check('skills grouped: Python → Languages, React → Frameworks, Git → Tools, project MongoDB → Databases, achievement Tailwind CSS kept', skillGroups.Languages?.includes('Python') && skillGroups['Frameworks & Libraries']?.includes('React') && skillGroups['Tools & Platforms']?.includes('Git') && skillGroups.Databases?.includes('MongoDB') && Object.values(skillGroups).flat().includes('Tailwind CSS'), skillGroups);
  check('no duplicate skills across groups', new Set(Object.values(skillGroups).flat().map((item) => item.toLowerCase())).size === Object.values(skillGroups).flat().length);
  const names = draft.projects.map((item) => item.name);
  check('projects: own (incl. private) and the accepted team project; never the removed one or another student’s', names.includes('Campus Bus Tracker') && names.includes('Hostel Mess Feedback') && names.includes('Placement Portal') && !names.includes('Old Quiz App') && !names.includes('Bilal Secret Robot'), names);
  const bus = draft.projects.find((item) => item.name === 'Campus Bus Tracker');
  check('featured project first; description lines become bullet points; links and tech kept', draft.projects[0].name === 'Campus Bus Tracker' && bus.bullets.length === 3 && bus.github === 'https://github.com/asharao/bus-tracker' && bus.tech.includes('React') && bus.summary === 'Live bus locations for the college shuttle.', bus);
  check('team project shows the student’s own team role; owner gets none', draft.projects.find((item) => item.name === 'Placement Portal').role === 'Designer' && bus.role === '');
  check('in-progress project ends "present"; no invented start dates', draft.projects.find((item) => item.name === 'Hostel Mess Feedback').endDate === 'present' && draft.projects.every((item) => item.startDate === ''));
  check('hackathon with its rank; organisation and event joined', draft.achievements.some((item) => item.title === 'Smart India Hackathon (Winner)' && /SIH 2025/.test(item.organization) && item.date === '2025-12'), draft.achievements);
  check('certification and workshop become certifications (with the credential link)', draft.certifications.some((item) => item.name === 'AWS Cloud Practitioner' && item.url === 'https://www.credly.com/badges/example' && item.date === '2026-01') && draft.certifications.some((item) => item.name === 'Docker Workshop'), draft.certifications);
  check('internship becomes experience with bullet points', draft.experience.length === 1 && draft.experience[0].role === 'Web Development Intern' && draft.experience[0].organization === 'Orange Tech Labs' && draft.experience[0].bullets.length === 2, draft.experience);
  check('rejected and removed achievements are left out; the rejected one is reported as skipped', !JSON.stringify(draft).includes('Unverifiable Award') && !JSON.stringify(draft).includes('Removed Competition') && imp.data.skipped.some((item) => item.count === 1), imp.data.skipped);
  check('completed roadmap learning becomes coursework', draft.coursework.includes('Git and GitHub introduction'), draft.coursework);
  check('bio offered as the summary; CampusX-missing details listed', draft.summary.startsWith('Third-year CSE student') && imp.data.missing.includes('Phone number') && imp.data.missing.some((item) => /CGPA/.test(item)), imp.data.missing);
  check('nothing about another student (no Bilal, no other student ids)', !/bilal/i.test(imp.text) && !collect(imp.data, 'id').includes(bilal.id) && !imp.text.includes(bilal.email));
  check('import writes nothing', (await db.collection('resumes').countDocuments()) === 0);

  section('Create');
  const c1 = await create(asha, { targetRole: 'full-stack-developer', owner: bilal.id, isDefault: false, revision: 99, exportCount: 50 });
  const r1 = c1.data?.resume;
  check('create → 201 with a role-based name and the role’s template', c1.status === 201 && r1.name === 'Full-Stack Developer Resume' && r1.template === 'software-developer-fresher' && r1.targetRoleLabel === 'Full-Stack Developer', c1.body);
  check('first resume is the default; owner/isDefault/revision/exportCount from the client ignored', r1.isDefault === true && r1.revision === 0 && r1.exportCount === 0 && (await db.collection('resumes').findOne({ _id: oid(r1.id) })).owner.toString() === asha.id);
  check('starts with the student’s own name and email, nothing else invented', r1.content.personal.fullName === 'Asha Rao' && r1.content.personal.email === asha.email && r1.content.projects.length === 0 && r1.content.summary === '');
  check('sections follow the template order; settings are the template defaults', r1.sections.order[1] === 'skills' && r1.sections.order.length === 11 && r1.settings.accent === 'blue' && r1.settings.pageMode === 'multi', r1.sections);
  const c2 = await create(asha, { targetRole: 'full-stack-developer' });
  check('same default name again → "(2)" added, not the default', c2.status === 201 && c2.data.resume.name === 'Full-Stack Developer Resume (2)' && c2.data.resume.isDefault === false, c2.data?.resume?.name);
  check('an explicit name already used (any case) → 409', (await create(asha, { targetRole: 'fresher', name: 'full-stack developer resume' })).status === 409);
  const c3 = await create(asha, { targetRole: 'custom', customRole: 'Embedded Systems Intern', template: 'minimal-one-page' });
  check('custom role names the resume; a chosen template is used with its own defaults (one page)', c3.status === 201 && c3.data.resume.name === 'Embedded Systems Intern Resume' && c3.data.resume.template === 'minimal-one-page' && c3.data.resume.settings.pageMode === 'one', c3.data?.resume);
  check('bad role / template / missing role → 422', (await create(asha, { targetRole: 'astronaut' })).status === 422 && (await create(asha, { targetRole: 'fresher', template: 'fancy' })).status === 422 && (await create(asha, {})).status === 422);
  check('a name of 81 characters → 422', (await create(asha, { targetRole: 'fresher', name: 'x'.repeat(81) })).status === 422);

  section('List and get');
  const list = await resumes(asha);
  check('list: three resumes, default first, no content in the list', list.status === 200 && list.data.resumes.length === 3 && list.data.resumes[0].id === r1.id && list.data.resumes.every((item) => !('content' in item)), list.data?.resumes);
  check('summary: count, max 20, default resume and last update', list.data.summary.count === 3 && list.data.summary.max === 20 && list.data.summary.defaultResume.id === r1.id && Boolean(list.data.summary.lastUpdatedAt), list.data.summary);
  check('another student sees an empty list', (await resumes(bilal)).data.resumes.length === 0);
  check('own resume → 200', (await get(asha, r1.id)).status === 200);
  const foreign = await get(bilal, r1.id);
  check('another student’s resume → 404, same as one that doesn’t exist', foreign.status === 404 && (await get(bilal, '0123456789abcdef01234567')).status === 404 && !foreign.text.includes('Asha'), foreign.body);
  check('malformed id → 422', (await get(asha, 'not-an-id')).status === 422);

  section('Update, revisions and validation');
  const content = { ...r1.content, personal: { ...r1.content.personal, phone: '+91 98765 43210', location: 'Nagpur, Maharashtra', links: [{ label: 'GitHub', url: 'github.com/asharao' }] }, summary: draft.summary, education: draft.education.map((item) => ({ ...item, degree: 'B.Tech', startDate: '2023-08', endDate: '2027-05', score: 'CGPA 8.6/10' })), skills: draft.skills, projects: draft.projects.slice(0, 3), experience: draft.experience, achievements: draft.achievements.map(({ kind, ...item }) => item), certifications: draft.certifications, coursework: draft.coursework };
  const u1 = await patch(asha, r1.id, { revision: 0, content, markImported: true });
  check('update → 200, revision 1, import time recorded', u1.status === 200 && u1.data.resume.revision === 1 && Boolean(u1.data.resume.importedAt), u1.body);
  check('links without a scheme are stored as https', u1.data.resume.content.personal.links[0].url === 'https://github.com/asharao');
  check('stale revision → 409 (nothing overwritten)', (await patch(asha, r1.id, { revision: 0, name: 'Overwrite' })).status === 409 && (await get(asha, r1.id)).data.resume.name === 'Full-Stack Developer Resume');
  check('missing revision → 422; nothing to update → 422', (await patch(asha, r1.id, { name: 'x' })).status === 422 && (await patch(asha, r1.id, { revision: 1 })).status === 422);
  check('another student can’t update it (404) and it is unchanged', (await patch(bilal, r1.id, { revision: 1, name: 'Hacked' })).status === 404 && (await get(asha, r1.id)).data.resume.name === 'Full-Stack Developer Resume');
  const bad = await patch(asha, r1.id, { revision: 1, content: { ...content, personal: { ...content.personal, email: 'not-an-email', phone: '12', links: [{ label: 'x', url: 'javascript:alert(1)' }] }, education: [{ institution: 'X', startDate: '2024-13', endDate: 'someday' }], projects: [{ name: 'P', live: 'http://localhost', github: 'ftp://files.example.com', bullets: ['x'.repeat(401)] }] } });
  check('bad email, phone, link scheme, dates and an over-long bullet → 422 naming each field', bad.status === 422 && ['content.personal.email', 'content.personal.phone', 'content.personal.links[0].url', 'content.education[0].startDate', 'content.education[0].endDate', 'content.projects[0].github', 'content.projects[0].bullets[0]'].every((field) => fieldsOf(bad).includes(field)), fieldsOf(bad));
  check('nine projects → 422 (limit 8)', (await patch(asha, r1.id, { revision: 1, content: { ...content, projects: Array.from({ length: 9 }, (_, index) => ({ name: `P${index}` })) } })).status === 422);
  const sneaky = await patch(asha, r1.id, { revision: 1, content: { ...content, hacked: true, personal: { ...content.personal, ssn: '123' }, projects: [{ ...content.projects[0], secret: 'x', $where: '1' }] }, owner: bilal.id, isDefault: false, exportCount: 9 });
  const stored = await db.collection('resumes').findOne({ _id: oid(r1.id) });
  check('unknown fields are dropped, owner/default/export count can’t be set', sneaky.status === 200 && !('hacked' in stored.content) && !('ssn' in stored.content.personal) && !('secret' in stored.content.projects[0]) && !('$where' in stored.content.projects[0]) && stored.owner.toString() === asha.id && stored.isDefault === true && stored.exportCount === 0, sneaky.body);
  let revision = sneaky.data.resume.revision;
  const rename = await patch(asha, r1.id, { revision, name: 'Full-Stack Developer Resume (2)' });
  check('renaming to a name already used → 409', rename.status === 409 && fieldsOf(rename).includes('name'));
  const switched = await patch(asha, r1.id, { revision, template: 'academic-achievement', settings: { accent: 'green' } });
  check('template switch keeps content; an accent the template doesn’t offer falls back to its default; its section order applies', switched.status === 200 && switched.data.resume.content.projects.length === 1 && switched.data.resume.settings.accent === 'navy' && switched.data.resume.sections.order[2] === 'achievements', switched.data?.resume?.settings);
  revision = switched.data.resume.revision;
  const custom = await patch(asha, r1.id, { revision, sections: { order: ['projects', 'education'], hidden: ['coursework', 'nonsense'], titles: { summary: 'Career Objective', bogus: 'x' }, customOrder: true } });
  check('section order completed with the missing sections, unknown keys dropped, titles kept', custom.status === 200 && custom.data.resume.sections.order.slice(0, 2).join() === 'projects,education' && custom.data.resume.sections.order.length === 11 && custom.data.resume.sections.hidden.join() === 'coursework' && custom.data.resume.sections.titles.summary === 'Career Objective' && !('bogus' in custom.data.resume.sections.titles), custom.data?.resume?.sections);
  revision = custom.data.resume.revision;
  const kept = await patch(asha, r1.id, { revision, template: 'modern-graduate' });
  check('a student’s own section order survives a template switch', kept.status === 200 && kept.data.resume.sections.order[0] === 'projects' && kept.data.resume.settings.accent === 'navy', kept.data?.resume);
  revision = kept.data.resume.revision;

  section('Largest possible resume fits the request limits');
  const L = options.limits;
  const fill = (n, length) => 'Word '.repeat(Math.ceil(n / 5)).slice(0, length ?? n).trim();
  const max = {
    personal: { fullName: fill(40), headline: fill(100), email: 'asha.rao@example.com', phone: '+91 98765 43210', location: fill(60), links: Array.from({ length: L.links.max }, (_, i) => ({ label: `Link${i}`, url: `https://example.com/${i}` })) },
    summary: fill(1000, 1000),
    education: Array.from({ length: L.education.max }, (_, i) => ({ id: `e${i}`, institution: fill(150), degree: 'B.Tech', field: fill(60), location: 'Nagpur', startDate: '2023-08', endDate: '2027-05', score: 'CGPA 8.6/10', coursework: Array.from({ length: L.education.coursework }, (_, j) => `Course ${i}-${j}`), details: Array.from({ length: L.education.details }, () => fill(200, 200)) })),
    skills: Array.from({ length: L.skills.groups }, (_, i) => ({ id: `s${i}`, label: `Group ${i}`, items: Array.from({ length: L.skills.items }, (_, j) => `Skill ${i}-${j}`) })),
    projects: Array.from({ length: L.projects.max }, (_, i) => ({ id: `p${i}`, name: `Project ${i}`, role: 'Lead', tech: Array.from({ length: L.projects.tech }, (_, j) => `Tech ${i}-${j}`), startDate: '2024-01', endDate: 'present', github: `https://github.com/a/p${i}`, live: `https://p${i}.example.app`, summary: fill(300, 300), bullets: Array.from({ length: L.projects.bullets }, () => fill(250, 250)), source: '' })),
    experience: Array.from({ length: L.experience.max }, (_, i) => ({ id: `x${i}`, role: 'Intern', organization: `Org ${i}`, location: 'Remote', startDate: '2025-01', endDate: '2025-06', bullets: Array.from({ length: L.experience.bullets }, () => fill(250, 250)), source: '' })),
    achievements: Array.from({ length: L.achievements.max }, (_, i) => ({ id: `a${i}`, title: `Award ${i}`, organization: 'Org', date: '2025-01', description: fill(300, 300), source: '' })),
    certifications: Array.from({ length: L.certifications.max }, (_, i) => ({ id: `c${i}`, name: `Cert ${i}`, issuer: 'Issuer', date: '2025-01', url: `https://cert.example.com/${i}`, source: '' })),
    volunteering: Array.from({ length: L.volunteering.max }, (_, i) => ({ id: `v${i}`, role: 'Volunteer', organization: `Club ${i}`, startDate: '2024-01', endDate: 'present', bullets: Array.from({ length: L.volunteering.bullets }, () => fill(200, 200)) })),
    coursework: Array.from({ length: L.coursework.max }, (_, i) => `Coursework ${i}`),
    custom: Array.from({ length: L.custom.sections }, (_, i) => ({ id: `k${i}`, title: `Custom ${i}`, items: Array.from({ length: L.custom.items }, (_, j) => ({ id: `k${i}${j}`, title: `Item ${j}`, subtitle: 'Sub', date: '2025', bullets: Array.from({ length: L.custom.bullets }, () => fill(150, 150)) })) })),
  };
  const fullBody = { revision, name: 'Full-Stack Developer Resume', targetRole: 'full-stack-developer', customRole: '', template: 'modern-graduate', settings: kept.data.resume.settings, sections: kept.data.resume.sections, content: max };
  const keys = countKeys(fullBody);
  const bytes = Buffer.byteLength(JSON.stringify(fullBody));
  const big = await patch(asha, r1.id, fullBody);
  check(`every list at its limit with every field filled is accepted (${keys} keys of 500, ${Math.round(bytes / 1024)} KB of 100)`, big.status === 200 && keys < 500 && bytes < 100 * 1024, { status: big.status, keys, bytes, body: big.body?.message });
  revision = big.data?.resume?.revision ?? revision;
  revision = (await t.must(patch(asha, r1.id, { revision, content }), 'restore content')).data.resume.revision;

  section('Duplicate, default and export');
  const d1 = await api('POST', `/resumes/${r1.id}/duplicate`, { token: asha.token });
  check('duplicate → 201 "Copy of …", same content, not default, revision 0', d1.status === 201 && d1.data.resume.name === 'Copy of Full-Stack Developer Resume' && d1.data.resume.isDefault === false && d1.data.resume.revision === 0 && d1.data.resume.content.projects.length === 3 && d1.data.resume.id !== r1.id, d1.body);
  check('duplicate again → "(2)"; with a name → that name', (await api('POST', `/resumes/${r1.id}/duplicate`, { token: asha.token })).data.resume.name === 'Copy of Full-Stack Developer Resume (2)' && (await api('POST', `/resumes/${r1.id}/duplicate`, { token: asha.token, body: { name: 'Internship Version' } })).data.resume.name === 'Internship Version');
  check('another student can’t duplicate it (404)', (await api('POST', `/resumes/${r1.id}/duplicate`, { token: bilal.token })).status === 404 && (await resumes(bilal)).data.resumes.length === 0);
  const def = await api('POST', `/resumes/${d1.data.resume.id}/default`, { token: asha.token });
  const defaults = await db.collection('resumes').find({ owner: oid(asha.id), isDefault: true }).toArray();
  check('set default → only that resume is default; its revision is unchanged', def.status === 200 && def.data.resume.isDefault && defaults.length === 1 && defaults[0]._id.toString() === d1.data.resume.id && def.data.resume.revision === 0);
  check('another student can’t change the default (404)', (await api('POST', `/resumes/${r1.id}/default`, { token: bilal.token })).status === 404);
  const ex = await api('POST', `/resumes/${r1.id}/export`, { token: asha.token });
  check('export → the saved resume, download counted, revision unchanged', ex.status === 200 && ex.data.resume.exportCount === 1 && Boolean(ex.data.resume.lastExportedAt) && ex.data.resume.revision === revision && ex.data.resume.content.projects.length === 3, ex.data?.resume);
  check('another student can’t export it (404) and the count stays 1', (await api('POST', `/resumes/${r1.id}/export`, { token: bilal.token })).status === 404 && (await db.collection('resumes').findOne({ _id: oid(r1.id) })).exportCount === 1);

  section('Limit of 20 resumes');
  let made = (await resumes(asha)).data.resumes.length;
  while (made < 20) {
    await t.must(create(asha, { targetRole: 'internship' }), 'filler');
    made += 1;
  }
  check('the 21st resume → 409 with a clear message', (await create(asha, { targetRole: 'internship' })).status === 409 && (await api('POST', `/resumes/${r1.id}/duplicate`, { token: asha.token })).status === 409);

  section('Delete');
  check('another student can’t delete it (404); it still exists', (await api('DELETE', `/resumes/${r1.id}`, { token: bilal.token })).status === 404 && (await get(asha, r1.id)).status === 200);
  await t.must(patch(asha, r1.id, { revision, name: 'Most Recent Edit' }), 'touch r1');
  const del = await api('DELETE', `/resumes/${d1.data.resume.id}`, { token: asha.token });
  check('deleting the default → the most recently edited resume becomes default', del.status === 200 && del.data.newDefaultId === r1.id && (await get(asha, r1.id)).data.resume.isDefault === true, del.body);
  check('deleted resume is gone (404), deleting again → 404', (await get(asha, d1.data.resume.id)).status === 404 && (await api('DELETE', `/resumes/${d1.data.resume.id}`, { token: asha.token })).status === 404);
  for (const item of (await resumes(asha)).data.resumes.filter((entry) => entry.name.startsWith('Internship Resume'))) await api('DELETE', `/resumes/${item.id}`, { token: asha.token });

  section('Resume check');
  const weak = (await t.must(create(asha, { targetRole: 'fresher', name: 'Weak Resume' }), 'weak')).data.resume;
  const weakContent = { ...weak.content, personal: { ...weak.content.personal, phone: '', links: [{ label: 'Demo', url: 'http://127.0.0.1:3000' }, { label: 'LinkedIn', url: 'https://linkedin.com/company/x' }] }, summary: 'I am a hardworking team player.', projects: [{ id: 'w1', name: 'Todo App', tech: [], startDate: '2025-06', endDate: '2024-01', bullets: ['Responsible for the backend and various features etc.', 'Built login', 'Built the list view for tasks with filters', 'Built the settings page with themes and options'] }, { id: 'w2', name: '', bullets: ['Made the thing work for the whole class'] }, { id: 'w4', name: 'Empty Project', bullets: [] }], experience: [{ id: 'w3', role: 'Intern', organization: 'Org', startDate: '2025-01', endDate: '' }] };
  check('a bare localhost link is refused when saving (422)', fieldsOf(await patch(asha, weak.id, { revision: 0, content: { ...weakContent, personal: { ...weakContent.personal, links: [{ label: 'Demo', url: 'http://localhost:3000' }] } } })).includes('content.personal.links[0].url'));
  const weakSaved = await t.must(patch(asha, weak.id, { revision: 0, content: weakContent }), 'weak content');
  const report = (await api('POST', `/resumes/${weak.id}/analyze`, { token: asha.token, body: { pageCount: 3, jobDescription: 'We want React, Docker, Kubernetes and SQL. Python, Go, R are a plus. Go beyond your comfort zone!' } })).data.report;
  const byId = (prefix) => report.checks.filter((item) => item.id.startsWith(prefix));
  check('a score 0–100 with a label, counts and a disclaimer that promises nothing', report.score >= 0 && report.score <= 100 && ['Needs work', 'Good start', 'Strong'].includes(report.label) && /No checker can promise/.test(report.disclaimer) && /Only add skills/.test(report.disclaimer), report);
  check('missing education → fail', byId('education').some((item) => item.status === 'fail'));
  check('missing phone → warn', byId('phone')[0]?.status === 'warn');
  check('local link → fail; http and a LinkedIn company page → warnings', report.checks.some((item) => item.status === 'fail' && /local or private/.test(item.detail)) && report.checks.some((item) => /http:\/\//.test(item.detail) || /https:\/\//.test(item.detail)) && report.checks.some((item) => /linkedin\.com\/in/.test(item.detail)), report.checks.filter((item) => item.category === 'contact'));
  check('reversed project dates → fail; open-ended internship → warn', byId('order-w1')[0]?.status === 'fail' && byId('open-w3')[0]?.status === 'warn');
  check('nameless project → fail; empty description → warn', byId('project-name-w2')[0]?.status === 'fail' && byId('project-detail-w4')[0]?.status === 'warn');
  check('vague phrases flagged with a reason', ['weak-responsible for', 'weak-various', 'weak-etc', 'weak-hardworking', 'weak-team player'].every((id) => byId(id)[0]?.status === 'warn'), report.checks.filter((item) => item.category === 'wording').map((item) => item.id));
  check('three bullets starting with "Built" → warn; a two-word bullet → unclear', byId('repeat-start-built')[0]?.status === 'warn' && byId('short-bullets')[0]?.status === 'warn');
  check('three pages for a fresher → warn', byId('pages')[0]?.status === 'warn');
  check('keywords: React matched; Docker, Kubernetes, SQL, Python, Go, R missing (Go as a list item only)', report.keywords.matched.length === 0 && ['React', 'Docker', 'Kubernetes', 'SQL', 'Python', 'Go', 'R'].every((term) => report.keywords.missing.includes(term)) && report.keywords.found === 7, report.keywords);
  check('the keyword advice says to add skills only where true', /Never add a skill you don’t have/.test(byId('keywords')[0]?.detail));
  check('every non-passing check links to a step to fix it', report.checks.filter((item) => item.status === 'fail' || item.status === 'warn').every((item) => !item.target || item.target.step), report.checks.filter((item) => !item.target));
  const strong = (await api('POST', `/resumes/${r1.id}/analyze`, { token: asha.token, body: { pageCount: 1, jobDescription: 'React, Node.js and MongoDB experience; Git.' } })).data.report;
  check('a complete resume scores higher with no failures and matches the posting’s skills', strong.score > report.score && strong.counts.fail === 0 && ['React', 'Node.js', 'MongoDB', 'Git'].every((term) => strong.keywords.matched.includes(term)), { score: strong.score, fails: strong.checks.filter((item) => item.status === 'fail') });
  check('another student can’t check it (404); an over-long description → 422', (await api('POST', `/resumes/${r1.id}/analyze`, { token: bilal.token })).status === 404 && (await api('POST', `/resumes/${r1.id}/analyze`, { token: asha.token, body: { jobDescription: 'x'.repeat(8001) } })).status === 422);
  check('report never guarantees anything', !/guarantee(d|s)? (an?|you)/i.test(JSON.stringify(report.checks)));
  void weakSaved;

  section('AI assistant (stand-in Gemini server)');
  const assist = (who, id, body) => api('POST', `/resumes/${id}/ai`, { token: who.token, body });
  const promptOf = (request) => request.body.contents?.[0]?.parts?.map((part) => part.text).join('') ?? '';
  ai.requests.length = 0;
  const s1 = await assist(asha, r1.id, { task: 'summary', text: 'I like coding.', summaryTitle: 'Career Objective' });
  const sent = ai.requests.at(-1);
  check('summary suggestion → 200 with text, notes and no warnings; provider reported as gemini', s1.status === 200 && s1.data.result.suggestion.length > 10 && s1.data.result.notes.length === 1 && s1.data.result.warnings.length === 0 && s1.data.result.provider === 'gemini' && s1.data.result.model === 'gemini-3.5-flash-lite', s1.body);
  check('request: generateContent on the default model, the key in x-goog-api-key, JSON output with the task schema', sent.model === 'gemini-3.5-flash-lite' && sent.headers['x-goog-api-key'] === 'test-gemini-key-not-real-0123456789' && sent.body.generationConfig?.responseMimeType === 'application/json' && sent.body.generationConfig?.responseJsonSchema?.required?.includes('suggestion') && sent.body.generationConfig?.maxOutputTokens > 0, { url: sent.url, generationConfig: sent.body.generationConfig });
  check('the key is never put in the URL', !sent.url.includes('test-gemini-key'));
  const prompt = promptOf(sent);
  check('the prompt carries resume facts but never the name, email, phone or links', /Campus Bus Tracker/.test(prompt) && /career objective/.test(prompt) && !prompt.includes('Asha') && !prompt.includes(asha.email) && !prompt.includes('98765') && !prompt.includes('github.com/asharao'), prompt.slice(0, 300));
  check('the system instruction forbids inventing facts', /Never invent or estimate numbers/.test(sent.body.systemInstruction?.parts?.map((part) => part.text).join('') ?? ''), sent.body.systemInstruction);
  ai.answers.summary = { suggestion: 'Built 3 projects with React and Kubernetes, cutting load times by 40%.', notes: [] };
  const invented = (await assist(asha, r1.id, { task: 'summary', text: '' })).data.result;
  check('numbers and technologies not in the resume are flagged (3, 40%, Kubernetes)', invented.warnings.some((item) => /“3”/.test(item) && /“40%”/.test(item)) && invented.warnings.some((item) => /Kubernetes/.test(item)) && !invented.warnings.some((item) => /React/.test(item)), invented.warnings);
  const projectId = (await get(asha, r1.id)).data.resume.content.projects[0].id;
  const b1 = await assist(asha, r1.id, { task: 'bullets', text: 'made a bus app with react', itemId: projectId });
  check('bullets → 200 with bullet points; the prompt names the project and its stack', b1.status === 200 && b1.data.result.bullets.length === 2 && /project "Campus Bus Tracker"/.test(promptOf(ai.requests.at(-1))), b1.body);
  ai.answers.bullets = { bullets: Array.from({ length: 9 }, (_, i) => `Point ${i}`), notes: [] };
  check('more than six bullets are capped at six', (await assist(asha, r1.id, { task: 'bullets', text: 'x y z', itemId: projectId })).data.result.bullets.length === 6);
  check('grammar and bullets need text → 422; keywords need a job description → 422', (await assist(asha, r1.id, { task: 'grammar', text: '  ' })).status === 422 && (await assist(asha, r1.id, { task: 'bullets' })).status === 422 && (await assist(asha, r1.id, { task: 'keywords' })).status === 422);
  check('unknown task → 422; text over 3000 characters → 422', (await assist(asha, r1.id, { task: 'write-my-life' })).status === 422 && (await assist(asha, r1.id, { task: 'grammar', text: 'x'.repeat(3001) })).status === 422);
  const kw = await assist(asha, r1.id, { task: 'keywords', jobDescription: 'React and Docker' });
  check('keywords (job description comparison) → terms with in-resume flags and suggestions', kw.status === 200 && kw.data.result.keywords.length === 2 && kw.data.result.keywords.some((item) => item.term === 'Docker' && item.inResume === false) && /React and Docker/.test(promptOf(ai.requests.at(-1))));
  const rv = await assist(asha, r1.id, { task: 'review' });
  check('review → section-by-section suggestions', rv.status === 200 && rv.data.result.suggestions[0].section === 'Projects');
  check('another student can’t use the assistant on it (404, no request to the provider)', await (async () => {
    const before = ai.requests.length;
    const res = await assist(bilal, r1.id, { task: 'review' });
    return res.status === 404 && ai.requests.length === before;
  })());
  const failing = async (mode) => {
    ai.mode = mode;
    const before = ai.requests.length;
    const res = await assist(asha, r1.id, { task: 'grammar', text: 'Some text here.' });
    return { res, calls: ai.requests.length - before };
  };
  const safety = await failing('safety');
  check('Gemini stops for safety → 422 with a friendly message', safety.res.status === 422 && /couldn’t help/.test(safety.res.body.message), safety.res.body);
  const blocked = await failing('blocked');
  check('a blocked prompt → 422 with the same friendly message', blocked.res.status === 422 && /couldn’t help/.test(blocked.res.body.message), blocked.res.body);
  const perMinute = await failing('quota-minute');
  check('free-tier per-minute quota → 429 “wait a minute”, not retried (one call)', perMinute.res.status === 429 && /wait a minute/.test(perMinute.res.body.message) && perMinute.calls === 1, { body: perMinute.res.body, calls: perMinute.calls });
  const perDay = await failing('quota-day');
  check('free-tier daily quota → 429 “try again tomorrow”, not retried', perDay.res.status === 429 && /tomorrow/.test(perDay.res.body.message) && perDay.calls === 1, { body: perDay.res.body, calls: perDay.calls });
  check('quota messages say the rest of the Resume Builder still works and leak no provider details', /still works/.test(perDay.res.body.message) && !/RESOURCE_EXHAUSTED|quotaId|FreeTier/.test(perMinute.res.text + perDay.res.text));
  const garbage = await failing('garbage');
  check('an unreadable answer → 503', garbage.res.status === 503);
  const badKey = await failing('unauthorized');
  check('an invalid key → 503 “isn’t set up correctly”, without provider details', badKey.res.status === 503 && /set up correctly/.test(badKey.res.body.message) && !/API_KEY_INVALID|API key not valid/.test(badKey.res.text), badKey.res.body);
  const missingModel = await failing('not-found');
  check('an unknown model → 503 naming RESUME_AI_MODEL', missingModel.res.status === 503 && /RESUME_AI_MODEL/.test(missingModel.res.body.message), missingModel.res.body);
  const outage = await failing('error');
  check('a Gemini server error → 503 “busy”, after exactly one retry', outage.res.status === 503 && /busy/.test(outage.res.body.message) && outage.calls === 2, { body: outage.res.body, calls: outage.calls });
  ai.mode = 'ok';
  check('the backend log never contains the prompt or the API key', !t.stack.log().includes('test-gemini-key') && !t.stack.log().includes('made a bus app with react'));
  let limited = null;
  for (let i = 0; i < 35 && !limited; i += 1) {
    const res = await assist(asha, r1.id, { task: 'grammar', text: 'Rate limit check.' });
    if (res.status === 429 && /a lot this hour/.test(res.body?.message ?? '')) limited = i;
  }
  check('our own per-student limit still applies (429 “a lot this hour” within 30 requests)', limited !== null, limited);
  check('other resume routes still work after the AI limit', (await get(asha, r1.id)).status === 200);

  section('AI switched off (no key)');
  const plain = await startBackend({ name: 'resumes-no-ai', dbName: `${t.stack.dbName}_noai`, port: API_PORT + 4 });
  t.cleanups.push(() => plain.stop());

  const other = clientFor(plain.base);
  const zara = await other.register('Zara', 'Ali');
  const zOptions = (await other.api('GET', '/resumes/options', { token: zara.token })).data;
  check('options say the assistant is unavailable, with a reason', zOptions.ai.available === false && /isn’t set up/.test(zOptions.ai.reason), zOptions.ai);
  const zr = (await other.api('POST', '/resumes', { token: zara.token, body: { targetRole: 'internship' } })).data.resume;
  const off = await other.api('POST', `/resumes/${zr.id}/ai`, { token: zara.token, body: { task: 'review' } });
  check('AI request → 503 explaining it isn’t set up; everything else works', off.status === 503 && /isn’t set up/.test(off.body.message) && (await other.api('POST', `/resumes/${zr.id}/analyze`, { token: zara.token })).status === 200 && (await other.api('POST', `/resumes/${zr.id}/export`, { token: zara.token })).status === 200, off.body);

  section('Privacy');
  const publicProfile = await api('GET', `/profile/${asha.id}`, { token: bilal.token });
  check('another student’s view of the profile has no resume data', publicProfile.status === 200 && !/resume/i.test(publicProfile.text) && !publicProfile.text.includes('Most Recent Edit'));
  const ownProfile = await api('GET', '/profile', { token: asha.token });
  check('the student’s own profile API carries no resume content either', ownProfile.status === 200 && !ownProfile.text.includes('Most Recent Edit'));
  const search = await api('GET', '/search?q=Most%20Recent%20Edit', { token: bilal.token });
  const found = [...collect(search.data, 'name'), ...collect(search.data, 'title')].filter((value) => typeof value === 'string' && value.includes('Most Recent Edit'));
  check('resumes are not searchable (no result carries the resume name)', search.status === 200 && found.length === 0, found);

  section('Account deletion removes resumes');
  const kiran = await register('Kiran', 'Das');
  await t.must(create(kiran, { targetRole: 'fresher' }), 'kiran resume');
  await t.must(create(kiran, { targetRole: 'internship' }), 'kiran resume 2');
  check('two resumes before deletion', (await db.collection('resumes').countDocuments({ owner: oid(kiran.id) })) === 2);
  const gone = await api('DELETE', '/auth/account', { token: kiran.token, body: { password: PASSWORD, confirmation: 'DELETE' } });
  check('account deleted', [200, 202].includes(gone.status), gone.body);
  check('their resumes are deleted too', Boolean(await eventually(async () => (await db.collection('resumes').countDocuments({ owner: oid(kiran.id) })) === 0, { timeout: 8000 })));
  check('other students’ resumes are untouched', (await db.collection('resumes').countDocuments({ owner: oid(asha.id) })) > 0);
} catch (error) {
  check('suite crashed', false, error?.stack ?? String(error));
} finally {
  await t.finish();
}
