// Follow and Message in the browser: profile buttons and counts, the follow animation (glow, sparks, tick,
// rolling count, avatar ring) and its reduced-motion version, hover "Unfollow", no duplicate requests,
// rollback when the server refuses, keyboard use, the followers/following dialog (tabs, search, infinite
// scroll, Escape and focus), follow buttons on search cards, the Message button opening the right
// conversation, sending, live delivery to a second browser, unread badge, "Seen", a failed send and retry,
// blocking, the follow notification, phone layout and dark mode.
import { PASSWORD, createSuite, mongoose, oid, sleep } from '../lib/harness.mjs';
import { API_PORT } from '../lib/paths.mjs';
import { launchBrowser, shotPath, startWeb } from '../lib/web.mjs';

const t = await createSuite('social-ui');
const { check, section, register, api, db } = t;
const web = await startWeb({ apiPort: API_PORT, name: 'web-social' });
t.cleanups.push(() => web.stop());
const { browser, reason } = await launchBrowser();

const errors = [];
async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, ...options });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource|socket\.io|WebSocket|status of 500/i.test(message.text())) errors.push(message.text());
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

const followButton = (page, name) => page.locator('button[data-follow-state]').filter({ hasText: name }).first();
const stateOf = (button) => button.getAttribute('data-follow-state');
const statsText = (page, userId) => page.locator(`[data-follow-stats="${userId}"]`).innerText();
const noPageOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const followRows = (filter) => db.collection('follows').countDocuments(filter);

