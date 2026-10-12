// Semester Roadmap in the browser: the Profile button, the page, all eight semesters (click and keyboard),
// semester transitions (normal and reduced motion), milestone completion that waits for the server, no
// duplicate requests, semester completion, goal change, refresh and re-login persistence, safe links,
// phone layout, dark mode, and the rest of the profile page still working.
import { PASSWORD, createSuite, sleep } from '../lib/harness.mjs';
import { API_PORT } from '../lib/paths.mjs';
import { launchBrowser, shotPath, startWeb } from '../lib/web.mjs';

const t = await createSuite('roadmap-ui');
const { check, section, register, api } = t;
const web = await startWeb({ apiPort: API_PORT, name: 'web-roadmap' });
t.cleanups.push(() => web.stop());
const { browser, reason } = await launchBrowser();

const errors = [];
async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, ...options });
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

const selectedTab = (page) => page.locator('[role="tab"][aria-selected="true"]').getAttribute('id');
const panelSemester = (page) => page.locator('[data-semester-panel]').first().getAttribute('data-semester-panel');
/** Clicks a semester tab and measures how long (ms) until its panel replaces the old one. */
const switchTime = (page, semester) =>
  page.evaluate(
    (target) =>
      new Promise((resolve) => {
        const started = performance.now();
        document.getElementById(`roadmap-tab-${target}`).click();
        const poll = () => {
          if (document.querySelector('[data-semester-panel]')?.getAttribute('data-semester-panel') === String(target)) resolve(performance.now() - started);
          else if (performance.now() - started > 3000) resolve(Infinity);
          else requestAnimationFrame(poll);
        };
        poll();
      }),
    semester,
  );
const noPageOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

