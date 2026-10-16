// Aurora Glass and Theme Studio in the browser: the Campus default is unchanged, Theme Studio's live
// preview / Apply / Cancel / Reset and keyboard use, persistence across reloads (and old saves), the
// student and admin themes kept apart (admin defaults to Aurora Glass Dark, has its own light variant and
// toggle, and students never see admin theme controls), glass surfaces and frosted overlays, typography
// (display / body / monospace), text contrast on glass in both variants, the theme crossfade and reduced
// motion, the backdrop-filter and reduced-transparency fallbacks, blocked web fonts, phone and tablet
// layouts, and every major student and admin page rendering without errors.
import { PASSWORD, oid, sleep } from '../lib/harness.mjs';
import { createSuite } from '../lib/harness.mjs';
import { API_PORT } from '../lib/paths.mjs';
import { launchBrowser, shotPath, startWeb } from '../lib/web.mjs';

const t = await createSuite('theme-ui');
const { check, section, register, api, db, login } = t;
const web = await startWeb({ apiPort: API_PORT, name: 'web-theme' });
t.cleanups.push(() => web.stop());
const { browser, reason } = await launchBrowser();

// Helpers available on every page: colour parsing through a canvas (handles rgb, oklab, color-mix
// results), the background an element really sits on (translucent layers composited onto the page), and
// the WCAG contrast ratio. View transitions are counted so the crossfade can be checked.
const PAGE_HELPERS = () => {
  const toRgba = (color) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const over = (top, bottom) => {
    const alpha = top[3] + bottom[3] * (1 - top[3]);
    if (!alpha) return [0, 0, 0, 0];
    return [0, 1, 2].map((i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / alpha).concat(alpha);
  };
  const luminance = ([r, g, b]) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const effectiveBg = (element) => {
    const layers = [];
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) layers.push(toRgba(getComputedStyle(node).backgroundColor));
    let bg = toRgba(getComputedStyle(document.body).backgroundColor);
    if (bg[3] < 1) bg = over(bg, [255, 255, 255, 1]);
    for (const layer of layers.reverse()) if (layer[3] > 0) bg = over(layer, bg);
    return bg;
  };
  const contrast = (element) => {
    const fg = toRgba(getComputedStyle(element).color);
    const bg = effectiveBg(element);
    const shown = over(fg, bg);
    const [a, b] = [luminance(shown), luminance(bg)].sort((x, y) => y - x);
    return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
  };
  window.cxTheme = { toRgba, effectiveBg, contrast, alphaOf: (element) => toRgba(getComputedStyle(element).backgroundColor)[3] };
  window.__viewTransitions = 0;
  const start = document.startViewTransition?.bind(document);
  if (start) {
    document.startViewTransition = (update) => {
      window.__viewTransitions += 1;
      return start(update);
    };
  }
};

const errors = [];
async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, colorScheme: 'light', ...options });
  await context.addInitScript(PAGE_HELPERS);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource|socket\.io|WebSocket|ERR_FAILED|net::/i.test(message.text())) errors.push(message.text());
  });
  return { context, page };
}

async function signIn(page, account, landing = /\/home/) {
  await page.goto(`${web.url}/login`);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(landing, { timeout: 20000 });
}

const htmlClasses = (page) => page.evaluate(() => [...document.documentElement.classList].sort().join(' '));
const bodyBg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('campusx-theme') || 'null')?.state ?? null);
const noPageOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const option = (page, id) => page.locator(`[data-theme-option="${id}"]`);
const optionChecked = (page, id) => option(page, id).locator('input').isChecked();
const settle = () => sleep(450);

/** Visits a page, waits for its main heading, and records it rendered without errors. */
async function visit(page, path, heading, shot) {
  const before = errors.length;
  await page.goto(`${web.url}${path}`);
  await page.getByRole('heading', { level: 1, name: heading }).first().waitFor({ timeout: 20000 });
  await settle();
  if (shot) await page.screenshot({ path: shotPath(shot) });
  return errors.length === before;
}

