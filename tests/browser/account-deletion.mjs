// Account deletion in the browser: the Danger Zone at the very bottom of the profile (light, dark, phone,
// tablet), the confirmation dialog (password with show/hide, typed DELETE enabling the red button, validation,
// keyboard and focus), loading and duplicate-submission guard, wrong password / server error / network
// failure / rate limit (all keep the student signed in), success (signed out everywhere, local data cleared,
// socket closed, other tab signed out, confirmation on the login page), and the staff note.
import { PASSWORD, createSuite, oid, sleep } from '../lib/harness.mjs';
import { API_PORT } from '../lib/paths.mjs';
import { setRoleByScript } from '../lib/scripts.mjs';
import { launchBrowser, shotPath, startWeb } from '../lib/web.mjs';

const t = await createSuite('account-deletion-ui');
const { check, section, register, api, db } = t;
const web = await startWeb({ apiPort: API_PORT, name: 'web-account-deletion' });
t.cleanups.push(() => web.stop());
const { browser, reason } = await launchBrowser();

const WARNING = 'Deleting your account is permanent. Your account and associated personal data may not be recoverable.';
const SERVER_ERROR = "We couldn't delete your account right now, so nothing was removed. Please try again in a few minutes.";
const ACCOUNT_URL = '**/api/v1/auth/account';
const errors = [];

async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, ...options });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    // Refused requests in this suite are on purpose (422/429/500 and an aborted request).
    if (message.type() === 'error' && !/Failed to load resource|socket\.io|WebSocket|ERR_FAILED/i.test(message.text())) errors.push(message.text());
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

async function openProfile(page) {
  await page.goto(`${web.url}/profile`);
  await page.getByTestId('danger-zone').waitFor({ timeout: 15000 });
}

const noPageOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const dialogOf = (page) => page.getByRole('dialog', { name: 'Delete your account?' });
const finalButton = (page) => page.getByTestId('confirm-delete-account');

async function openDialog(page) {
  await page.getByTestId('danger-zone').getByRole('button', { name: 'Delete Account' }).click();
  await dialogOf(page).waitFor({ timeout: 5000 });
  return dialogOf(page);
}

/** Every DELETE /auth/account the page sends. */
function trackDeletes(page) {
  const sent = [];
  page.on('request', (request) => {
    if (request.method() === 'DELETE' && request.url().endsWith('/auth/account')) sent.push(request);
  });
  return sent;
}