try {
  if (!browser) throw new Error(reason);

  section('Setup');
  const asha = await register('Asha', 'Rao', { branch: 'cse', semester: 5, interests: ['web-development', 'ai-ml', 'hackathons'], skills: ['React'] });
  const { context, page } = await newPage();
  await signIn(page, asha);

  section('Profile page: Semester Roadmap button');
  await page.goto(`${web.url}/profile`);
  const button = page.getByTestId('semester-roadmap-button');
  await button.waitFor({ timeout: 15000 });
  check('the button is visible with its label and description', (await button.isVisible()) && /Semester Roadmap/.test(await button.innerText()) && /semester-by-semester path to skills, projects and placements/i.test(await button.innerText()));
  check('it links to /profile/roadmap', (await button.getAttribute('href')) === '/profile/roadmap');
  await page.getByText('Semester 5 of 8').first().waitFor({ timeout: 10000 });
  check('it shows real progress once loaded (Semester 5 of 8, 0% complete)', /0% complete/.test(await button.innerText()));
  check('existing profile actions still there (Edit profile, Change photo, Campus Journey, About)', (await page.getByRole('link', { name: 'Edit profile' }).isVisible()) && (await page.getByRole('button', { name: 'Change photo' }).isVisible()) && (await page.getByRole('heading', { name: 'Campus Journey' }).isVisible()) && (await page.getByRole('heading', { name: 'About' }).isVisible()));
  await sleep(800);
  await page.screenshot({ path: shotPath('roadmap-profile-light') });

  section('Opening the roadmap');
  await button.click();
  await page.waitForURL(/\/profile\/roadmap/);
  await page.getByRole('heading', { level: 1, name: /Your journey to Full Stack Development/ }).waitFor({ timeout: 15000 });
  check('hero: goal, semester 5 of 8, branch and tagline', (await page.getByText('Semester 5 of 8').first().isVisible()) && (await page.getByText('Computer Science Engineering').first().isVisible()) && (await page.getByText('Build skills. Create projects. Get career-ready.').isVisible()));
  check('overall progress bar reads 0%', (await page.getByRole('progressbar', { name: 'Overall roadmap progress' }).getAttribute('aria-valuenow')) === '0');
  const tabs = page.getByRole('tab');
  check('eight semester tabs', (await tabs.count()) === 8);
  check('opens on the current semester (5)', (await selectedTab(page)) === 'roadmap-tab-5' && (await panelSemester(page)) === '5');
  check('current semester is announced as current', /your current semester/.test(await page.locator('#roadmap-tab-5').getAttribute('aria-label')));
  check('next action card is shown', await page.locator('[data-next-milestone]').isVisible());
  check('no horizontal page overflow on desktop', await noPageOverflow(page));
  await sleep(1600);
  const opacities = await page.evaluate(() => [...document.querySelectorAll('#roadmap-title, [role="tab"], [role="progressbar"]')].map((node) => Number(getComputedStyle(node).opacity) * Number(getComputedStyle(node.closest('[style*="opacity"]') ?? node).opacity)));
  check('entrance animations finish: hero, all eight tabs and progress fully visible', opacities.length >= 10 && opacities.every((value) => value === 1), opacities);
  await page.screenshot({ path: shotPath('roadmap-desktop-light') });

  section('All eight semesters, by click');
  const roadmapGets = [];
  page.on('request', (request) => {
    if (request.url().includes('/roadmap/me')) roadmapGets.push(request.url());
  });
  for (const semester of [1, 2, 3, 4, 5, 6, 7, 8]) {
    await page.locator(`#roadmap-tab-${semester}`).click();
    await page.locator(`[data-semester-panel="${semester}"]`).waitFor({ timeout: 5000 });
    await sleep(450);
    const heading = await page.locator('#roadmap-semester-heading').innerText();
    check(`semester ${semester}: tab selected, panel and heading match`, (await selectedTab(page)) === `roadmap-tab-${semester}` && heading.startsWith(`Semester ${semester}`) && page.url().includes(`semester=${semester}`), heading);
  }
  check('switching semesters never refetches the roadmap', roadmapGets.length === 0, roadmapGets.length);

  section('Keyboard');
  await page.locator('#roadmap-tab-8').focus();
  await page.keyboard.press('Home');
  await page.locator('[data-semester-panel="1"]').waitFor();
  check('Home → semester 1, focus follows', (await selectedTab(page)) === 'roadmap-tab-1' && (await page.evaluate(() => document.activeElement?.id)) === 'roadmap-tab-1');
  await page.keyboard.press('ArrowRight');
  await page.locator('[data-semester-panel="2"]').waitFor();
  check('ArrowRight → semester 2', (await selectedTab(page)) === 'roadmap-tab-2');
  await page.keyboard.press('End');
  await page.locator('[data-semester-panel="8"]').waitFor();
  check('End → semester 8', (await selectedTab(page)) === 'roadmap-tab-8');
  check('only the selected tab is in the tab order', (await page.locator('[role="tab"][tabindex="0"]').count()) === 1);
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).boxShadow + getComputedStyle(document.activeElement).outlineStyle);
  check('focused tab has a visible focus style', outline !== 'nonenone' && outline !== 'none', outline);

  section('Semester transition animation');
  const animatedSwitch = await switchTime(page, 5);
  await sleep(500);
  check('the old semester animates out before the new one enters (not an instant swap)', animatedSwitch >= 150 && animatedSwitch < 1500, Math.round(animatedSwitch));
  const settled = await page.evaluate(() => getComputedStyle(document.querySelector('[data-semester-panel]')).opacity);
  check('the new semester settles fully visible', settled === '1', settled);

  section('Completing a milestone waits for the server');
  let patches = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/roadmap/milestones/**', async (route) => {
    patches += 1;
    await gate;
    await route.continue();
  });
  const card = page.locator('[data-milestone="s5-react"]');
  const box = card.getByRole('checkbox');
  check('starts unchecked', (await box.getAttribute('aria-checked')) === 'false');
  await box.click();
  await sleep(150);
  await box.click({ force: true });
  await box.click({ force: true });
  await sleep(300);
  check('while saving: still unchecked, busy, one request despite three clicks', (await box.getAttribute('aria-checked')) === 'false' && (await box.getAttribute('aria-busy')) === 'true' && patches === 1, { patches, busy: await box.getAttribute('aria-busy') });
  release();
  await page.waitForFunction(() => document.querySelector('[data-milestone="s5-react"] [role="checkbox"]')?.getAttribute('aria-checked') === 'true');
  await page.unroute('**/roadmap/milestones/**');
  check('after the server saved it: checked, card marked completed', (await card.getAttribute('data-status')) === 'completed');
  check('success message appears', await card.getByText('Milestone complete. Nice work!').isVisible());
  check('semester progress updated from the server (1 of 4)', (await page.getByRole('progressbar', { name: 'Semester 5 progress' }).getAttribute('aria-valuenow')) === '25');
  check('saved in the database', (await api('GET', '/roadmap/me', { token: asha.token })).data.semesters[4].milestones.find((m) => m.id === 's5-react').status === 'completed');
  check('focus stays on the milestone', (await page.evaluate(() => document.activeElement?.getAttribute('role'))) === 'checkbox');

  section('Start, then undo');
  const node = page.locator('[data-milestone="s5-node-backend"]');
  await node.getByRole('button', { name: 'Start' }).click();
  await node.getByText('In progress').first().waitFor();
  check('Start → in progress (from the server)', (await node.getAttribute('data-status')) === 'in-progress');
  await node.getByRole('button', { name: 'Working on it' }).click();
  await page.waitForFunction(() => document.querySelector('[data-milestone="s5-node-backend"]')?.getAttribute('data-status') === 'not-started');
  check('pressing it again → not started', true);

  section('Details and safe links');
  await card.getByRole('button', { name: 'Details & resources' }).click();
  await card.getByText('You’ll be able to').waitFor();
  const links = await card.locator('a[target="_blank"]').evaluateAll((anchors) => anchors.map((a) => ({ href: a.href, rel: a.rel })));
  check('external resources: https only, opened with noopener noreferrer', links.length > 0 && links.every((link) => link.href.startsWith('https://') && /noopener/.test(link.rel) && /noreferrer/.test(link.rel)), links);
  const s5problem = page.locator('[data-milestone="s1-problem-solving"]');
  await page.locator('#roadmap-tab-1').click();
  await s5problem.waitFor();
  await s5problem.getByRole('button', { name: 'Details & resources' }).click();
  check('a milestone without verified links shows a clear empty state', await s5problem.getByText(/No resources linked for this milestone yet/).isVisible());
  await page.locator('#roadmap-tab-5').click();
  await page.locator('[data-semester-panel="5"]').waitFor();

  section('Completing the semester');
  for (const id of ['s5-node-backend', 's5-mongodb-rest']) {
    await page.locator(`[data-milestone="${id}"]`).getByRole('button', { name: 'Mark complete' }).click();
    await page.waitForFunction((milestone) => document.querySelector(`[data-milestone="${milestone}"]`)?.getAttribute('data-status') === 'completed', id);
  }
  check('no celebration before the last required milestone', (await page.locator('[data-celebration]').count()) === 0);
  await page.locator('[data-milestone="s5-capstone-project"]').getByRole('checkbox').click();
  await page.locator('[data-celebration="5"]').waitFor({ timeout: 5000 });
  check('celebration: badge, message and "Explore Semester 6"', (await page.getByText('Semester 5 complete!').isVisible()) && (await page.getByRole('button', { name: 'Explore Semester 6' }).isVisible()));
  check('the project milestone offers to add it to Things I’ve Built', await page.locator('[data-milestone="s5-capstone-project"]').getByRole('link', { name: /Things I’ve Built/ }).isVisible());
  check('semester 5 tab now shows Completed', /Completed/.test(await page.locator('#roadmap-tab-5').getAttribute('aria-label')));
  check('semester badge shown on the overview', await page.locator('[data-semester-badge="5"]').isVisible());
  await page.screenshot({ path: shotPath('roadmap-semester-complete'), fullPage: false });
  check('the celebration never blocks navigation (no modal)', (await page.locator('[role="dialog"]').count()) === 0);
  await page.getByRole('button', { name: 'Explore Semester 6' }).click();
  await page.locator('[data-semester-panel="6"]').waitFor();
  check('"Explore Semester 6" opens semester 6', (await selectedTab(page)) === 'roadmap-tab-6');
  await sleep(1200);

  section('Refresh and sign-in persistence');
  await page.reload();
  await page.locator('[data-semester-panel="6"]').waitFor({ timeout: 15000 });
  check('after refresh: same semester (6) open', (await selectedTab(page)) === 'roadmap-tab-6');
  await page.locator('#roadmap-tab-5').click();
  await page.locator('[data-semester-panel="5"]').waitFor();
  check('after refresh: semester 5 still complete', (await page.locator('[data-milestone="s5-react"]').getAttribute('data-status')) === 'completed' && /Completed/.test(await page.locator('#roadmap-tab-5').getAttribute('aria-label')));
  await page.locator('#roadmap-tab-7').click();
  await sleep(1300); // the selection is remembered after a short pause
  await page.getByRole('button', { name: 'Log out' }).first().click();
  await page.waitForURL(/\/login/);
  await signIn(page, asha);
  await page.goto(`${web.url}/profile/roadmap`);
  await page.locator('[data-semester-panel]').waitFor({ timeout: 15000 });
  check('after logging out and in: reopens on the semester last viewed (7)', (await selectedTab(page)) === 'roadmap-tab-7', await selectedTab(page));
  check('after logging out and in: progress kept', (await page.getByRole('progressbar', { name: 'Overall roadmap progress' }).getAttribute('aria-valuenow')) !== '0');

  section('Changing the career goal');
  await page.getByRole('button', { name: 'Change goal' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByText('AI/ML Engineer').click();
  await dialog.getByRole('button', { name: 'Switch goal' }).click();
  await page.getByRole('heading', { level: 1, name: /Your journey to AI and Machine Learning/ }).waitFor({ timeout: 10000 });
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  check('goal switched; dialog closed', (await page.getByRole('dialog').count()) === 0);
  check('saved-progress note explains kept milestones', await page.getByText(/saved from another goal/).isVisible());
  await page.locator('#roadmap-tab-5').click();
  await page.locator('[data-semester-panel="5"]').waitFor();
  check('AI/ML semester 5 shows deep learning', await page.locator('[data-milestone="s5-deep-learning"]').isVisible());
  await page.getByRole('button', { name: 'Change goal' }).click();
  await page.getByRole('dialog').getByText('Full Stack Developer').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Switch goal' }).click();
  await page.getByRole('heading', { level: 1, name: /Full Stack Development/ }).waitFor();
  await page.locator('[data-milestone="s5-react"]').waitFor();
  check('switching back restores the completed semester', (await page.locator('[data-milestone="s5-react"]').getAttribute('data-status')) === 'completed' && /Completed/.test(await page.locator('#roadmap-tab-5').getAttribute('aria-label')));
  await context.close();

  section('Reduced motion');
  const reduced = await newPage({ reducedMotion: 'reduce' });
  await signIn(reduced.page, asha);
  await reduced.page.goto(`${web.url}/profile/roadmap?semester=2`);
  await reduced.page.locator('[data-semester-panel="2"]').waitFor({ timeout: 15000 });
  const instant = await switchTime(reduced.page, 6);
  check('with reduced motion the new semester appears at once (no exit animation)', instant < 120, Math.round(instant));
  const transform = await reduced.page.evaluate(() => getComputedStyle(document.querySelector('[data-semester-panel]')).transform);
  check('…and is not moved or scaled', transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)', transform);
  await reduced.context.close();

  section('Phone layout and dark mode');
  const phone = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  await signIn(phone.page, asha);
  await phone.page.goto(`${web.url}/profile`);
  await phone.page.getByTestId('semester-roadmap-button').waitFor();
  check('phone: profile has no horizontal overflow and the button fits', (await noPageOverflow(phone.page)) && (await phone.page.getByTestId('semester-roadmap-button').boundingBox()).width <= 390);
  await phone.page.getByTestId('semester-roadmap-button').tap();
  await phone.page.locator('[data-semester-panel]').waitFor({ timeout: 15000 });
  check('phone: no horizontal page overflow on the roadmap', await noPageOverflow(phone.page));
  await phone.page.locator('#roadmap-tab-8').tap();
  await phone.page.locator('[data-semester-panel="8"]').waitFor();
  await sleep(600);
  const inView = await phone.page.evaluate(() => {
    const tab = document.getElementById('roadmap-tab-8').getBoundingClientRect();
    return tab.left >= 0 && tab.right <= window.innerWidth;
  });
  check('phone: the semester row scrolls so the selected semester is visible', inView);
  check('phone: still no page overflow after scrolling the row', await noPageOverflow(phone.page));
  check('dark mode: the app is in dark mode with a dark page background', await phone.page.evaluate(() => document.documentElement.classList.contains('dark') && getComputedStyle(document.body).backgroundColor === 'rgb(11, 14, 12)'));
  const heroText = await phone.page.evaluate(() => getComputedStyle(document.getElementById('roadmap-title')).color);
  check('dark mode: hero title uses the light ink colour', heroText === 'rgb(230, 238, 232)', heroText);
  await phone.page.evaluate(() => window.scrollTo(0, 0));
  await sleep(1200);
  await phone.page.screenshot({ path: shotPath('roadmap-phone-dark') });
  await phone.page.evaluate(() => document.getElementById('roadmap-journey-heading').scrollIntoView());
  await sleep(500);
  await phone.page.screenshot({ path: shotPath('roadmap-phone-journey') });
  await phone.context.close();

  section('Desktop dark mode');
  const dark = await newPage({ colorScheme: 'dark' });
  await signIn(dark.page, asha);
  await dark.page.goto(`${web.url}/profile/roadmap?semester=5`);
  await dark.page.locator('[data-semester-panel="5"]').waitFor({ timeout: 15000 });
  await sleep(1200);
  await dark.page.screenshot({ path: shotPath('roadmap-desktop-dark') });
  check('desktop dark: no overflow', await noPageOverflow(dark.page));
  await dark.context.close();

  section('Session ended elsewhere, another student on the same tab');
  // No logout button here: the session is revoked by a password change on another device, so the roadmap
  // store is never explicitly reset. The next student must still see only their own roadmap.
  const bilal = await register('Bilal', 'Khan', { branch: 'mechanical', semester: 3, interests: ['ai-ml', 'robotics', 'sports'] });
  const shared = await newPage();
  await signIn(shared.page, asha);
  await shared.page.goto(`${web.url}/profile/roadmap?semester=6`);
  await shared.page.locator('[data-semester-panel="6"]').waitFor({ timeout: 15000 });
  const otherDevice = await t.login(asha.email);
  const revoke = await api('PUT', '/auth/password', { token: otherDevice.data.accessToken, body: { currentPassword: PASSWORD, newPassword: 'Roadmap#Switch2027', confirmPassword: 'Roadmap#Switch2027' } });
  check('seed: password changed on another device (this tab is signed out)', revoke.status === 200, revoke.body);
  await sleep(800);
  const target = shared.page.locator('[data-milestone="s6-internship-prep"]');
  if (!shared.page.url().includes('/login') && (await target.count())) await target.getByRole('button', { name: 'Mark complete' }).click().catch(() => {});
  await shared.page.waitForURL(/\/login/, { timeout: 15000 });
  check('the signed-out tab goes to the login page', shared.page.url().includes('/login'));
  check('nothing was saved for the signed-out tab', (await api('GET', '/roadmap/me', { token: otherDevice.data.accessToken })).data.semesters[5].milestones.find((m) => m.id === 's6-internship-prep').status === 'not-started');
  // Sign in on the same page (no reload, so in-memory stores survive) and move around inside the app.
  await shared.page.getByLabel('Email').fill(bilal.email);
  await shared.page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await shared.page.getByRole('button', { name: 'Log in' }).click();
  await shared.page.waitForURL(/\/home|\/profile\/roadmap/, { timeout: 20000 });
  await shared.page.getByRole('link', { name: 'My Profile' }).first().click();
  const sharedButton = shared.page.getByTestId('semester-roadmap-button');
  await sharedButton.waitFor({ timeout: 15000 });
  check("the profile button never shows the previous student's progress", !/Semester 5 of 8|Full Stack Developer/.test(await sharedButton.innerText()), await sharedButton.innerText());
  await shared.page.getByText('Semester 3 of 8').first().waitFor({ timeout: 10000 });
  await sharedButton.click();
  await shared.page.getByRole('heading', { level: 1, name: /Your journey to AI and Machine Learning/ }).waitFor({ timeout: 15000 });
  check("the roadmap is the new student's (semester 3, AI/ML, 0%)", (await shared.page.getByText('Semester 3 of 8').first().isVisible()) && (await shared.page.getByRole('progressbar', { name: 'Overall roadmap progress' }).getAttribute('aria-valuenow')) === '0' && (await selectedTab(shared.page)) === 'roadmap-tab-3', await selectedTab(shared.page));
  await shared.context.close();

  section('Console');
  check('no page errors or console errors', errors.length === 0, errors.slice(0, 5));
} catch (error) {
  check('suite ran to the end without crashing', false, error.stack ?? String(error));
} finally {
  await browser?.close();
}
await t.finish();