try {
  if (!browser) throw new Error(reason);

  section('Setup');
  const asha = await register('Asha', 'Rao');
  const bilal = await register('Bilal', 'Khan');
  const chitra = await register('Chitra', 'Iyer');
  const ada = await register('Ada', 'Admin');
  await db.collection('users').updateOne({ _id: oid(ada.id) }, { $set: { role: 'admin' } });
  ada.token = (await login(ada.email)).data.accessToken;
  const post = await api('POST', '/posts', { token: asha.token, body: { content: 'Robotics club demo on Friday in the main hall, bring your line followers and spare batteries.', visibility: 'public' } });
  await api('POST', '/posts', { token: bilal.token, body: { content: 'Looking for teammates for the inter-college hackathon next month, ping me if you like web dev.', visibility: 'public' } });
  await api('POST', '/posts', { token: chitra.token, body: { content: 'Library extends weekend hours during exam season, quiet floors open until midnight.', visibility: 'public', type: 'campus-update' } });
  for (const reporter of [bilal, chitra]) await api('POST', '/reports', { token: reporter.token, body: { targetType: 'post', targetId: post.data.post.id, reason: 'spam', description: 'Looks like advertising.' } });
  await api('POST', '/projects', { token: chitra.token, body: { title: 'Smart Attendance System', shortDescription: 'Face recognition attendance for classrooms.', description: 'A web app that marks attendance using face recognition with a React dashboard for teachers.', category: 'web' } });
  const opportunity = await api('POST', '/admin/opportunities', { token: ada.token, body: { title: 'Campus AI Hackathon 2026', shortDescription: 'A 24 hour hackathon on AI for campus life.', description: 'Build AI tools that make campus life easier. Teams of up to four students from any branch.', type: 'hackathon', organizer: 'CampusX Tech Club', mode: 'online', applicationDeadline: new Date(Date.now() + 10 * 86400000).toISOString() } });
  await api('PATCH', `/admin/opportunities/${opportunity.data?.opportunity?.id}`, { token: ada.token, body: { status: 'published' } });
  const chat = await api('POST', '/conversations', { token: bilal.token, body: { userId: asha.id } });
  await api('POST', `/conversations/${chat.data?.conversation?.id}/messages`, { token: bilal.token, body: { text: 'Hey Asha, are you joining the robotics demo on Friday?' } });
  await api('POST', `/users/${asha.id}/follow`, { token: bilal.token });
  const resume = await api('POST', '/resumes', { token: asha.token, body: { targetRole: 'internship' } });
  check('seed: students, an admin, posts, reports, a project, an opportunity and a conversation', post.status === 201 && opportunity.status === 201 && chat.status < 300 && resume.status === 201);

  // ---------------------------------------------------------------------------------------------------
  section('The Campus default is unchanged');
  const { page } = await newPage();
  await signIn(page, asha);
  await page.locator('article').first().waitFor({ timeout: 20000 });
  await settle();
  await page.screenshot({ path: shotPath('theme-campus-light-home') });
  check('a first visit stays on Campus Light (no Aurora class, green paper background)', !(await htmlClasses(page)).includes('theme-aurora') && (await bodyBg(page)) === 'rgb(244, 247, 244)', await htmlClasses(page));
  const campusCards = await page.evaluate(() =>
    [...document.querySelectorAll('.glass-card.bg-surface:not(.campus-grid)')].map((card) => ({ alpha: window.cxTheme.alphaOf(card), image: getComputedStyle(card).backgroundImage, cls: card.className.slice(0, 80) })),
  );
  check('glass hooks do nothing in Campus themes: cards stay opaque white', campusCards.length > 0 && campusCards.every((card) => card.alpha === 1 && card.image === 'none'), campusCards.filter((card) => card.alpha !== 1 || card.image !== 'none'));
  check('Campus headings keep Bricolage Grotesque', /Bricolage Grotesque/.test(await page.evaluate(() => getComputedStyle(document.querySelector('h1, h2')).fontFamily)));
  check('no ambient aurora layer in Campus themes', (await page.evaluate(() => getComputedStyle(document.body, '::before').content)) === 'none');

  // ---------------------------------------------------------------------------------------------------
  section('Theme Studio: entry points and options');
  await page.getByRole('link', { name: 'Theme Studio' }).first().click();
  await page.waitForURL(/\/theme-studio$/);
  await page.getByRole('heading', { level: 1, name: 'Theme Studio' }).waitFor();
  check('the sidebar links to Theme Studio', true);
  const appOptions = await page.locator('input[name="app-theme"]').evaluateAll((inputs) => inputs.map((input) => input.value));
  check('four app themes: Campus Light, Campus Dark, Aurora Glass Light, Aurora Glass Dark', appOptions.join() === 'campus-light,campus-dark,aurora-light,aurora-dark', appOptions);
  check('the saved theme is selected and marked "In use"', (await optionChecked(page, 'campus-light')) && (await option(page, 'campus-light').getByText('In use').count()) === 1);
  check('students see no admin theme controls', (await page.locator('input[name="admin-theme"]').count()) === 0 && (await page.getByText('Admin control center').count()) === 0);
  check('previews render with each theme’s own tokens', await page.evaluate(() => {
    const bg = (id) => getComputedStyle(document.querySelector(`[data-theme-preview="${id}"]`)).backgroundColor;
    return bg('campus-light') === 'rgb(244, 247, 244)' && bg('campus-dark') === 'rgb(11, 14, 12)' && bg('aurora-light') === 'rgb(244, 243, 251)' && bg('aurora-dark') === 'rgb(7, 10, 28)';
  }));
  check('previews use each theme’s typeface (Space Grotesk only in Aurora)', await page.evaluate(() => {
    const font = (id) => getComputedStyle(document.querySelector(`[data-theme-preview="${id}"] .font-display`)).fontFamily;
    return /Bricolage/.test(font('campus-dark')) && /Space Grotesk/.test(font('aurora-dark'));
  }));
  check('Apply and Cancel are disabled with nothing to save', (await page.getByRole('button', { name: 'Apply' }).isDisabled()) && (await page.getByRole('button', { name: 'Cancel' }).isDisabled()));
  check('Campus primary buttons keep the solid green (no gradient)', await page.getByRole('button', { name: 'Apply' }).evaluate((button) => getComputedStyle(button).backgroundImage === 'none' && getComputedStyle(button).backgroundColor === 'rgb(22, 130, 79)'));
  await page.screenshot({ path: shotPath('theme-studio-campus'), fullPage: true });

  section('Theme Studio: live preview, Cancel, Apply');
  await page.evaluate(() => (window.__viewTransitions = 0));
  await option(page, 'aurora-dark').click();
  await settle();
  check('picking Aurora Glass Dark previews it across the app at once', (await htmlClasses(page)) === 'dark theme-aurora' && (await bodyBg(page)) === 'rgb(7, 10, 28)', await htmlClasses(page));
  check('…without saving it yet', (await saved(page))?.style !== 'aurora');
  check('the switch crossfades once (View Transition)', (await page.evaluate(() => window.__viewTransitions)) === 1);
  check('the chosen card shows the check and the highlight ring', (await optionChecked(page, 'aurora-dark')) && (await option(page, 'aurora-dark').locator('svg.lucide-check').count()) === 1);
  check('status says it is a preview', /Previewing Aurora Glass Dark/.test(await page.getByRole('status').filter({ hasText: 'Previewing' }).innerText()));
  check('meta theme-color follows the preview', (await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content)) === '#070a1c');
  await page.screenshot({ path: shotPath('theme-studio-aurora-dark-preview'), fullPage: true });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await settle();
  check('Cancel returns to the saved Campus Light', (await htmlClasses(page)) === '' && (await optionChecked(page, 'campus-light')));

  await option(page, 'aurora-light').click();
  await settle();
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await page.waitForURL(/\/home/);
  await settle();
  check('leaving Theme Studio without applying drops the preview', !(await htmlClasses(page)).includes('theme-aurora'));
  await page.goto(`${web.url}/theme-studio`);
  await page.getByRole('heading', { level: 1, name: 'Theme Studio' }).waitFor();

  section('Theme Studio: keyboard');
  await option(page, 'campus-light').locator('input').focus();
  await page.keyboard.press('ArrowRight');
  await settle();
  check('arrow keys move through the themes (radio group) and preview each', (await optionChecked(page, 'campus-dark')) && (await htmlClasses(page)) === 'dark');
  check('the focused card shows a visible focus ring', await option(page, 'campus-dark').evaluate((label) => getComputedStyle(label).boxShadow !== 'none'));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await settle();
  check('…to Aurora Glass Dark', await optionChecked(page, 'aurora-dark'));
  await page.getByRole('button', { name: 'Apply' }).click();
  await settle();
  check('Apply saves { style: aurora, theme: dark } on this device', JSON.stringify(await saved(page)) === JSON.stringify({ theme: 'dark', style: 'aurora', adminMode: 'dark' }), await saved(page));
  check('a confirmation toast appears', (await page.getByText('Aurora Glass Dark applied').count()) >= 1);
  check('Apply is disabled again and the card is "In use"', (await page.getByRole('button', { name: 'Apply' }).isDisabled()) && (await option(page, 'aurora-dark').getByText('In use').count()) === 1);

  section('Persistence');
  await page.reload();
  check('the saved theme is applied before first paint (inline script)', await page.evaluate(() => document.documentElement.classList.contains('theme-aurora') && document.documentElement.classList.contains('dark')));
  await page.getByRole('heading', { level: 1, name: 'Theme Studio' }).waitFor();
  check('after a reload the app is still Aurora Glass Dark', (await htmlClasses(page)) === 'dark theme-aurora' && (await bodyBg(page)) === 'rgb(7, 10, 28)');
  check('the sidebar light/dark toggle keeps the Aurora style', await (async () => {
    await page.getByRole('button', { name: /^Theme: Dark/ }).first().click();
    await settle();
    const after = await saved(page);
    return after.style === 'aurora' && after.theme === 'system';
  })());
  await page.getByRole('button', { name: /^Theme: System/ }).first().click();
  await page.getByRole('button', { name: /^Theme: Light/ }).first().waitFor();
  await settle();
  check('…and Theme Studio follows a change made elsewhere', (await optionChecked(page, 'aurora-light')) && (await htmlClasses(page)) === 'theme-aurora');
  const legacy = await newPage();
  await legacy.page.goto(`${web.url}/`);
  await legacy.page.evaluate(() => localStorage.setItem('campusx-theme', JSON.stringify({ state: { theme: 'dark' }, version: 0 })));
  await legacy.page.reload();
  await settle();
  check('an older save (theme only) still opens as Campus Dark', (await htmlClasses(legacy.page)) === 'dark' && (await bodyBg(legacy.page)) === 'rgb(11, 14, 12)');
  await legacy.page.evaluate(() => localStorage.setItem('campusx-theme', JSON.stringify({ state: { theme: 'neon', style: 'rainbow', adminMode: 'party' }, version: 0 })));
  await legacy.page.reload();
  await settle();
  check('unknown saved values fall back to the defaults', !(await htmlClasses(legacy.page)).includes('theme-aurora'));
  await legacy.context.close();

  // ---------------------------------------------------------------------------------------------------
  for (const mode of ['dark', 'light']) {
    section(`Aurora Glass ${mode}: student pages`);
    await page.evaluate((value) => localStorage.setItem('campusx-theme', JSON.stringify({ state: { theme: value, style: 'aurora', adminMode: 'dark' }, version: 0 })), mode);
    await page.goto(`${web.url}/home`);
    await page.locator('article').first().waitFor({ timeout: 20000 });
    await settle();
    await page.screenshot({ path: shotPath(`theme-aurora-${mode}-home`) });
    const glass = await page.evaluate(() => {
      const card = document.querySelector('article.glass-card, .glass-card');
      const aside = document.querySelector('aside');
      return {
        cardAlpha: window.cxTheme.alphaOf(card),
        cardSheen: getComputedStyle(card).backgroundImage,
        sidebarAlpha: window.cxTheme.alphaOf(aside),
        ambient: getComputedStyle(document.body, '::before').backgroundImage,
        heading: getComputedStyle(document.querySelector('h1, h2')).fontFamily,
        body: getComputedStyle(document.body).fontFamily,
      };
    });
    await page.goto(`${web.url}/theme-studio`);
    await page.getByRole('heading', { level: 1, name: 'Theme Studio' }).waitFor();
    glass.primary = await page.getByRole('button', { name: 'Apply' }).evaluate((button) => ({ image: getComputedStyle(button).backgroundImage, color: getComputedStyle(button).color }));
    await page.goto(`${web.url}/home`);
    await page.locator('article').first().waitFor({ timeout: 20000 });
    check('cards are translucent glass with a sheen', glass.cardAlpha > 0.4 && glass.cardAlpha < 0.8 && /linear-gradient/.test(glass.cardSheen), glass);
    check('the sidebar is glass too', glass.sidebarAlpha < 0.8, glass.sidebarAlpha);
    check('the ambient aurora sits behind the page (three soft radial fields)', (glass.ambient.match(/radial-gradient/g) ?? []).length === 3, glass.ambient);
    check('headings use Space Grotesk; body text keeps Plus Jakarta Sans', /Space Grotesk/.test(glass.heading) && /Plus Jakarta Sans/.test(glass.body) && !/Space Grotesk|JetBrains/.test(glass.body), glass);
    check('primary actions use the violet → blue gradient with white text', glass.primary && /linear-gradient/.test(glass.primary.image) && glass.primary.color === 'rgb(255, 255, 255)', glass.primary);
    const contrast = await page.evaluate(() => {
      const ratio = (selector) => {
        const node = [...document.querySelectorAll(selector)].find((element) => element.offsetParent && element.textContent.trim());
        return node ? window.cxTheme.contrast(node) : null;
      };
      return { postText: ratio('article p'), muted: ratio('main .text-ink-muted'), subtle: ratio('main .text-ink-subtle'), nav: ratio('aside nav a'), primaryLink: ratio('main .text-primary') };
    });
    check('text on glass meets WCAG AA (4.5:1) for body, muted, subtle, navigation and links', Object.values(contrast).every((value) => value === null || value >= 4.5), contrast);

    await page.locator('article').first().getByRole('button', { name: /more options|post options/i }).first().click().catch(() => {});
    const menu = page.getByRole('menu').first();
    if (await menu.count()) {
      await settle();
      check('dropdown menus are frosted overlays (backdrop blur, stronger glass)', await menu.evaluate((element) => /blur/.test(getComputedStyle(element).backdropFilter) && window.cxTheme.alphaOf(element) >= 0.8));
      await page.screenshot({ path: shotPath(`theme-aurora-${mode}-post-menu`) });
      await page.keyboard.press('Escape');
    } else check('post menu opened', false);

    const pages = [
      ['/profile', null, 'profile'],
      [`/profile/${bilal.id}`, null, 'public-profile'],
      ['/communities', 'Communities', 'communities'],
      ['/projects', /Projects|Things/, 'projects'],
      ['/achievements', /Achievements|Wins/, 'achievements'],
      ['/opportunities', /Opportunities/, 'opportunities'],
      ['/profile/roadmap', /journey/i, 'roadmap'],
      ['/rankings', /Rankings|Leaderboard/, 'rankings'],
      ['/rankings/hall-of-fame', /Hall of Fame/, 'hall-of-fame'],
      ['/notifications', /Notifications/, 'notifications'],
      ['/search?q=robotics', /Search|robotics/i, 'search'],
      ['/discover', /Discover/, 'discover'],
      ['/safety', /Safety|guidelines/i, 'safety'],
      ['/profile/edit', /Edit your profile/, 'edit-profile'],
      ['/resume-builder', /Resume Builder/, 'resume-builder'],
      [`/resume-builder/${resume.data?.resume?.id}?step=review`, /Internship Resume/, 'resume-editor'],
    ];
    const failed = [];
    for (const [path, heading, name] of pages) {
      const before = errors.length;
      await page.goto(`${web.url}${path}`);
      await (heading ? page.getByRole('heading', { level: 1, name: heading }).first() : page.locator('h1').first()).waitFor({ timeout: 20000 }).catch(() => failed.push(`${path}: no heading`));
      await settle();
      if (errors.length !== before) failed.push(`${path}: ${errors.slice(before).join(' | ')}`);
      if (!(await noPageOverflow(page))) failed.push(`${path}: horizontal overflow`);
      const low = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('main h1, main h2, main p, main a, main button, main label')].filter((node) => node.offsetParent && node.childElementCount === 0 && node.textContent.trim()).slice(0, 80);
        return nodes.map((node) => ({ text: node.textContent.trim().slice(0, 40), ratio: window.cxTheme.contrast(node), cls: node.className })).filter((item) => item.ratio < 4.5 && !/opacity|disabled|bg-black|text-white/.test(String(item.cls)));
      });
      if (low.length) failed.push(`${path}: low contrast ${JSON.stringify(low.slice(0, 3))}`);
      await page.screenshot({ path: shotPath(`theme-aurora-${mode}-${name}`) });
    }
    check('every student page renders, fits the screen and keeps text ≥ 4.5:1 on glass', failed.length === 0, failed);

    await page.goto(`${web.url}/messages`);
    await page.getByText('Bilal Khan').first().waitFor({ timeout: 20000 });
    await page.getByText('Bilal Khan').first().click();
    await page.getByText('are you joining the robotics demo').waitFor({ timeout: 15000 });
    await settle();
    await page.screenshot({ path: shotPath(`theme-aurora-${mode}-messages`) });
    check('messages render on glass', (await noPageOverflow(page)) && (await page.getByText('are you joining the robotics demo').count()) >= 1);

    await page.goto(`${web.url}/profile`);
    await page.locator('h1').first().waitFor();
    check('the default profile cover becomes the aurora gradient', await page.evaluate(() => /linear-gradient/.test(getComputedStyle(document.querySelector('.glass-cover')).backgroundImage)));
    await page.locator('[data-follow-stats] button').first().click().catch(() => {});
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 8000 }).catch(() => {});
    if (await dialog.count()) {
      await settle();
      check('dialogs are frosted glass over a dim scrim', await dialog.evaluate((element) => /blur/.test(getComputedStyle(element).backdropFilter) && window.cxTheme.alphaOf(element) >= 0.8));
      await page.screenshot({ path: shotPath(`theme-aurora-${mode}-followers-dialog`) });
      await page.keyboard.press('Escape');
      await settle();
      check('Escape closes the dialog', (await dialog.count()) === 0);
    } else check('followers dialog opened', false);
  }

  // ---------------------------------------------------------------------------------------------------
  section('Signed out: the login page in Aurora Glass Dark');
  const guest = await newPage();
  await guest.page.goto(`${web.url}/`);
  await guest.page.evaluate(() => localStorage.setItem('campusx-theme', JSON.stringify({ state: { theme: 'dark', style: 'aurora', adminMode: 'dark' }, version: 0 })));
  await guest.page.goto(`${web.url}/login`);
  await guest.page.getByRole('button', { name: 'Log in' }).waitFor({ timeout: 20000 });
  await settle();
  const loginLook = await guest.page.evaluate(() => {
    const panel = document.querySelector('.glass-cover');
    const low = [...document.querySelectorAll('main h1, main h2, main p, main label, main a')].filter((node) => node.offsetParent && node.childElementCount === 0 && node.textContent.trim() && !node.closest('.glass-cover')).map((node) => ({ text: node.textContent.trim().slice(0, 30), ratio: window.cxTheme.contrast(node) })).filter((item) => item.ratio < 4.5);
    return { panel: panel && /linear-gradient/.test(getComputedStyle(panel).backgroundImage), low };
  });
  check('the brand panel uses the aurora gradient and the form text stays ≥ 4.5:1', loginLook.panel && loginLook.low.length === 0, loginLook);
  await guest.page.screenshot({ path: shotPath('theme-aurora-dark-login') });
  await guest.context.close();

  section('Phone and tablet');
  await page.evaluate(() => localStorage.setItem('campusx-theme', JSON.stringify({ state: { theme: 'dark', style: 'aurora', adminMode: 'dark' }, version: 0 })));
  const phone = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await signIn(phone.page, asha);
  await phone.page.evaluate(() => localStorage.setItem('campusx-theme', JSON.stringify({ state: { theme: 'dark', style: 'aurora', adminMode: 'dark' }, version: 0 })));
  await phone.page.goto(`${web.url}/home`);
  await phone.page.locator('article').first().waitFor({ timeout: 20000 });
  await settle();
  const phoneChrome = await phone.page.evaluate(() => ({
    bottomNav: getComputedStyle(document.querySelector('nav.fixed')).backdropFilter,
    topBar: getComputedStyle(document.querySelector('header.sticky')).backdropFilter,
    ambientAnimation: getComputedStyle(document.body, '::before').animationName,
  }));
  check('phone: the top bar and tab bar are frosted', /blur/.test(phoneChrome.bottomNav) && /blur/.test(phoneChrome.topBar), phoneChrome);
  check('phone: the ambient aurora stays still (no animation on small screens)', phoneChrome.ambientAnimation === 'none', phoneChrome);
  check('phone: no horizontal scrolling', await noPageOverflow(phone.page));
  await phone.page.screenshot({ path: shotPath('theme-aurora-dark-phone-home') });
  await phone.page.getByRole('button', { name: 'Your account' }).click();
  await phone.page.getByRole('link', { name: 'Theme Studio' }).click();
  await phone.page.getByRole('heading', { level: 1, name: 'Theme Studio' }).waitFor();
  await settle();
  check('phone: Theme Studio is reachable from the account sheet and fits', await noPageOverflow(phone.page));
  await phone.page.screenshot({ path: shotPath('theme-aurora-dark-phone-studio'), fullPage: true });
  await phone.context.close();

  const tablet = await newPage({ viewport: { width: 820, height: 1180 } });
  await signIn(tablet.page, asha);
  await tablet.page.evaluate(() => localStorage.setItem('campusx-theme', JSON.stringify({ state: { theme: 'light', style: 'aurora', adminMode: 'dark' }, version: 0 })));
  await tablet.page.goto(`${web.url}/communities`);
  await tablet.page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 20000 });
  await settle();
  check('tablet: icon rail layout fits without horizontal scrolling', await noPageOverflow(tablet.page));
  await tablet.page.screenshot({ path: shotPath('theme-aurora-light-tablet-communities') });
  await tablet.context.close();

  // ---------------------------------------------------------------------------------------------------
  section('Reduced motion');
  const calm = await newPage({ reducedMotion: 'reduce' });
  await signIn(calm.page, asha);
  await calm.page.goto(`${web.url}/theme-studio`);
  await calm.page.getByRole('heading', { level: 1, name: 'Theme Studio' }).waitFor({ timeout: 20000 });
  await option(calm.page, 'aurora-dark').click();
  await settle();
  check('reduced motion: the theme still changes, instantly (no crossfade)', (await htmlClasses(calm.page)).includes('theme-aurora') && (await calm.page.evaluate(() => window.__viewTransitions)) === 0);
  check('reduced motion: the ambient aurora does not drift', (await calm.page.evaluate(() => getComputedStyle(document.body, '::before').animationName)) === 'none');
  check('desktop with motion allowed: the student aurora drifts slowly', (await page.evaluate(() => getComputedStyle(document.body, '::before').animationName)) === 'ag-drift');
  await calm.context.close();

  section('Fallbacks: no backdrop-filter, less transparency, blocked fonts');
  const fallback = await page.evaluate(() => {
    const rules = [...document.styleSheets].flatMap((sheet) => {
      try {
        return [...sheet.cssRules];
      } catch {
        return [];
      }
    });
    const opaque = (rule) => [...rule.cssRules].every((inner) => {
      const glass = inner.style?.getPropertyValue('--ag-glass') ?? '';
      const strong = inner.style?.getPropertyValue('--ag-glass-strong') ?? '';
      return window.cxTheme.toRgba(glass)[3] >= 0.9 && window.cxTheme.toRgba(strong)[3] >= 0.97;
    });
    const supports = rules.find((rule) => rule instanceof CSSSupportsRule && /backdrop-filter/.test(rule.conditionText));
    const transparency = rules.find((rule) => rule instanceof CSSMediaRule && /prefers-reduced-transparency/.test(rule.conditionText));
    return { supports: Boolean(supports) && opaque(supports), transparency: Boolean(transparency) && opaque(transparency) };
  });
  check('without backdrop-filter support, glass becomes near-opaque (≥ 90%)', fallback.supports, fallback);
  check('with "reduce transparency", glass becomes near-opaque too', fallback.transparency, fallback);
  const noFonts = await newPage();
  await noFonts.context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await signIn(noFonts.page, asha);
  await noFonts.page.evaluate(() => localStorage.setItem('campusx-theme', JSON.stringify({ state: { theme: 'dark', style: 'aurora', adminMode: 'dark' }, version: 0 })));
  await noFonts.page.goto(`${web.url}/theme-studio`);
  await noFonts.page.getByRole('heading', { level: 1, name: 'Theme Studio' }).waitFor({ timeout: 20000 });
  const fontCheck = await noFonts.page.evaluate(() => {
    const h1 = document.querySelector('h1');
    return { family: getComputedStyle(h1).fontFamily, height: h1.getBoundingClientRect().height, loaded: document.fonts.check('16px "Space Grotesk"') };
  });
  check('fonts blocked: headings fall back to system faces and still render', /system-ui|sans-serif/.test(fontCheck.family) && fontCheck.height > 20, fontCheck);
  await noFonts.page.screenshot({ path: shotPath('theme-aurora-dark-no-webfonts') });
  await noFonts.context.close();

  // ---------------------------------------------------------------------------------------------------
  section('Admin control center: Aurora Glass Dark by default, kept apart from the student theme');
  const staff = await newPage();
  await staff.page.goto(`${web.url}/`);
  await staff.page.evaluate(() => localStorage.setItem('campusx-theme', JSON.stringify({ state: { theme: 'light', style: 'campus' }, version: 0 })));
  await signIn(staff.page, ada, /\/(home|onboarding|admin)/);
  await staff.page.goto(`${web.url}/admin/dashboard`);
  await staff.page.getByRole('heading', { level: 1, name: 'Command center' }).waitFor({ timeout: 20000 });
  await settle();
  check('the admin opens in Aurora Glass Dark although the student theme is Campus Light', (await htmlClasses(staff.page)) === 'admin-theme dark theme-aurora' && (await bodyBg(staff.page)) === 'rgb(7, 10, 28)', await htmlClasses(staff.page));
  check('…and the student theme was not changed', JSON.stringify(await saved(staff.page)) === JSON.stringify({ theme: 'light', style: 'campus', adminMode: 'dark' }), await saved(staff.page));
  check('the admin background stays still (no drifting aurora)', (await staff.page.evaluate(() => getComputedStyle(document.body, '::before').animationName)) === 'none');
  const adminLook = await staff.page.evaluate(() => {
    const panel = document.querySelector('.admin-panel');
    const header = document.querySelector('header.sticky');
    return {
      panelAlpha: window.cxTheme.alphaOf(panel),
      panelBlur: getComputedStyle(panel).backdropFilter,
      headerBlur: getComputedStyle(header).backdropFilter,
      title: getComputedStyle(document.querySelector('h1')).fontFamily,
      label: getComputedStyle(document.querySelector('.admin-label')).fontFamily,
      id: (() => {
        const node = [...document.querySelectorAll('.font-mono')].find((element) => /#[0-9A-F]{6}|Updated/.test(element.textContent));
        return node ? getComputedStyle(node).fontFamily : null;
      })(),
    };
  });
  check('panels are glass without blur (cheap to scroll); the sticky header is frosted', adminLook.panelAlpha < 0.8 && adminLook.panelBlur === 'none' && /blur/.test(adminLook.headerBlur), adminLook);
  check('typography: Space Grotesk titles, body-face labels, JetBrains Mono for IDs and times', /Space Grotesk/.test(adminLook.title) && /Plus Jakarta Sans/.test(adminLook.label) && /JetBrains Mono/.test(adminLook.id ?? ''), adminLook);
  check('summary cards are present', (await staff.page.getByText('Total students').count()) === 1 && (await staff.page.getByText('Pending reports').count()) === 1);
  await staff.page.screenshot({ path: shotPath('theme-admin-dark-dashboard'), fullPage: true });

  const ADMIN_PAGES = [
    ['/admin/moderation', 'Moderation queue', 'moderation'],
    ['/admin/reports', 'Report management', 'reports'],
    ['/admin/users', 'Student management', 'users'],
    [`/admin/users/${bilal.id}`, /Bilal Khan/, 'user-detail'],
    ['/admin/content', 'Content management', 'content'],
    ['/admin/communities', 'Community management', 'communities'],
    ['/admin/opportunities', /Opportunit/, 'opportunities'],
    ['/admin/analytics', /analytics/i, 'analytics'],
    ['/admin/audit-logs', 'Audit logs', 'audit-logs'],
    ['/admin/security', /Security/, 'security'],
  ];
  for (const variant of ['dark', 'light']) {
    const failed = [];
    for (const [path, heading, name] of ADMIN_PAGES) {
      const ok = await visit(staff.page, path, heading).catch((error) => (failed.push(`${path}: ${error.message.split('\n')[0]}`), true));
      if (!ok) failed.push(`${path}: ${errors.at(-1)}`);
      if (!(await noPageOverflow(staff.page))) failed.push(`${path}: horizontal overflow`);
      const low = await staff.page.evaluate(() => {
        const nodes = [...document.querySelectorAll('main h1, main h2, main p, main td, main th, main a, main dt, main dd, main span')].filter((node) => node.offsetParent && node.childElementCount === 0 && node.textContent.trim().length > 1).slice(0, 120);
        return nodes.map((node) => ({ text: node.textContent.trim().slice(0, 40), ratio: window.cxTheme.contrast(node) })).filter((item) => item.ratio < 4.5);
      });
      if (low.length) failed.push(`${path}: low contrast ${JSON.stringify(low.slice(0, 3))}`);
      await staff.page.screenshot({ path: shotPath(`theme-admin-${variant}-${name}`), fullPage: name === 'analytics' });
    }
    check(`Aurora Glass ${variant}: every admin page renders, fits, and keeps text ≥ 4.5:1`, failed.length === 0, failed);

    if (variant === 'dark') {
      section('Admin: tables, actions and dialogs');
      await staff.page.goto(`${web.url}/admin/users`);
      const row = staff.page.locator('tbody tr').first();
      await row.waitFor({ timeout: 15000 });
      const before = await row.boundingBox();
      await row.hover();
      await sleep(250);
      const after = await row.boundingBox();
      check('table rows give hover feedback without moving the layout', before.height === after.height && before.y === after.y && (await row.evaluate((element) => window.cxTheme.alphaOf(element) > 0)));
      await staff.page.goto(`${web.url}/admin/users/${bilal.id}`);
      await staff.page.getByRole('heading', { level: 1, name: /Bilal Khan/ }).waitFor();
      await staff.page.getByRole('button', { name: /^Suspend/ }).first().click();
      const confirm = staff.page.getByRole('dialog');
      await confirm.waitFor();
      await settle();
      check('confirmation dialogs are frosted glass with a clear danger state', await confirm.evaluate((element) => /blur/.test(getComputedStyle(element).backdropFilter) && Boolean(element.querySelector('.lucide-octagon-alert, .lucide-shield-question'))));
      check('no celebratory effects in moderation flows', (await staff.page.locator('[data-follow-spark], [data-follow-glow], canvas').count()) === 0);
      await staff.page.screenshot({ path: shotPath('theme-admin-dark-confirm') });
      await confirm.getByRole('button', { name: 'Cancel' }).click();
      await settle();
      check('Cancel closes it and nothing changed', (await staff.page.getByRole('dialog').count()) === 0 && (await db.collection('users').findOne({ _id: oid(bilal.id) })).status === 'active');
      await staff.page.goto(`${web.url}/admin/dashboard`);
      await staff.page.getByRole('heading', { level: 1, name: 'Command center' }).waitFor();
      await staff.page.getByRole('button', { name: /^Live alerts/ }).click();
      await settle();
      check('the live alerts popover is a frosted floating panel', await staff.page.locator('.admin-float').first().evaluate((element) => /blur/.test(getComputedStyle(element).backdropFilter)));
      await staff.page.keyboard.press('Escape');

      section('Admin: its own light/dark toggle');
      await staff.page.evaluate(() => (window.__viewTransitions = 0));
      await staff.page.getByRole('button', { name: /^Admin theme: Aurora Glass Dark/ }).click();
      await settle();
      check('the header toggle switches the admin to Aurora Glass Light', (await htmlClasses(staff.page)) === 'admin-theme theme-aurora' && (await bodyBg(staff.page)) === 'rgb(244, 243, 251)');
      check('…saved as the admin preference only (student theme untouched)', JSON.stringify(await saved(staff.page)) === JSON.stringify({ theme: 'light', style: 'campus', adminMode: 'light' }), await saved(staff.page));
      check('…with the same single crossfade', (await staff.page.evaluate(() => window.__viewTransitions)) === 1);
      await staff.page.goto(`${web.url}/admin/dashboard`);
      await staff.page.getByRole('heading', { level: 1, name: 'Command center' }).waitFor();
      await settle();
      await staff.page.screenshot({ path: shotPath('theme-admin-light-dashboard'), fullPage: true });
    }
  }

  section('Admin on a phone');
  const staffPhone = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await signIn(staffPhone.page, ada, /\/(home|onboarding|admin)/);
  await staffPhone.page.goto(`${web.url}/admin/reports`);
  await staffPhone.page.getByRole('heading', { level: 1, name: 'Report management' }).waitFor({ timeout: 20000 });
  await settle();
  check('phone: admin pages fit without horizontal scrolling (tables become cards)', await noPageOverflow(staffPhone.page));
  await staffPhone.page.screenshot({ path: shotPath('theme-admin-dark-phone-reports') });
  await staffPhone.page.getByRole('button', { name: 'Open navigation' }).click();
  const drawer = staffPhone.page.getByRole('dialog', { name: 'Admin navigation' });
  await drawer.waitFor();
  await settle();
  check('phone: the navigation drawer is frosted glass', await drawer.locator('nav[aria-label="Admin"]').evaluate((nav) => /blur/.test(getComputedStyle(nav.parentElement).backdropFilter)));
  await staffPhone.page.screenshot({ path: shotPath('theme-admin-dark-phone-drawer') });
  await staffPhone.page.keyboard.press('Escape');
  await settle();
  check('phone: Escape closes the drawer', (await drawer.count()) === 0);
  await staffPhone.context.close();

  section('Admin ⇄ student: each area keeps its own theme');
  await staff.page.getByRole('link', { name: 'Back to CampusX' }).first().click();
  await staff.page.waitForURL(/\/(home|onboarding)/);
  await settle();
  check('back in the student app: Campus Light again, admin classes gone', (await htmlClasses(staff.page)) === '' && (await bodyBg(staff.page)) === 'rgb(244, 247, 244)', await htmlClasses(staff.page));
  await staff.page.goto(`${web.url}/theme-studio`);
  await staff.page.getByRole('heading', { level: 1, name: 'Theme Studio' }).waitFor({ timeout: 20000 }).catch(() => {});
  if (await staff.page.getByRole('heading', { level: 1, name: 'Theme Studio' }).count()) {
    check('staff see the admin control center choice in Theme Studio, set to Light', (await staff.page.locator('input[name="admin-theme"]').count()) === 2 && (await staff.page.locator('input[name="admin-theme"][value="light"]').isChecked()));
    check('admin previews render with admin tokens', await staff.page.evaluate(() => getComputedStyle(document.querySelector('[data-theme-preview="admin-dark"]')).backgroundColor === 'rgb(7, 10, 28)'));
    await staff.page.locator('[data-theme-option="dark"]').click();
    await settle();
    check('choosing an admin variant there does not preview it on student pages', (await htmlClasses(staff.page)) === '');
    await staff.page.getByRole('button', { name: 'Apply' }).click();
    await settle();
    check('Apply saves the admin variant', (await saved(staff.page)).adminMode === 'dark');
    await staff.page.screenshot({ path: shotPath('theme-studio-staff'), fullPage: true });
  } else {
    // Staff without a campus profile are sent to onboarding by the campus guard; Theme Studio is a campus page.
    check('staff without a campus profile are routed to onboarding (campus guard unchanged)', /onboarding/.test(staff.page.url()));
  }
  await staff.context.close();

  section('Errors');
  check('no page errors or console errors', errors.length === 0, errors.slice(0, 8));
} catch (error) {
  check('suite ran to the end', false, error.stack);
} finally {
  await browser?.close();
  await t.finish();
}