try {
  if (!browser) throw new Error(reason);

  section('Setup');
  const asha = await register('Asha', 'Rao');
  const bilal = await register('Bilal', 'Khan');
  const chitra = await register('Chitra', 'Iyer');
  const { context, page } = await newPage();
  await signIn(page, asha);
  const followRequests = [];
  page.on('request', (request) => {
    if (/\/users\/[a-f\d]{24}\/follow$/.test(request.url())) followRequests.push(request.method());
  });

  section('Profile buttons');
  await page.goto(`${web.url}/profile/${bilal.id}`);
  const follow = followButton(page, 'Bilal Khan');
  await follow.waitFor({ timeout: 15000 });
  check('Follow is shown, green, on another student’s profile', (await stateOf(follow)) === 'not-following' && /\bFollow\b/.test(await follow.innerText()) && /bg-primary/.test(await follow.getAttribute('class')));
  check('its accessible name says who', (await page.getByRole('button', { name: 'Follow Bilal Khan', exact: true }).count()) === 1);
  check('Message sits beside it', await page.getByRole('button', { name: 'Message Bilal Khan' }).isVisible());
  await page.getByRole('button', { name: 'More options for Bilal Khan' }).click();
  check('Report and Block are in the ⋮ menu', (await page.getByRole('menuitem', { name: 'Report' }).isVisible()) && (await page.getByRole('menuitem', { name: 'Block' }).isVisible()));
  await page.keyboard.press('Escape');
  await sleep(300);
  check('Escape closes the menu and returns focus to it', (await page.getByRole('menu').count()) === 0 && (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'More options for Bilal Khan');
  check('all profile actions fit on one row on a laptop', await page.evaluate(() => {
    const tops = [...document.querySelectorAll('button[data-follow-state], button[aria-label="More options for Bilal Khan"]')].filter((node) => node.offsetParent).map((node) => Math.round(node.getBoundingClientRect().top));
    return tops.length === 2 && Math.abs(tops[0] - tops[1]) < 6;
  }));
  check('counts read 0 followers · 0 following', /0\s*followers[\s\S]*0\s*following/.test(await statsText(page, bilal.id)), await statsText(page, bilal.id));
  await page.screenshot({ path: shotPath('social-profile-before') });

  section('Following: the animation and the result');
  await follow.click();
  await sleep(120);
  const sparks = await page.locator('[data-follow-spark]').count();
  const glow = await page.locator('[data-follow-glow]').count();
  const ring = await page.locator('[data-avatar-glow]').count();
  check('optimistic: Following at once', (await stateOf(follow)) === 'following');
  check('a few "+" sparks and a green glow appear', sparks >= 4 && sparks <= 8 && glow === 1, { sparks, glow });
  check("the profile photo's ring glows", ring === 1);
  await sleep(260);
  await page.screenshot({ path: shotPath('social-follow-burst') });
  await sleep(1100);
  check('sparks and glow are gone again (short and not distracting)', (await page.locator('[data-follow-spark], [data-follow-glow], [data-avatar-glow]').count()) === 0);
  check('the follower count rolled to 1 follower', /1\s*follower\b/.test(await statsText(page, bilal.id)), await statsText(page, bilal.id));
  check('success is said in words for screen readers', (await page.getByRole('status').filter({ hasText: "You're now following Bilal Khan." }).count()) === 1);
  check('label reads Following (not only a tick)', /Following/.test(await follow.innerText()));
  check('saved: one relationship, one request', (await followRows({ follower: oid(asha.id), following: oid(bilal.id) })) === 1 && followRequests.filter((method) => method === 'POST').length === 1);
  check('right after following, the pointer still on it does not flash "Unfollow"', !/Unfollow/.test(await follow.innerText()));
  await page.mouse.move(5, 5);
  await follow.hover();
  await sleep(250);
  check('hovering Following turns it into a red Unfollow', /Unfollow/.test(await follow.innerText()) && /danger/.test(await follow.getAttribute('class')));
  await page.screenshot({ path: shotPath('social-unfollow-hover') });

  section('Unfollowing');
  await follow.click();
  await page.waitForFunction(() => document.querySelector('button[data-follow-state]')?.getAttribute('data-follow-state') === 'not-following');
  await sleep(500);
  check('back to Follow, count rolls down to 0', (await stateOf(follow)) === 'not-following' && /0\s*followers/.test(await statsText(page, bilal.id)));
  check('no celebration on unfollow', (await page.locator('[data-follow-spark]').count()) === 0);
  check('relationship removed', (await followRows({ follower: oid(asha.id), following: oid(bilal.id) })) === 0);

  section('No duplicate requests');
  followRequests.length = 0;
  await page.evaluate(() => {
    const button = document.querySelector('button[data-follow-state]');
    for (let index = 0; index < 6; index += 1) button.click();
  });
  await sleep(1200);
  check('six fast clicks → one request, one relationship', followRequests.length === 1 && (await followRows({ follower: oid(asha.id), following: oid(bilal.id) })) === 1, followRequests);
  check('a spinner showed while it was in flight is gone, button enabled', (await follow.getAttribute('aria-busy')) === null);

  section('Rollback when the server refuses');
  await follow.click(); // unfollow first, and wait until the server has answered
  await page.waitForFunction(() => {
    const button = document.querySelector('button[data-follow-state]');
    return button?.getAttribute('data-follow-state') === 'not-following' && !button.hasAttribute('aria-busy');
  });
  await sleep(600);
  await page.route('**/users/*/follow', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Something went wrong on our side.' }) }));
  const states = [];
  await page.exposeFunction('recordFollowState', (value) => states.push(value));
  await page.evaluate(() => {
    const button = document.querySelector('button[data-follow-state]');
    new MutationObserver(() => window.recordFollowState(button.getAttribute('data-follow-state'))).observe(button, { attributes: true, attributeFilter: ['data-follow-state'] });
  });
  await follow.click();
  await page.waitForFunction(() => {
    const button = document.querySelector('button[data-follow-state]');
    return button?.getAttribute('data-follow-state') === 'not-following' && !button.hasAttribute('aria-busy');
  }, null, { timeout: 5000 });
  await sleep(900);
  check('it showed Following at once, then went back when the server refused', states[0] === 'following' && states.at(-1) === 'not-following', states);
  check('failed follow rolled back to Follow and 0 followers', (await stateOf(follow)) === 'not-following' && /^0\s*followers/.test(await statsText(page, bilal.id)), await statsText(page, bilal.id));
  check('an error toast explains it', await page.getByText('Something went wrong on our side.').first().isVisible());
  await page.unroute('**/users/*/follow');

  section('Keyboard');
  await follow.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('button[data-follow-state]')?.getAttribute('data-follow-state') === 'following');
  check('Enter follows; focus stays on the button', await follow.evaluate((node) => document.activeElement === node || node.contains(document.activeElement)));
  await sleep(900);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await sleep(250);
  check('keyboard focus shows the Unfollow warning too, with a visible focus ring', /Unfollow/.test(await follow.innerText()) && (await follow.evaluate((node) => getComputedStyle(node).outlineStyle)) !== 'none');

  section('Followers and following dialog');
  const crowd = Array.from({ length: 30 }, (_, index) => ({ _id: new mongoose.Types.ObjectId(), email: `fan${index}@bulk.campusx.dev`, passwordHash: 'x', firstName: `Fan${String(index).padStart(2, '0')}`, lastName: 'Joshi', role: 'student', status: 'active', onboardingCompleted: true, college: 'vnit-nagpur', branch: 'it', semester: 3, interests: [], skills: [], bio: '', createdAt: new Date(), updatedAt: new Date() }));
  await db.collection('users').insertMany(crowd);
  await sleep(1100);
  await db.collection('follows').insertMany(crowd.map((student) => ({ follower: student._id, following: oid(bilal.id), followerActive: true, followingActive: true, createdAt: new Date() })));
  await page.reload();
  await page.locator(`[data-follow-stats="${bilal.id}"]`).waitFor();
  check('reload shows the real count (31 followers)', /31\s*followers/.test(await statsText(page, bilal.id)), await statsText(page, bilal.id));
  const trigger = page.locator(`[data-follow-stats="${bilal.id}"] button`).first();
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.locator('[data-student-id]').first().waitFor({ timeout: 10000 });
  check('dialog opens with the URL ?list=followers', /[?&]list=followers/.test(page.url()));
  check('first page: 20 students', (await dialog.locator('[data-student-id]').count()) === 20, await dialog.locator('[data-student-id]').count());
  const firstRow = dialog.locator('[data-student-id]').first();
  check('each row: photo, name, campus, follow button', (await firstRow.locator('button[data-follow-state]').count()) === 1 && /\bIT\b/.test(await firstRow.innerText()), { buttons: await firstRow.locator('button[data-follow-state]').count(), text: await firstRow.innerText() });
  await page.screenshot({ path: shotPath('social-followers-dialog') });
  await dialog.locator('[data-student-id]').last().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] [data-student-id]').length === 31, null, { timeout: 8000 }).catch(() => {});
  check('scrolling loads the rest (31, no repeats)', (await dialog.locator('[data-student-id]').count()) === 31 && new Set(await dialog.locator('[data-student-id]').evaluateAll((rows) => rows.map((row) => row.dataset.studentId))).size === 31);
  check('you are marked "You", not given a follow button', (await dialog.locator(`[data-student-id="${asha.id}"]`).getByText('You', { exact: true }).isVisible()) && (await dialog.locator(`[data-student-id="${asha.id}"] button[data-follow-state]`).count()) === 0);
  await dialog.getByRole('searchbox').fill('fan0');
  await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] [data-student-id]').length === 10, null, { timeout: 8000 }).catch(() => {});
  check('search narrows to Fan00–Fan09', (await dialog.locator('[data-student-id]').count()) === 10);
  await dialog.getByRole('searchbox').fill('zzzz');
  await dialog.getByText('No one matches that name').waitFor({ timeout: 8000 }).catch(() => {});
  check('a search with no match says so', await dialog.getByText('No one matches that name').isVisible());
  await dialog.getByRole('tab', { name: /Followers/ }).focus();
  await page.keyboard.press('ArrowRight');
  await sleep(600);
  check('arrow keys move to the Following tab (URL follows)', (await dialog.getByRole('tab', { name: /Following/ }).getAttribute('aria-selected')) === 'true' && /list=following/.test(page.url()));
  check('Bilal follows nobody: empty state', await dialog.getByText('Not following anyone yet').isVisible().catch(() => false));
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  check('Escape closes it, the URL drops ?list, focus goes back to the counts', (await page.getByRole('dialog').count()) === 0 && !/list=/.test(page.url()) && (await page.evaluate(() => Boolean(document.activeElement?.closest('[data-follow-stats]')))));

  section('Follow state everywhere');
  await page.goto(`${web.url}/search?q=Bilal&type=students`);
  const card = page.locator(`[data-student-id="${bilal.id}"]`).first();
  await card.waitFor({ timeout: 15000 });
  await card.locator('button[data-follow-state]').waitFor({ timeout: 8000 });
  check('the search card shows Following for Bilal (same state as the profile)', (await card.locator('button[data-follow-state]').getAttribute('data-follow-state')) === 'following');
  await page.goto(`${web.url}/search?q=Chitra&type=students`);
  const chitraCard = page.locator(`[data-student-id="${chitra.id}"]`).first();
  await chitraCard.locator('button[data-follow-state]').waitFor({ timeout: 15000 });
  await chitraCard.locator('button[data-follow-state]').click();
  await sleep(800);
  check('following from a card works and is saved', (await followRows({ follower: oid(asha.id), following: oid(chitra.id) })) === 1);
  await page.goto(`${web.url}/profile`);
  await page.locator(`[data-follow-stats="${asha.id}"]`).waitFor({ timeout: 15000 });
  check('own profile: counts, no Follow or Message', /2\s*following/.test(await statsText(page, asha.id)) && (await page.locator('button[data-follow-state]').count()) === 0 && (await page.getByRole('button', { name: /^Message/ }).count()) === 0);
  check('own profile still has Edit profile', await page.getByRole('link', { name: 'Edit profile' }).isVisible());

  section('Reduced motion');
  const calm = await newPage({ reducedMotion: 'reduce' });
  await signIn(calm.page, chitra);
  await calm.page.goto(`${web.url}/profile/${bilal.id}`);
  const calmFollow = followButton(calm.page, 'Bilal Khan');
  await calmFollow.waitFor({ timeout: 15000 });
  await calmFollow.click();
  await sleep(120);
  check('reduced motion: no sparks, glow or ring', (await calm.page.locator('[data-follow-spark], [data-follow-glow], [data-avatar-glow]').count()) === 0);
  await sleep(500);
  check('…but the result is the same: Following and 32 followers', (await stateOf(calmFollow)) === 'following' && /32\s*followers/.test(await statsText(calm.page, bilal.id)));
  await calm.context.close();

  section('Messages: open, send, live delivery');
  await page.goto(`${web.url}/profile/${bilal.id}`);
  await page.getByRole('button', { name: 'Message Bilal Khan' }).click();
  await page.waitForURL(/\/messages\/[a-f\d]{24}$/, { timeout: 10000 });
  const conversationId = page.url().split('/').pop();
  check('Message opens the conversation page', Boolean(conversationId));
  await page.getByText('This is the start of your conversation').waitFor({ timeout: 10000 });
  check('a new conversation shows a friendly empty state with who it is', await page.getByRole('link', { name: /Bilal Khan/ }).first().isVisible());
  check('the message box has focus', await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA'));
  check('messaging followed nobody new', (await followRows({ follower: oid(bilal.id) })) === 0);

  const other = await newPage();
  await signIn(other.page, bilal);
  await other.page.goto(`${web.url}/home`);
  await page.getByLabel('Message', { exact: true }).fill('Hi Bilal! Are you coming to the robotics demo?');
  await page.keyboard.press('Enter');
  await page.locator('[data-message-status="sent"]').first().waitFor({ timeout: 8000 });
  check('sent: the bubble appears and is confirmed', /robotics demo/.test(await page.locator('[data-message-status="sent"]').first().innerText()));
  check('saved once', (await db.collection('messages').countDocuments({ conversation: oid(conversationId) })) === 1);
  const messagesLink = other.page.locator('aside a[href="/messages"]');
  await other.page.waitForFunction(() => /1 unread conversation/.test(document.querySelector('aside a[href="/messages"]')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => {});
  check("the other student's Messages link shows 1 unread, live", /1 unread conversation/.test(await messagesLink.textContent()) && (await messagesLink.getByText('1', { exact: true }).isVisible()));
  await other.page.goto(`${web.url}/messages`);
  const row = other.page.locator(`[data-conversation-id="${conversationId}"]`);
  await row.waitFor({ timeout: 10000 });
  check('inbox row: name, preview, unread count', /Asha Rao/.test(await row.innerText()) && /robotics demo/.test(await row.innerText()) && /1\s*unread/.test(await row.innerText()));
  await other.page.screenshot({ path: shotPath('social-inbox') });
  await row.click();
  await other.page.getByRole('log').getByText('Are you coming to the robotics demo?').waitFor({ timeout: 8000 });
  await page.locator('text=Seen').first().waitFor({ timeout: 8000 }).catch(() => {});
  check('opening it marks it read: the sender sees "Seen"', await page.getByText('Seen', { exact: true }).isVisible().catch(() => false));
  await page.getByLabel('Message', { exact: true }).fill('Bring the line follower too 🙂');
  await page.keyboard.press('Enter');
  await other.page.getByRole('log').getByText('Bring the line follower too').waitFor({ timeout: 8000 }).catch(() => {});
  check('a new message arrives live in the open chat, no reload', await other.page.getByRole('log').getByText('Bring the line follower too').isVisible().catch(() => false));
  await other.page.getByLabel('Message', { exact: true }).fill('Yes! See you at 5.');
  await other.page.keyboard.press('Enter');
  await page.getByRole('log').getByText('Yes! See you at 5.').waitFor({ timeout: 8000 }).catch(() => {});
  check('and the reply arrives live for the first student', await page.getByRole('log').getByText('Yes! See you at 5.').isVisible().catch(() => false));
  await page.screenshot({ path: shotPath('social-chat-desktop') });

  section('A failed send and retry');
  await page.route('**/conversations/*/messages', (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Message not sent: server error.' }) }) : route.continue()));
  await page.getByLabel('Message', { exact: true }).fill('This one hits a server error');
  await page.keyboard.press('Enter');
  await page.locator('[data-message-status="failed"]').waitFor({ timeout: 8000 });
  check('failed: shown in red with Retry', await page.getByRole('button', { name: /Retry/ }).isVisible());
  await page.unroute('**/conversations/*/messages');
  await page.getByRole('button', { name: /Retry/ }).click();
  await page.waitForFunction(() => !document.querySelector('[data-message-status="failed"]'), null, { timeout: 8000 }).catch(() => {});
  check('retry sends it once', (await page.locator('[data-message-status="failed"]').count()) === 0 && (await db.collection('messages').countDocuments({ text: 'This one hits a server error' })) === 1);

  section('Blocking');
  await other.page.getByRole('button', { name: /Options for your conversation/ }).click();
  await other.page.getByRole('menuitem', { name: 'Block' }).click();
  await other.page.getByRole('dialog').getByRole('button', { name: 'Block' }).click();
  await other.page.getByText('You blocked Asha Rao').waitFor({ timeout: 8000 }).catch(() => {});
  check('the blocker sees why the box is gone, with Unblock', await other.page.getByText('You blocked Asha Rao').isVisible().catch(() => false));
  check('blocking ended the follow', (await followRows({ follower: oid(asha.id), following: oid(bilal.id) })) === 0);
  await page.goto(`${web.url}/profile/${bilal.id}`);
  await page.getByRole('heading', { name: 'Bilal Khan' }).waitFor({ timeout: 10000 });
  await sleep(500);
  check('the blocked student sees no Follow or Message on the profile', (await page.locator('button[data-follow-state]').count()) === 0 && (await page.getByRole('button', { name: 'Message Bilal Khan' }).count()) === 0);
  await page.goto(`${web.url}/messages/${conversationId}`);
  await page.getByText(/can’t send messages to Bilal Khan/).waitFor({ timeout: 8000 }).catch(() => {});
  check('…and in the chat the history stays but the box is replaced', (await page.getByText(/can’t send messages to Bilal Khan/).isVisible().catch(() => false)) && (await page.getByRole('log').getByText('Yes! See you at 5.').isVisible()));
  await other.page.getByRole('button', { name: 'Unblock' }).first().click();
  await other.page.getByRole('dialog').getByRole('button', { name: 'Unblock' }).click();
  await other.page.getByLabel('Message', { exact: true }).waitFor({ timeout: 8000 }).catch(() => {});
  check('unblocking brings the message box back', await other.page.getByLabel('Message', { exact: true }).isVisible().catch(() => false));

  section('Notification');
  await page.goto(`${web.url}/profile/${bilal.id}`);
  await followButton(page, 'Bilal Khan').click();
  await sleep(1000);
  await other.page.goto(`${web.url}/notifications`);
  await other.page.getByText('Asha Rao started following you.').first().waitFor({ timeout: 8000 }).catch(() => {});
  check('"Asha Rao started following you." in the notification center', await other.page.getByText('Asha Rao started following you.').first().isVisible().catch(() => false));
  await other.page.goto(`${web.url}/profile`);
  await other.page.locator(`[data-follow-stats="${bilal.id}"]`).waitFor({ timeout: 10000 });
  const before = await statsText(other.page, bilal.id);
  await api('DELETE', `/users/${bilal.id}/follow`, { token: (await t.relogin(chitra)).token });
  await sleep(1200);
  const after = await statsText(other.page, bilal.id);
  check("someone unfollowing updates the followed student's open profile live", /32\s*followers/.test(before) && /31\s*followers/.test(after), { before, after });

  section('Phone layout');
  const phone = await newPage({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });
  await signIn(phone.page, asha);
  await phone.page.goto(`${web.url}/profile/${bilal.id}`);
  await followButton(phone.page, 'Bilal Khan').waitFor({ timeout: 15000 });
  check('profile actions fit a phone (no sideways scroll)', await noPageOverflow(phone.page));
  check('on a phone the ⋮ menu sits in the header corner and Follow + Message share one row', await phone.page.evaluate(() => {
    const visible = (selector) => [...document.querySelectorAll(selector)].filter((node) => node.offsetParent);
    const [menu] = visible('button[aria-label="More options for Bilal Khan"]');
    const [followButton] = visible('button[data-follow-state]');
    const [message] = visible('button').filter((node) => /^Message/.test(node.textContent.trim()));
    if (!menu || !followButton || !message) return false;
    const box = (node) => node.getBoundingClientRect();
    return box(menu).top < box(followButton).top - 40 && Math.abs(box(followButton).top - box(message).top) < 4 && box(menu).right <= window.innerWidth;
  }));
  await phone.page.screenshot({ path: shotPath('social-profile-phone') });
  await phone.page.goto(`${web.url}/messages`);
  await phone.page.locator(`[data-conversation-id="${conversationId}"]`).click();
  await phone.page.getByLabel('Message', { exact: true }).waitFor({ timeout: 8000 });
  check('phone chat: back button, message box in reach, no overflow', (await phone.page.getByRole('link', { name: 'Back to all messages' }).isVisible()) && (await noPageOverflow(phone.page)) && (await phone.page.getByLabel('Message', { exact: true }).boundingBox()).y < 760);
  await phone.page.screenshot({ path: shotPath('social-chat-phone') });
  await phone.context.close();

  section('Dark mode');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
  });
  await page.goto(`${web.url}/profile/${bilal.id}`);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await followButton(page, 'Bilal Khan').waitFor({ timeout: 10000 });
  await sleep(600);
  await page.screenshot({ path: shotPath('social-profile-dark') });
  check('dark mode renders the profile with the follow button', await followButton(page, 'Bilal Khan').isVisible());

  check('no page errors', errors.length === 0, errors.slice(0, 5));
  await other.context.close();
  await context.close();
} catch (error) {
  check('suite crashed', false, error?.stack ?? String(error));
} finally {
  await browser?.close();
  await t.finish();
}
