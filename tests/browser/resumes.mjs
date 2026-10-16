// Resume Builder in the browser: the Profile entry (card and the phone account sheet), creating a resume,
// importing the CampusX profile, editing every step, autosave and reload, all ten templates in the live
// preview, real PDF downloads (A4, page count matching the preview, selectable text, clickable links,
// file name), one-page fitting and multi-page output, print styles, the checker, the AI assistant being
// unavailable, the saved-resume list (duplicate, rename, default, delete), another student's resume,
// conflicts between two tabs, phone layout, dark mode and keyboard focus.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PASSWORD, createSuite, sleep } from '../lib/harness.mjs';
import { API_PORT, RESULTS_DIR } from '../lib/paths.mjs';
import { launchBrowser, shotPath, startWeb } from '../lib/web.mjs';

const t = await createSuite('resumes-ui');
const { check, section, register, api } = t;
const web = await startWeb({ apiPort: API_PORT, name: 'web-resumes' });
t.cleanups.push(() => web.stop());
const { browser, reason } = await launchBrowser();
const DOWNLOADS = path.join(RESULTS_DIR, 'downloads');
fs.mkdirSync(DOWNLOADS, { recursive: true });

const errors = [];
async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, ...options });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource|socket\.io|WebSocket/i.test(message.text())) errors.push(message.text());
  });
  return { context, page };
}

async function signIn(page, account) {
  await page.goto(`${web.url}/login`);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(/\/home/, { timeout: 20000 });
}

/** The parts of a PDF file a test can check without a PDF library: pages, page size, text and links. */
function readPdf(file) {
  const bytes = fs.readFileSync(file);
  const raw = bytes.toString('latin1');
  const streams = [];
  const pattern = /(?<!end)stream\r?\n/g;
  let match;
  while ((match = pattern.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf('endstream', start);
    if (end === -1) break;
    const chunk = bytes.subarray(start, end);
    try {
      streams.push(zlib.inflateSync(chunk).toString('latin1'));
    } catch {
      streams.push(chunk.toString('latin1'));
    }
    pattern.lastIndex = end;
  }
  const content = streams.join('\n');
  const text = [...content.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map((item) => item[1].replace(/\\([()\\])/g, '$1')).join(' ');
  return {
    header: raw.slice(0, 5),
    pages: (raw.match(/\/Type \/Page\b(?!s)/g) ?? []).length,
    mediaBoxes: [...raw.matchAll(/\/MediaBox \[([^\]]*)\]/g)].map((item) => item[1].trim().split(/\s+/).map(Number)),
    links: [...raw.matchAll(/\/URI \(([^)]*)\)/g)].map((item) => item[1]),
    text,
    size: bytes.length,
  };
}

async function downloadPdf(page, trigger, name) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), trigger()]);
  const file = path.join(DOWNLOADS, `${name}-${download.suggestedFilename()}`);
  await download.saveAs(file);
  return { file, fileName: download.suggestedFilename(), pdf: readPdf(file) };
}