try {
  if (!browser) throw new Error(reason);

  section('Danger Zone on the profile');
  const asha = await register('Asha', 'Rao');
  const bilal = await register('Bilal', 'Khan');
  const { context, page } = await newPage();
  await signIn(page, asha);
  await openProfile(page);
  const zone = page.getByTestId('danger-zone');
  check('a "Danger zone" section with the "Delete account" heading and the exact warning', (await zone.isVisible()) && /Danger zone/i.test(await zone.innerText()) && (await zone.getByRole('heading', { name: 'Delete account' }).isVisible()) && (await zone.innerText()).includes(WARNING));
  const deleteButton = zone.getByRole('button', { name: 'Delete Account' });
  check('a red "Delete Account" button with a trash icon', (await deleteButton.isVisible()) && (await deleteButton.locator('svg').count()) === 1 && (await deleteButton.evaluate((node) => getComputedStyle(node).backgroundColor)) === 'rgb(209, 67, 67)', await deleteButton.evaluate((node) => getComputedStyle(node).backgroundColor));
  const tint = await zone.evaluate((node) => ({ border: getComputedStyle(node).borderTopColor, background: getComputedStyle(node).backgroundColor }));
  // Tailwind mixes the alpha in oklab: a red hue has a clearly positive "a" (green-red) component.
  const redness = (color) => Number(/^oklab\(\S+ (-?[\d.]+)/.exec(color)?.[1] ?? NaN);
  check('red-tinted border and background', redness(tint.border) > 0.1 && redness(tint.background) > 0 && !/ \/ 0\)$/.test(tint.background), tint);
  const placement = await zone.evaluate((node) => {
    const top = node.getBoundingClientRect().top + window.scrollY;
    const others = [...document.querySelectorAll('main h2, main h3, main section, main [data-testid]')].filter((element) => element !== node && !node.contains(element) && !element.closest('[role="dialog"]'));
    return { last: node.parentElement.lastElementChild === node, below: others.every((element) => element.getBoundingClientRect().bottom + window.scrollY <= top + 1), count: others.length };
  });
  check('it is the last thing on the page, below every profile section and setting', placement.last && placement.below && placement.count > 3, placement);
  check('the rest of the profile still works: Edit profile, Change photo, Choose style, Semester Roadmap, Campus Journey, About', (await page.getByRole('link', { name: 'Edit profile' }).isVisible()) && (await page.getByRole('button', { name: 'Change photo' }).isVisible()) && (await page.getByRole('button', { name: 'Choose style' }).isVisible()) && (await page.getByTestId('semester-roadmap-button').isVisible()) && (await page.getByRole('heading', { name: 'Campus Journey' }).isVisible()) && (await page.getByRole('heading', { name: 'About' }).isVisible()));
  check('desktop: no horizontal overflow', await noPageOverflow(page));
  await zone.scrollIntoViewIfNeeded();
  await sleep(600);
  await page.screenshot({ path: shotPath('account-deletion-profile-light'), fullPage: true });

  section('The confirmation dialog');
  const dialog = await openDialog(page);
  check('it explains the deletion is permanent and lists what happens', (await dialog.innerText()).includes(WARNING) && /can't be undone/i.test(await dialog.innerText()) && /Anonymous Zone posts and comments stay anonymous/.test(await dialog.innerText()));
  const password = dialog.getByLabel('Current password');
  const confirmation = dialog.getByLabel('Type DELETE to confirm');
  check('a password field (hidden) and a confirmation field', (await password.getAttribute('type')) === 'password' && (await password.getAttribute('autocomplete')) === 'current-password' && (await confirmation.isVisible()));
  check('the red "Permanently Delete My Account" button starts disabled', (await finalButton(page).isDisabled()) && /Permanently Delete My Account/.test(await finalButton(page).innerText()) && (await finalButton(page).evaluate((node) => getComputedStyle(node).backgroundColor)) === 'rgb(209, 67, 67)');
  await password.fill('secret-typed-here1');
  await dialog.getByRole('button', { name: 'Show password' }).click();
  check('show/hide: Show reveals the password', (await password.getAttribute('type')) === 'text');
  await dialog.getByRole('button', { name: 'Hide password' }).click();
  check('show/hide: Hide masks it again', (await password.getAttribute('type')) === 'password');
  await confirmation.fill('delete');
  check('"delete" in lower case keeps the button disabled', await finalButton(page).isDisabled());
  await confirmation.fill('DELET');
  check('a partial word keeps it disabled', await finalButton(page).isDisabled());
  await confirmation.fill('DELETE');
  check('typing DELETE enables it', await finalButton(page).isEnabled());
  await page.keyboard.press('Escape');
  await dialogOf(page).waitFor({ state: 'hidden', timeout: 5000 });
  check('Escape closes it and focus returns to the Delete Account button', await deleteButton.evaluate((node) => node === document.activeElement));
  await page.keyboard.press('Enter');
  await dialogOf(page).waitFor({ timeout: 5000 });
  check('reopened (from the keyboard): the password and confirmation were cleared, the button is disabled again', (await dialogOf(page).getByLabel('Current password').inputValue()) === '' && (await dialogOf(page).getByLabel('Type DELETE to confirm').inputValue()) === '' && (await finalButton(page).isDisabled()));
  const sent = trackDeletes(page);
  await dialogOf(page).getByLabel('Type DELETE to confirm').fill('DELETE');
  await finalButton(page).click();
  await dialogOf(page).getByText('Please enter your password.').waitFor({ timeout: 5000 });
  check('validation: no password → "Please enter your password." on the field, nothing sent', sent.length === 0 && (await dialogOf(page).getByLabel('Current password').getAttribute('aria-invalid')) === 'true');
  check('validation: the empty password field gets the focus', await dialogOf(page).getByLabel('Current password').evaluate((node) => node === document.activeElement));
  await dialogOf(page).getByRole('button', { name: 'Cancel' }).click();
  await dialogOf(page).waitFor({ state: 'hidden', timeout: 5000 });
  check('Cancel closes it; nothing happened', sent.length === 0 && (await db.collection('users').findOne({ _id: oid(asha.id) }))?.status === 'active');

  section('Wrong password, loading state and duplicate submissions');
  const other = await newPage();
  await signIn(other.page, bilal);
  await openProfile(other.page);
  const bilalSent = trackDeletes(other.page);
  await other.page.route(ACCOUNT_URL, async (route) => {
    await sleep(1500);
    await route.continue();
  });
  const bilalDialog = await openDialog(other.page);
  await bilalDialog.getByLabel('Current password').fill('Wr0ngPassw0rd!x');
  await bilalDialog.getByLabel('Type DELETE to confirm').fill('DELETE');
  // Three clicks and a form submit in the same moment, before the page can re-render.
  await other.page.evaluate(() => {
    const button = document.querySelector('[data-testid="confirm-delete-account"]');
    button.click();
    button.click();
    button.click();
    document.getElementById(button.getAttribute('form'))?.requestSubmit();
  });
  await sleep(300);
  check('loading: the button says "Deleting your account…" and is disabled', /Deleting your account…/.test(await finalButton(other.page).innerText()) && (await finalButton(other.page).isDisabled()) && (await finalButton(other.page).getAttribute('aria-busy')) === 'true');
  check('loading: Cancel and the fields are disabled', (await bilalDialog.getByRole('button', { name: 'Cancel' }).isDisabled()) && (await bilalDialog.getByLabel('Current password').isDisabled()));
  await other.page.keyboard.press('Escape');
  check('loading: Escape does not close the dialog', await dialogOf(other.page).isVisible());
  await dialogOf(other.page).getByText('Your password is incorrect.').waitFor({ timeout: 10000 });
  check('only one request was sent', bilalSent.length === 1, bilalSent.length);
  check('wrong password: field error, the password cleared, the dialog stays, the button works again', (await dialogOf(other.page).getByLabel('Current password').inputValue()) === '' && (await finalButton(other.page).isEnabled()) && (await dialogOf(other.page).isVisible()));
  check('wrong password: still signed in on the profile (not sent to the login page)', other.page.url().endsWith('/profile') && (await db.collection('users').findOne({ _id: oid(bilal.id) }))?.status === 'active');
  await other.page.unroute(ACCOUNT_URL);

  section('Server error, network failure and rate limit');
  await other.page.route(ACCOUNT_URL, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, message: SERVER_ERROR, errors: [] }) }));
  await dialogOf(other.page).getByLabel('Current password').fill(PASSWORD);
  await finalButton(other.page).click();
  await dialogOf(other.page).getByRole('alert').filter({ hasText: SERVER_ERROR }).waitFor({ timeout: 5000 });
  check('server error: its message is shown in the dialog and the student stays signed in', other.page.url().endsWith('/profile') && (await finalButton(other.page).isEnabled()));
  await other.page.unroute(ACCOUNT_URL);
  await other.page.route(ACCOUNT_URL, (route) => route.abort('failed'));
  await finalButton(other.page).click();
  await dialogOf(other.page).getByText('Cannot reach CampusX right now').waitFor({ timeout: 5000 });
  check('network failure: a clear message, still signed in', other.page.url().endsWith('/profile'));
  await other.page.unroute(ACCOUNT_URL);
  // Four more wrong attempts from another session of the same student use up the allowance (5 per 15 min).
  const bilalApi = await t.login(bilal.email);
  for (let index = 0; index < 4; index += 1) await api('DELETE', '/auth/account', { token: bilalApi.data.accessToken, body: { password: `Wrong${index}Password!`, confirmation: 'DELETE' } });
  await finalButton(other.page).click();
  await dialogOf(other.page).getByText('Too many account deletion attempts').waitFor({ timeout: 5000 });
  check('rate limited: the limit message, nothing deleted, still signed in', other.page.url().endsWith('/profile') && (await db.collection('users').findOne({ _id: oid(bilal.id) }))?.status === 'active');
  await other.page.screenshot({ path: shotPath('account-deletion-dialog-error') });
  await other.context.close();

  section('Deleting the account');
  const secondTab = await context.newPage();
  await secondTab.goto(`${web.url}/home`);
  await secondTab.waitForURL(/\/home/);
  const sockets = [];
  page.on('websocket', (socket) => {
    // Socket.IO only (Vite's own dev-server socket stays open).
    if (!socket.url().includes('/socket.io/')) return;
    const item = { socket, closed: false };
    sockets.push(item);
    socket.on('close', () => {
      item.closed = true;
    });
  });
  await page.reload();
  await page.getByTestId('danger-zone').waitFor({ timeout: 15000 });
  await sleep(800);
  await page.evaluate((userId) => {
    localStorage.setItem(`campusx-anonymous-notice:${userId}`, '1');
  }, asha.id);
  check('setup: a live socket, the session hint and a per-account flag are stored', sockets.length > 0 && (await page.evaluate((userId) => localStorage.getItem('campusx-has-session') === '1' && localStorage.getItem(`campusx-anonymous-notice:${userId}`) === '1', asha.id)));
  const ashaDialog = await openDialog(page);
  await ashaDialog.getByLabel('Current password').fill(PASSWORD);
  await ashaDialog.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.screenshot({ path: shotPath('account-deletion-dialog-ready') });
  await finalButton(page).click();
  await page.waitForURL(/\/login$/, { timeout: 20000 });
  await page.getByText('Account deleted').waitFor({ timeout: 10000 });
  check('lands on the login page with a success message', (await page.getByText('Your CampusX account and its data have been permanently deleted.').isVisible()) && !(await page.getByText('Please log in to continue.').isVisible()));
  check('a success toast too', await page.locator('[data-toast="success"]', { hasText: 'Your account has been permanently deleted.' }).isVisible());
  check('the account is gone on the server', !(await db.collection('users').findOne({ _id: oid(asha.id) })));
  const stored = await page.evaluate((userId) => ({ hint: localStorage.getItem('campusx-has-session'), notice: localStorage.getItem(`campusx-anonymous-notice:${userId}`), onboarding: sessionStorage.getItem('campusx-onboarding') }), asha.id);
  check('local data cleared: session hint, per-account flag, onboarding draft', stored.hint === null && stored.notice === null && (stored.onboarding === null || !stored.onboarding.includes(asha.id)), stored);
  await sleep(1500);
  check('the live socket was closed', sockets.every((item) => item.closed), sockets.map((item) => item.closed));
  await secondTab.waitForURL(/\/login/, { timeout: 15000 });
  check('the other open tab was signed out too', secondTab.url().includes('/login'));
  await page.screenshot({ path: shotPath('account-deletion-login-after') });
  await page.goto(`${web.url}/profile`);
  await page.waitForURL(/\/login/, { timeout: 15000 });
  check('the profile is no longer reachable (back to the login page)', page.url().includes('/login'));
  await page.reload();
  check('the success message is not repeated after a reload', !(await page.getByText('Account deleted').isVisible()));
  await page.getByLabel('Email').fill(asha.email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByText('Invalid email or password.').waitFor({ timeout: 10000 });
  check('the old credentials no longer sign in', page.url().includes('/login'));
  await context.close();

  section('Staff accounts');
  const mod = await register('Mona', 'Kapoor');
  await setRoleByScript(t.stack.mongoUri, mod.email, 'moderator');
  const staff = await newPage();
  await signIn(staff.page, mod);
  await openProfile(staff.page);
  const staffZone = staff.page.getByTestId('danger-zone');
  check('moderators see the note instead of the button', /can't be deleted here/.test(await staffZone.innerText()) && (await staffZone.getByRole('button', { name: 'Delete Account' }).count()) === 0);
  await staff.context.close();

  section('Phone, tablet and dark mode');
  const dina = await register('Dina', 'Pereira');
  const phone = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  await signIn(phone.page, dina);
  await openProfile(phone.page);
  const phoneZone = phone.page.getByTestId('danger-zone');
  await phoneZone.scrollIntoViewIfNeeded();
  await sleep(600);
  const phoneBox = await phoneZone.getByRole('button', { name: 'Delete Account' }).boundingBox();
  check('phone: no horizontal overflow; the button fits on screen', (await noPageOverflow(phone.page)) && phoneBox.x >= 0 && phoneBox.x + phoneBox.width <= 390, phoneBox);
  const dark = await phoneZone.evaluate((node) => ({ dark: document.documentElement.classList.contains('dark'), background: getComputedStyle(node).backgroundColor, light: getComputedStyle(document.body).backgroundColor, heading: getComputedStyle(node.querySelector('h2')).color, button: getComputedStyle(node.querySelector('button')).backgroundColor }));
  check('dark mode: dark page, a faint red tint (not the light pink), light heading, dark-mode red button', dark.dark && redness(dark.background) > 0 && Number(/\/ ([\d.]+)\)$/.exec(dark.background)?.[1]) < 0.2 && dark.heading === 'rgb(230, 238, 232)' && dark.button === 'rgb(239, 103, 103)', dark);
  await phone.page.screenshot({ path: shotPath('account-deletion-phone-dark') });
  await phoneZone.getByRole('button', { name: 'Delete Account' }).tap();
  await dialogOf(phone.page).waitFor({ timeout: 5000 });
  await sleep(700);
  const sheet = await dialogOf(phone.page).boundingBox();
  check('phone: the dialog is a bottom sheet inside the screen', sheet.x >= 0 && sheet.width <= 390 && sheet.y + sheet.height <= 845, sheet);
  await dialogOf(phone.page).getByLabel('Type DELETE to confirm').fill('DELETE');
  const phoneFinal = await finalButton(phone.page).boundingBox();
  check('phone: the final button is reachable on screen', phoneFinal && phoneFinal.y + phoneFinal.height <= 845 && phoneFinal.x + phoneFinal.width <= 390, phoneFinal);
  await phone.page.screenshot({ path: shotPath('account-deletion-phone-dialog-dark') });
  await phone.context.close();
  const tablet = await newPage({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await signIn(tablet.page, dina);
  await openProfile(tablet.page);
  await tablet.page.getByTestId('danger-zone').scrollIntoViewIfNeeded();
  await sleep(600);
  check('tablet: no horizontal overflow, the section and button are visible', (await noPageOverflow(tablet.page)) && (await tablet.page.getByTestId('danger-zone').getByRole('button', { name: 'Delete Account' }).isVisible()));
  await tablet.page.screenshot({ path: shotPath('account-deletion-tablet-light') });
  await tablet.context.close();

  section('Console');
  check('no page errors or console errors', errors.length === 0, errors.slice(0, 5));
} catch (error) {
  check('suite ran to the end without crashing', false, error.stack ?? String(error));
} finally {
  await browser?.close();
}
await t.finish();