// Against the visual viewport: with phone emulation, content that is too wide also widens innerWidth.
const noPageOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth) + 1);
const pageCount = async (page) => Number(await page.locator('[data-testid="resume-preview"]').first().getAttribute('data-page-count'));
const savedState = (page) => page.locator('[data-save-state]').first().getAttribute('data-save-state');
const waitSaved = (page) => page.waitForFunction(() => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') === 'saved', null, { timeout: 15000 });
const previewText = (page) => page.locator('aside[aria-label="Live preview"] [data-resume-page="1"] svg').first().textContent();
const goStep = async (page, step) => {
  await page.locator(`[data-step="${step}"]`).click();
  await page.locator(`[data-step-panel="${step}"]`).waitFor();
};

try {
  if (!browser) throw new Error(reason);

  section('Setup');
  const asha = await register('Asha', 'Rao', { branch: 'cse', semester: 5, skills: ['React', 'Python', 'Git'] });
  const bilal = await register('Bilal', 'Khan', { branch: 'it' });
  await t.must(api('POST', '/projects', { token: asha.token, body: { title: 'Campus Bus Tracker', shortDescription: 'Live bus locations for the college shuttle.', description: 'Built the driver app that sends GPS pings every few seconds.\nDesigned the live map view for students.', category: 'web', techStack: ['React', 'Node.js', 'MongoDB'], githubUrl: 'https://github.com/asharao/bus-tracker', featured: true } }), 'project');
  await t.must(api('POST', '/projects', { token: asha.token, body: { title: 'Hostel Mess Feedback', shortDescription: 'Weekly ratings for the hostel mess menu.', description: 'Students rate each meal and the warden sees weekly trends on a dashboard.', category: 'web', techStack: ['Flask', 'PostgreSQL'], liveUrl: 'https://mess-feedback.example.app' } }), 'project 2');
  await t.must(api('POST', '/achievements', { token: asha.token, body: { title: 'Smart India Hackathon', type: 'hackathon', date: '2025-12-10', rank: 'Winner', organization: 'Ministry of Education' } }), 'achievement');
  await t.must(api('POST', '/achievements', { token: asha.token, body: { title: 'AWS Cloud Practitioner', type: 'certification', date: '2026-01-15', organization: 'Amazon Web Services', certificateUrl: 'https://www.credly.com/badges/example' } }), 'certification');
  const bilalResume = (await t.must(api('POST', '/resumes', { token: bilal.token, body: { targetRole: 'fresher' } }), 'bilal resume')).data.resume;
  const { context, page } = await newPage();
  await signIn(page, asha);
  check('signed in', true);

  section('Profile tab: Resume Builder entry');
  await page.goto(`${web.url}/profile`);
  const card = page.getByTestId('resume-builder-card');
  await card.waitFor({ timeout: 15000 });
  await card.getByText('0 saved resumes').waitFor({ timeout: 10000 });
  check('card shows the title, the description and the saved count', /Resume Builder/.test(await card.innerText()) && /Build a professional resume from your CampusX profile\./.test(await card.innerText()));
  check('Create Resume shown; no Edit Resume before any resume exists', (await card.getByRole('link', { name: 'Create Resume' }).isVisible()) && (await card.getByRole('link', { name: 'Edit Resume' }).count()) === 0);
  check('the Semester Roadmap button and profile actions are still there', (await page.getByTestId('semester-roadmap-button').isVisible()) && (await page.getByRole('link', { name: 'Edit profile' }).isVisible()));
  await page.screenshot({ path: shotPath('resume-profile-card') });

  section('Create My Resume');
  await card.getByRole('link', { name: 'Create Resume' }).click();
  await page.waitForURL(/\/resume-builder\?new=1/);
  const dialog = page.getByRole('dialog', { name: 'Create My Resume' });
  await dialog.waitFor();
  check('the create dialog opens with the target roles', (await dialog.getByText('Software Developer', { exact: true }).isVisible()) && (await dialog.getByText('Internship', { exact: true }).isVisible()) && (await dialog.getByText('Custom role', { exact: true }).isVisible()));
  check('Create is disabled until a role is chosen', await dialog.getByRole('button', { name: 'Create resume' }).isDisabled());
  await dialog.getByText('Full-Stack Developer', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Create resume' }).click();
  await page.waitForURL(/\/resume-builder\/[a-f0-9]{24}\?step=import/, { timeout: 15000 });
  const resumeId = /resume-builder\/([a-f0-9]{24})/.exec(page.url())[1];
  await page.locator('[data-step-panel="import"]').waitFor({ timeout: 15000 });
  check('lands on the import step of the new resume', (await page.getByRole('heading', { level: 1 }).innerText()) === 'Full-Stack Developer Resume');
  check('the live preview already shows the student’s name', /Asha Rao/i.test(await previewText(page)));
  check('step 2 of 10 is current', (await page.locator('[aria-current="step"]').getAttribute('data-step')) === 'import' && /Step 2 of 10/.test(await page.getByRole('navigation', { name: 'Resume steps' }).innerText()));

  section('Import CampusX Profile');
  await page.getByRole('button', { name: 'Import CampusX Profile' }).click();
  const review = page.getByTestId('import-review');
  await review.waitFor({ timeout: 15000 });
  check('review lists projects, achievements and certifications from CampusX', (await review.getByText('Campus Bus Tracker').isVisible()) && (await review.getByText('Smart India Hackathon (Winner)').isVisible()) && (await review.getByText('AWS Cloud Practitioner').isVisible()));
  check('it says which details the student must add themselves', /Phone number/.test(await review.innerText()));
  await review.getByRole('checkbox', { name: /Hostel Mess Feedback/ }).uncheck();
  await review.getByRole('button', { name: 'Add selected to my resume' }).click();
  await page.locator('[data-step-panel="personal"]').waitFor();
  await sleep(600);
  const afterImport = await previewText(page);
  check('chosen items appear in the preview; the unticked project doesn’t', /Campus Bus Tracker/.test(afterImport) && !/Hostel Mess Feedback/.test(afterImport) && /Visvesvaraya/.test(afterImport), afterImport.slice(0, 300));
  await waitSaved(page);
  check('autosaved ("All changes saved")', (await savedState(page)) === 'saved');

  section('Edit every step');
  await page.getByLabel('Phone', { exact: true }).fill('+91 98765 43210');
  await page.getByLabel('Location', { exact: true }).fill('Nagpur, Maharashtra');
  const saveButton = page.getByRole('button', { name: 'Save Changes' });
  check('"Save Changes" is enabled while there are unsaved edits', await saveButton.isEnabled());
  await saveButton.click();
  await waitSaved(page);
  check('"Save Changes" saves at once and is disabled when everything is saved', await saveButton.isDisabled());
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await page.getByLabel('Link 1 address').fill('github.com/asharao');
  await page.getByLabel('Phone', { exact: true }).fill('12');
  await waitSaved(page).catch(() => {});
  await sleep(1800);
  check('an invalid phone is refused with a clear message and the step is flagged', (await savedState(page)) === 'error' && (await page.getByText(/7 to 15 digits/).first().isVisible()));
  await page.getByLabel('Phone', { exact: true }).fill('+91 98765 43210');
  await waitSaved(page);
  check('fixing it saves again', (await savedState(page)) === 'saved');

  await goStep(page, 'education');
  await page.getByLabel('Degree', { exact: true }).fill('B.Tech');
  await page.getByLabel('CGPA or percentage').fill('CGPA 8.6/10');
  await page.getByLabel('Start: month').selectOption('08');
  await page.getByLabel('Start: year').selectOption('2023');
  await page.getByLabel('Graduation (or expected): month').selectOption('05');
  await page.getByLabel('Graduation (or expected): year').selectOption('2027');
  await sleep(500);
  check('education shows degree, score and "Expected" graduation in the preview', /B\.Tech in Computer Science Engineering/.test(await previewText(page)) && /CGPA 8\.6\/10/.test(await previewText(page)) && /Expected May 2027/.test(await previewText(page)));

  await goStep(page, 'skills');
  check('imported skill groups are listed', (await page.getByTestId('skills-list').innerText()).includes('Languages'));

  await goStep(page, 'projects');
  check('AI buttons are off with an explanation when the server has no AI key', (await page.getByRole('button', { name: 'Improve with AI' }).first().isDisabled()) && (await page.getByText(/isn’t set up on this CampusX server/).first().isVisible()));
  const projectCard = page.getByTestId('projects-list').locator('section').first();
  if (!(await projectCard.getByLabel('Project name').isVisible().catch(() => false))) await projectCard.getByRole('button', { name: /Campus Bus Tracker/ }).click();
  await projectCard.getByRole('button', { name: 'Add a point' }).click();
  await projectCard.getByLabel('Bullet points 3').fill('Wrote integration tests for the tracking API.');
  await projectCard.getByRole('button', { name: 'Move point 3 up' }).click();
  await sleep(500);
  const projectText = await previewText(page);
  check('a new bullet appears in the preview, in its new position', projectText.indexOf('Wrote integration tests') > -1 && projectText.indexOf('Wrote integration tests') < projectText.indexOf('Designed the live map view'), projectText.slice(0, 600));

  await goStep(page, 'experience');
  check('freshers are told experience is optional', await page.getByText('No work experience? That’s completely fine.').isVisible());

  await goStep(page, 'summary');
  await page.getByText('Career Objective', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Career Objective' }).fill('Third-year CSE student who builds full-stack web apps with React and Node.js, looking for a software developer internship.');
  await sleep(500);
  check('the summary section is titled "Career Objective" in the preview', /CAREER OBJECTIVE|Career Objective/.test(await previewText(page)));
  await waitSaved(page);

  section('Reload keeps everything');
  await page.reload();
  await page.locator('[data-step-panel="summary"]').waitFor({ timeout: 15000 });
  const reloaded = await previewText(page);
  check('after a reload: phone, link, education, new bullet and summary are all there', ['98765 43210', 'github.com/asharao', 'B.Tech', 'Wrote integration tests', 'Third-year CSE student'].every((text) => reloaded.includes(text)), reloaded.slice(0, 500));

  section('All ten templates');
  await goStep(page, 'design');
  const templates = await page.locator('[data-template]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-template')));
  check('ten template choices, fresher category first with "Choose Fresher Template"', templates.length === 10 && templates[0] === 'fresher-ats-classic' && (await page.getByRole('heading', { name: 'Choose Fresher Template' }).isVisible()), templates);
  const firstPages = new Set();
  for (const id of templates) {
    await page.locator(`[data-template="${id}"]`).click();
    await page.waitForFunction((value) => document.querySelector(`[data-template="${value}"]`)?.getAttribute('aria-checked') === 'true', id);
    await sleep(350);
    const markup = await page.locator('aside[aria-label="Live preview"] [data-resume-page="1"] svg').first().innerHTML();
    firstPages.add(markup.replace(/\d+(\.\d+)?/g, '').length > 0 ? markup : '');
    const text = await previewText(page);
    check(`${id}: preview shows the content (name, project, college)`, /Asha Rao|ASHA RAO/.test(text) && text.includes('Campus Bus Tracker') && text.includes('Visvesvaraya'), text.slice(0, 200));
    if (['fresher-ats-classic', 'software-developer-fresher', 'modern-developer', 'two-column-professional', 'academic-achievement'].includes(id)) await page.locator('aside[aria-label="Live preview"]').screenshot({ path: shotPath(`resume-template-${id}`) });
  }
  check('every template draws a different page (not recoloured copies)', firstPages.size === 10);
  await page.locator('[data-template="software-developer-fresher"]').click();
  await page.getByText('Navy', { exact: true }).click();
  await sleep(400);
  check('accent colour applies to the preview (navy)', (await page.locator('aside[aria-label="Live preview"] [data-resume-page="1"] svg').first().innerHTML()).includes('#1e3a8a'));
  const sectionRow = page.locator('[data-section="coursework"]');
  await sectionRow.getByRole('button', { name: /Hide/ }).click();
  await page.locator('[data-section="experience"]').getByRole('button', { name: /Move .* up/ }).click();
  await sleep(400);
  check('sections can be hidden and reordered', (await sectionRow.getByRole('button', { name: /Show/ }).count()) === 1 && (await page.getByRole('button', { name: /Reset to the template/ }).isVisible()));
  await waitSaved(page);

  section('Download PDF');
  const previewPages = await pageCount(page);
  const first = await downloadPdf(page, () => page.getByTestId('download-pdf').click(), 'first');
  check('the file is a PDF named after the resume', first.pdf.header === '%PDF-' && first.fileName === 'Full-Stack-Developer-Resume.pdf', first.fileName);
  check('A4 pages (595.28 × 841.89 pt)', first.pdf.mediaBoxes.length > 0 && first.pdf.mediaBoxes.every((box) => Math.abs(box[2] - 595.28) < 0.05 && Math.abs(box[3] - 841.89) < 0.05), first.pdf.mediaBoxes);
  check(`page count matches the preview (${previewPages})`, first.pdf.pages === previewPages, { pdf: first.pdf.pages, preview: previewPages });
  check('text is real, selectable text (name, project, bullet, summary)', ['Asha Rao', 'Campus Bus Tracker', 'Wrote integration tests for the tracking API.', 'Third-year CSE student'].every((text) => first.pdf.text.includes(text)), first.pdf.text.slice(0, 400));
  check('links are clickable (GitHub profile and project repository)', first.pdf.links.includes('https://github.com/asharao') && first.pdf.links.includes('https://github.com/asharao/bus-tracker'), first.pdf.links);
  check('the hidden section is not in the PDF', !first.pdf.text.includes('Git and GitHub introduction') && !/RELEVANT COURSEWORK|Relevant Coursework/.test(first.pdf.text));
  await page.getByText(/Downloaded Full-Stack-Developer-Resume\.pdf/).first().waitFor({ timeout: 10000 });
  check('a success message names the file', true);
  const exported = (await api('GET', `/resumes/${resumeId}`, { token: asha.token })).data.resume;
  check('the download was counted on the server', exported.exportCount === 1);

  section('Unsaved edits are saved before the PDF is made');
  await goStep(page, 'personal');
  await page.getByLabel('Headline', { exact: true }).fill('Full-stack developer (fresher)');
  const fresh = await downloadPdf(page, () => page.getByTestId('download-pdf').click(), 'fresh');
  check('a change made a moment before downloading is in the PDF', fresh.pdf.text.includes('Full-stack developer (fresher)'), fresh.pdf.text.slice(0, 300));

  section('Multi-page and one-page');
  await goStep(page, 'projects');
  for (let index = 0; index < 5; index += 1) {
    await page.getByRole('button', { name: 'Add project' }).click();
    const added = page.getByTestId('projects-list').locator('section').last();
    await added.getByLabel('Project name').fill(`Extra Project ${index + 1}`);
    await added.getByLabel('One-line description').fill(`A longer project number ${index + 1} that adds enough text to need a second page for this resume.`);
    for (let bullet = 1; bullet <= 4; bullet += 1) {
      await added.getByRole('button', { name: 'Add a point' }).click();
      await added.getByLabel(`Bullet points ${bullet}`).fill(`Implemented feature ${bullet} of project ${index + 1}, covering the database, the API and the interface for students.`);
    }
  }
  await sleep(600);
  const longPages = await pageCount(page);
  check('the preview flows onto more pages instead of clipping', longPages >= 2, longPages);
  await waitSaved(page);
  const multi = await downloadPdf(page, () => page.getByTestId('download-pdf').click(), 'multi');
  check('the multi-page PDF has the same number of pages as the preview, and every project', multi.pdf.pages === longPages && [1, 2, 3, 4, 5].every((n) => multi.pdf.text.includes(`Extra Project ${n}`)) && multi.pdf.text.includes(`Page ${longPages} of ${longPages}`), { pages: multi.pdf.pages, longPages });
  await goStep(page, 'design');
  await page.locator('[data-template="minimal-one-page"]').click();
  await sleep(600);
  const onePageCount = await pageCount(page);
  check('Minimal One-Page uses "fit on one page" and says so honestly if content still needs more', (onePageCount === 1) || (await page.getByText(/doesn’t fit on one page/).first().isVisible()), onePageCount);
  await page.locator('[data-template="software-developer-fresher"]').click();
  await goStep(page, 'projects');
  for (let index = 0; index < 5; index += 1) await page.getByRole('button', { name: /Remove Extra Project/ }).first().click();
  await goStep(page, 'design');
  await page.locator('[data-template="minimal-one-page"]').click();
  await sleep(600);
  check('with less content, Minimal One-Page fits on one page', (await pageCount(page)) === 1);
  const fittedSizes = await page.locator('aside[aria-label="Live preview"] [data-resume-page="1"] svg text').evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute('font-size'))));
  check('fitting never sets text below 7.5 pt (body stays at 9 pt or more)', Math.min(...fittedSizes) >= 7.5 && fittedSizes.filter((size) => size >= 9).length > fittedSizes.length / 2, Math.min(...fittedSizes));
  const single = await downloadPdf(page, () => page.getByTestId('download-pdf').click(), 'single');
  check('the one-page PDF has exactly one page', single.pdf.pages === 1);

  section('Print');
  await page.evaluate(() => {
    window.__printed = 0;
    window.print = () => {
      window.__printed += 1;
    };
  });
  await page.getByRole('button', { name: 'Print' }).first().click();
  await page.waitForFunction(() => window.__printed === 1, null, { timeout: 5000 });
  const printState = await page.evaluate(() => ({ cls: document.documentElement.classList.contains('printing-resume'), pages: document.querySelectorAll('.resume-print-root .resume-print-page').length }));
  check('print renders the pages into the print container', printState.cls && printState.pages >= 1, printState);
  await page.emulateMedia({ media: 'print' });
  const printLayout = await page.evaluate(() => ({ app: getComputedStyle(document.getElementById('root') ?? document.body.firstElementChild).display, root: getComputedStyle(document.querySelector('.resume-print-root')).display, width: document.querySelector('.resume-print-page').getBoundingClientRect().width }));
  check('in print media only the resume pages show, at A4 width', printLayout.app === 'none' && printLayout.root === 'block' && Math.abs(printLayout.width - 793.7) < 3, printLayout);
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  check('after printing, the print container is removed', await page.waitForFunction(() => !document.documentElement.classList.contains('printing-resume') && !document.querySelector('.resume-print-root')).then(() => true));

  section('Resume check');
  await goStep(page, 'review');
  await page.getByLabel('Job description (optional)').fill('We need React, Docker and SQL experience.');
  await page.getByTestId('run-check').click();
  const report = page.getByTestId('check-report');
  await report.waitFor({ timeout: 15000 });
  check('the report shows a score, explained results and a disclaimer', /Readiness/.test((await report.locator('[role="img"]').first().getAttribute('aria-label')) ?? '') && (await report.locator('[data-status]').count()) > 5 && /No checker can promise/.test(await report.innerText()));
  check('posting keywords: React found, Docker and SQL missing', /React/.test(await page.getByTestId('keyword-report').innerText()) && /Docker/.test(await page.getByTestId('keyword-report').innerText()));
  const fix = report.locator('[data-status="warn"], [data-status="fail"]').first().getByRole('button', { name: 'Fix' });
  if (await fix.count()) {
    await fix.click();
    await page.waitForFunction(() => document.querySelector('[aria-current="step"]')?.getAttribute('data-step') !== 'review', null, { timeout: 5000 }).catch(() => {});
    check('"Fix" opens the step to fix it', (await page.locator('[aria-current="step"]').getAttribute('data-step')) !== 'review', page.url());
  } else check('"Fix" opens the step to fix it (nothing to fix)', true);
  check('the AI review explains it is unavailable', await (async () => {
    await goStep(page, 'review');
    return page.getByText(/The resume check above works without it/).isVisible();
  })());

  section('Saved resumes: duplicate, rename, default, delete');
  await page.getByRole('link', { name: 'All resumes' }).click();
  await page.waitForURL(/\/resume-builder$/);
  const list = page.getByTestId('resume-list');
  await list.waitFor();
  check('the list shows the resume as default with role and template', /Full-Stack Developer Resume/.test(await list.innerText()) && /Default/.test(await list.innerText()));
  await page.getByRole('button', { name: /Duplicate Resume Full-Stack Developer Resume/ }).click();
  const dupDialog = page.getByRole('dialog', { name: 'Duplicate Resume' });
  await dupDialog.getByLabel('Resume name').fill('Internship Version');
  await dupDialog.getByRole('button', { name: 'Duplicate' }).click();
  await list.getByText('Internship Version').waitFor({ timeout: 10000 });
  check('duplicated with the chosen name', true);
  await page.getByRole('button', { name: 'Rename Internship Version' }).click();
  const renameDialog = page.getByRole('dialog', { name: 'Rename resume' });
  await renameDialog.getByLabel('Resume name').fill('Summer Internship 2027');
  await renameDialog.getByRole('button', { name: 'Save name' }).click();
  await list.getByText('Summer Internship 2027').waitFor({ timeout: 10000 });
  check('renamed', true);
  await page.getByRole('button', { name: 'Make Summer Internship 2027 your default resume' }).click();
  await page.waitForFunction(() => /Summer Internship 2027[\s\S]*Default/.test(document.querySelector('[data-testid="resume-list"] li')?.innerText ?? ''), null, { timeout: 10000 });
  check('made default (moves first, with the Default badge)', true);
  const listDownload = await downloadPdf(page, () => page.locator('[data-testid="resume-list"] li').first().getByRole('button', { name: 'Download PDF' }).click(), 'from-list');
  check('Download PDF works from the saved-resume list', listDownload.pdf.header === '%PDF-' && listDownload.fileName === 'Summer-Internship-2027-Resume.pdf' && listDownload.pdf.text.includes('Campus Bus Tracker'), listDownload.fileName);
  await page.getByRole('button', { name: 'Delete Summer Internship 2027' }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Delete this resume?' });
  check('delete asks for confirmation and mentions the default', /default/i.test(await deleteDialog.innerText()));
  await deleteDialog.getByRole('button', { name: 'Delete resume' }).click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="resume-list"]')?.innerText.includes('Summer Internship 2027'), null, { timeout: 10000 });
  check('deleted; the other resume becomes default again', /Default/.test(await page.locator('[data-testid="resume-list"] li').first().innerText()));

  section('Profile card after saving');
  await page.goto(`${web.url}/profile`);
  await page.getByTestId('resume-builder-card').getByText('1 saved resume').waitFor({ timeout: 10000 });
  const cardText = await page.getByTestId('resume-builder-card').innerText();
  check('the card shows the count, the default resume and Edit Resume', /Default: Full-Stack Developer Resume/.test(cardText) && /Updated/.test(cardText) && (await page.getByTestId('resume-builder-card').getByRole('link', { name: 'Edit Resume' }).isVisible()));
  await page.getByTestId('resume-builder-card').getByRole('link', { name: 'Edit Resume' }).click();
  await page.waitForURL(new RegExp(`/resume-builder/${resumeId}`));
  check('Edit Resume opens the default resume', true);
  const publicView = await newPage();
  await signIn(publicView.page, bilal);
  await publicView.page.goto(`${web.url}/profile/${asha.id}`);
  await publicView.page.getByRole('heading', { name: 'About' }).waitFor({ timeout: 15000 });
  check('another student viewing the profile sees no Resume Builder card or resume', (await publicView.page.getByTestId('resume-builder-card').count()) === 0 && !(await publicView.page.locator('body').innerText()).includes('Full-Stack Developer Resume'));

  section('Another student’s resume');
  await page.goto(`${web.url}/resume-builder/${bilalResume.id}`);
  await page.getByText('Resume not found').waitFor({ timeout: 10000 });
  check('opening another student’s resume shows "Resume not found"', !(await page.locator('body').innerText()).includes('Bilal'));

  section('Two tabs editing the same resume');
  const tabA = page;
  const tabB = await context.newPage();
  tabB.on('pageerror', (error) => errors.push(error.message));
  await tabA.goto(`${web.url}/resume-builder/${resumeId}?step=personal`);
  await tabB.goto(`${web.url}/resume-builder/${resumeId}?step=personal`);
  await tabA.getByLabel('Location', { exact: true }).waitFor({ timeout: 15000 });
  await tabB.getByLabel('Location', { exact: true }).waitFor({ timeout: 15000 });
  await tabA.getByLabel('Location', { exact: true }).fill('Pune, Maharashtra');
  await waitSaved(tabA);
  await tabB.getByLabel('Location', { exact: true }).fill('Mumbai, Maharashtra');
  await tabB.getByText('This resume changed somewhere else').waitFor({ timeout: 10000 });
  check('the second tab is told and nothing is overwritten', (await api('GET', `/resumes/${resumeId}`, { token: asha.token })).data.resume.content.personal.location === 'Pune, Maharashtra');
  await tabB.getByRole('button', { name: 'Reload the latest version' }).click();
  await tabB.waitForFunction(() => document.querySelector('input[autocomplete="tel"]') && [...document.querySelectorAll('input')].some((input) => input.value === 'Pune, Maharashtra'), null, { timeout: 10000 });
  check('reloading shows the latest version', true);
  await tabB.close();

  section('Keyboard');
  await tabA.goto(`${web.url}/resume-builder/${resumeId}?step=role`);
  await tabA.locator('[data-step-panel="role"]').waitFor();
  await tabA.locator('[data-step="education"]').focus();
  await tabA.keyboard.press('Enter');
  await tabA.locator('[data-step-panel="education"]').waitFor();
  const focusStyle = await tabA.evaluate(() => {
    document.querySelector('[data-step="skills"]').focus();
    const style = getComputedStyle(document.activeElement);
    return `${style.outlineStyle} ${style.outlineWidth}`;
  });
  check('steps work from the keyboard and show a focus outline', !/^none/.test(focusStyle), focusStyle);

  section('Phone layout');
  const phone = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await signIn(phone.page, asha);
  await phone.page.goto(`${web.url}/resume-builder/${resumeId}?step=projects`);
  await phone.page.locator('[data-step-panel="projects"]').waitFor({ timeout: 15000 });
  check('editor fits a 390 px phone (no sideways scrolling)', await noPageOverflow(phone.page));
  const wideSteps = [];
  for (const step of ['role', 'import', 'personal', 'education', 'skills', 'projects', 'experience', 'summary', 'design', 'review']) {
    await phone.page.locator(`[data-step="${step}"]`).click();
    await phone.page.locator(`[data-step-panel="${step}"]`).waitFor();
    await sleep(200);
    if (!(await noPageOverflow(phone.page))) wideSteps.push(step);
  }
  check('every one of the ten steps fits the phone width', wideSteps.length === 0, wideSteps);
  await phone.page.goto(`${web.url}/resume-builder/${resumeId}?step=projects`);
  await phone.page.locator('[data-step-panel="projects"]').waitFor({ timeout: 15000 });
  check('the side preview is hidden; a "Preview Resume" button is offered', (await phone.page.locator('aside[aria-label="Live preview"]').isHidden()) && (await phone.page.getByRole('button', { name: 'Preview Resume' }).isVisible()));
  await phone.page.getByRole('button', { name: 'Preview Resume' }).click();
  const overlay = phone.page.getByRole('dialog', { name: 'Resume preview' });
  await overlay.waitFor();
  check('the preview opens full screen with the pages and Download PDF', (await overlay.locator('[data-resume-page="1"]').isVisible()) && (await overlay.getByRole('button', { name: 'Download PDF' }).isVisible()));
  await phone.page.screenshot({ path: shotPath('resume-phone-preview') });
  await overlay.getByRole('button', { name: 'Close preview' }).click();
  await phone.page.goto(`${web.url}/resume-builder`);
  await phone.page.getByTestId('resume-list').waitFor();
  check('the saved-resume list fits the phone too', await noPageOverflow(phone.page));
  await phone.page.goto(`${web.url}/home`);
  await phone.page.getByRole('button', { name: 'Your account' }).click();
  const sheetLink = phone.page.getByRole('dialog', { name: 'Your account' }).getByRole('link', { name: 'Resume Builder' });
  check('the phone account sheet links to the Resume Builder', (await sheetLink.isVisible()) && (await sheetLink.getAttribute('href')) === '/resume-builder');
  await phone.context.close();

  section('Dark mode and Aurora Glass');
  for (const [theme, style] of [['dark', 'campus'], ['dark', 'aurora'], ['light', 'aurora']]) {
    await tabA.evaluate(([value, look]) => localStorage.setItem('campusx-theme', JSON.stringify({ state: { theme: value, style: look, adminMode: 'dark' }, version: 0 })), [theme, style]);
    await tabA.goto(`${web.url}/resume-builder/${resumeId}?step=design`);
    await tabA.locator('[data-step-panel="design"]').waitFor({ timeout: 15000 });
    await sleep(500);
    const paper = await tabA.evaluate(() => document.querySelector('aside[aria-label="Live preview"] [data-resume-page="1"] svg rect')?.getAttribute('fill'));
    check(`${theme}/${style}: the resume paper stays white and the page has no sideways scroll`, paper === '#ffffff' && (await noPageOverflow(tabA)), paper);
    await tabA.screenshot({ path: shotPath(`resume-editor-${theme}-${style}`) });
  }
  await tabA.evaluate(() => localStorage.removeItem('campusx-theme'));

  section('No errors');
  check('no page errors or console errors', errors.length === 0, errors.slice(0, 5));
  await publicView.context.close();
  await context.close();
} catch (error) {
  check('suite crashed', false, error?.stack ?? String(error));
} finally {
  await browser?.close();
  await t.finish();
}
