// Elite rank identities in the browser: Gold/Silver/Bronze frames, metal names and tokens on the leaderboard,
// podium, profile header and student cards (and nothing for #4 and below); photos, initials and long names;
// the Hall of Fame (holders, previous holders, records, transfers, keyboard tabs); a live token transfer with
// the celebration and its reduced-motion version; no layout shift when a frame goes; phone layout; readable
// names and tokens in all four app themes; and neutral fallbacks when the elite API fails.
import { PASSWORD, createSuite, sleep } from '../lib/harness.mjs';
import { JPG, jpg } from '../lib/files.mjs';
import { API_PORT } from '../lib/paths.mjs';
import { launchBrowser, shotPath, startWeb } from '../lib/web.mjs';

const t = await createSuite('elite-ranks-ui', { cloudinary: true });
const { check, section, register, api, must, upload } = t;
const web = await startWeb({ apiPort: API_PORT, name: 'web-elite' });
t.cleanups.push(() => web.stop());
const { browser, reason } = await launchBrowser();

const errors = [];
async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, colorScheme: 'light', ...options });
  const page = await context.newPage();
  // Uploaded photos get Cloudinary URLs from the stand-in: serve the test photo for them.
  await context.route('https://res.cloudinary.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/jpeg', body: JPG }));
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource|socket\.io|WebSocket|status of 50\d/i.test(message.text())) errors.push(message.text());
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

const setTheme = (page, theme, style) => page.evaluate(([value, look]) => localStorage.setItem('campusx-theme', JSON.stringify({ state: { theme: value, style: look, adminMode: 'dark' }, version: 0 })), [theme, style]);
const noPageOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const holders = async (who) => ((await api('GET', '/rankings/elite', { token: who.token })).data?.holders ?? []).map((holder) => holder.student?.id ?? null);
async function holdersBecome(who, expected, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if ((await holders(who)).join() === expected.join()) return true;
    await sleep(250);
  }
  return false;
}

// Contrast of an element's text colour against what it really sits on (translucent layers composited), and
// boxes for frames, photos and emblems.
const MEASURE = () => {
  const rgba = (color) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const over = (top, bottom) => {
    const alpha = top[3] + bottom[3] * (1 - top[3]);
    return [0, 1, 2].map((i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / (alpha || 1)).concat(alpha);
  };
  const luminance = ([r, g, b]) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const background = (element) => {
    const layers = [];
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) layers.push(rgba(getComputedStyle(node).backgroundColor));
    let bg = rgba(getComputedStyle(document.body).backgroundColor);
    if (bg[3] < 1) bg = over(bg, [255, 255, 255, 1]);
    for (const layer of layers.reverse()) if (layer[3] > 0) bg = over(layer, bg);
    return bg;
  };
  window.eliteContrast = (element, color = getComputedStyle(element).color) => {
    const bg = background(element);
    const fg = over(rgba(color), bg);
    const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
    return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
  };
  window.eliteBox = (element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, w: box.width, h: box.height };
  };
};

/** Every elite name and token on the page, with the contrast of its colour(s) on what it sits on. */
const eliteContrasts = (page) =>
  page.evaluate(() => {
    const names = [...document.querySelectorAll('.elite-name')].filter((node) => node.offsetParent).map((node) => {
      const style = getComputedStyle(node);
      const stops = [style.getPropertyValue('--elite-ink'), style.getPropertyValue('--elite-deep'), style.getPropertyValue('--elite-shine')].map((value) => value.trim()).filter(Boolean);
      return { kind: 'name', text: node.textContent.slice(0, 24), worst: Math.min(window.eliteContrast(node), ...stops.map((stop) => window.eliteContrast(node, stop))) };
    });
    const tokens = [...document.querySelectorAll('.elite-token:not(.elite-token--icon)')].filter((node) => node.offsetParent).map((node) => ({ kind: 'token', text: node.textContent.slice(0, 24), worst: window.eliteContrast(node) }));
    return [...names, ...tokens];
  });

try {
  if (!browser) throw new Error(reason);

  section('Setup: five students, the top three hold the tokens');
  const asha = await register('Asha', 'Rao');
  await must(upload('/profile/avatar', asha.token, 'photo', [jpg()]), 'asha avatar');
  const bilal = await register('Bilal', 'Khan'); // no photo: initials
  const chitra = await register('Chitralekha', 'Venkataraghavan-Subramaniam'); // a long name
  const dev = await register('Dev', 'Patel');
  const esha = await register('Esha', 'Nair');
  check('tokens: Asha Gold, Bilal Silver, Chitralekha Bronze', await holdersBecome(asha, [asha.id, bilal.id, chitra.id]));

  const { context, page } = await newPage();
  await page.addInitScript(MEASURE);
  await signIn(page, asha);

  section('Leaderboard: Rank #1, #2 and #3 get their token, frame and name; #4 and below nothing');
  await page.goto(`${web.url}/rankings`);
  await page.locator('[data-podium-rank="1"]:visible').waitFor({ timeout: 20000 });
  await page.locator('[data-podium-rank="1"]:visible [data-elite-frame="gold"]').waitFor({ timeout: 15000 });
  for (const [rank, tier] of [[1, 'gold'], [2, 'silver'], [3, 'bronze']]) {
    const place = page.locator(`[data-podium-rank="${rank}"]:visible`);
    const parts = await place.evaluate((node, id) => ({
      frame: Boolean(node.querySelector(`[data-elite-frame="${id}"] .elite-frame__ring`)),
      emblem: Boolean(node.querySelector(`[data-elite-frame="${id}"] .elite-frame__emblem`)),
      name: node.querySelector(`.elite-name--${id}`)?.className ?? '',
      token: node.querySelector(`[data-elite-token="${id}"]`)?.textContent ?? '',
    }), tier);
    check(`#${rank}: ${tier} frame with emblem, shining ${tier} name, token in words`, parts.frame && parts.emblem && /elite-name--shine/.test(parts.name) && new RegExp(`${tier === 'gold' ? 'Golden Champion' : tier === 'silver' ? 'Silver Elite' : 'Bronze Elite'}, CampusX rank ${rank}`).test(parts.token), parts);
  }
  const fourth = await page.locator('[data-rank="4"]').evaluate((node) => ({ frame: node.querySelector('[data-elite-frame]')?.getAttribute('data-elite-frame') ?? null, ring: Boolean(node.querySelector('.elite-frame__ring')), name: Boolean(node.querySelector('.elite-name')), token: Boolean(node.querySelector('.elite-token')) }));
  const fifth = await page.locator('[data-rank="5"]').evaluate((node) => Boolean(node.querySelector('.elite-frame__ring, .elite-name, .elite-token')));
  check('#4: normal name and photo (no frame, metal or token)', !fourth.frame && !fourth.ring && !fourth.name && !fourth.token && !fifth, fourth);
  const goldName = await page.locator('[data-podium-rank="1"]:visible .elite-name').evaluate((node) => {
    const style = getComputedStyle(node);
    return { color: style.color, fill: style.webkitTextFillColor, image: style.backgroundImage, clip: style.webkitBackgroundClip || style.backgroundClip, contrast: window.eliteContrast(node) };
  });
  check('gold name: gradient text over a solid, readable gold (≥ 4.5:1)', /gradient/.test(goldName.image) && /text/.test(goldName.clip) && goldName.fill === 'rgba(0, 0, 0, 0)' && goldName.contrast >= 4.5 && goldName.color === 'rgb(122, 82, 0)', goldName);
  const geometry = await page.locator('[data-podium-rank="1"]:visible [data-elite-frame="gold"]').evaluate((frame) => {
    const avatar = frame.firstElementChild;
    const ring = frame.querySelector('.elite-frame__ring');
    const emblem = frame.querySelector('.elite-frame__emblem');
    const [a, r, e] = [avatar, ring, emblem].map(window.eliteBox);
    const img = avatar.querySelector('img');
    const centre = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    return {
      avatar: [a.w, a.h],
      ringOutside: r.x <= a.x - 2.5 && r.y <= a.y - 2.5 && r.x + r.w >= a.x + a.w + 2.5 && r.y + r.h >= a.y + a.h + 2.5,
      emblemClearOfFace: !(e.x <= centre.x && centre.x <= e.x + e.w && e.y <= centre.y && centre.y <= e.y + e.h) && e.w * e.h < a.w * a.h * 0.15,
      photo: img ? { fit: getComputedStyle(img).objectFit, w: img.getBoundingClientRect().width } : null,
    };
  });
  check('frame sits outside the photo (not over the face), emblem in the corner, photo uncropped (56 px, object-fit cover)', geometry.ringOutside && geometry.emblemClearOfFace && geometry.avatar.join() === '56,56' && geometry.photo?.fit === 'cover' && geometry.photo.w === 56, geometry);
  const bilalPodium = await page.locator('[data-podium-rank="2"]:visible [data-elite-frame="silver"]').evaluate((frame) => ({ initials: frame.firstElementChild.textContent.trim(), img: Boolean(frame.querySelector('img')) }));
  check('a student without a photo: initials inside the silver frame', bilalPodium.initials.startsWith('BK') && !bilalPodium.img, bilalPodium);
  await page.screenshot({ path: shotPath('elite-rankings-desktop') });

  section('Profile header, student cards and the Hall of Fame entry');
  await page.goto(`${web.url}/profile/${bilal.id}`);
  await page.locator('h1').first().waitFor({ timeout: 20000 });
  await page.locator('[data-elite-frame="silver"]').first().waitFor({ timeout: 10000 });
  const header = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const frame = document.querySelector('[data-elite-frame="silver"]');
    return {
      name: h1.querySelector('.elite-name--silver.elite-name--shine') !== null,
      token: document.querySelector('[data-elite-token="silver"]')?.textContent ?? '',
      inside: frame.classList.contains('elite-frame--inside') && frame.classList.contains('elite-frame--glow'),
      initials: frame.textContent.trim().startsWith('BK'),
      animation: getComputedStyle(h1.querySelector('.elite-name')).animationName,
    };
  });
  check('profile header: silver frame (in place of the theme ring), shining name, "Silver Elite #2" token, initials kept', header.name && /Silver Elite#2/.test(header.token) && header.inside && header.initials && header.animation === 'elite-shine', header);
  await page.goto(`${web.url}/profile/${asha.id}`);
  await page.locator('[data-elite-frame="gold"]').first().waitFor({ timeout: 10000 });
  const glow = await page.locator('[data-elite-frame="gold"]').first().evaluate((node) => getComputedStyle(node, '::after').animationName);
  check('gold profile frame: a slow breathing glow (motion allowed)', glow === 'elite-glow', glow);
  await page.goto(`${web.url}/search?q=chitralekha&type=students`);
  const card = page.locator(`[data-student-id="${chitra.id}"]`).first();
  await card.waitFor({ timeout: 20000 });
  check('student search card: bronze frame, name and token', await card.evaluate((node) => Boolean(node.querySelector('[data-elite-frame="bronze"] .elite-frame__ring') && node.querySelector('.elite-name--bronze') && node.querySelector('[data-elite-token="bronze"]'))));
  await page.goto(`${web.url}/rankings`);
  await page.getByRole('link', { name: 'Hall of Fame' }).first().click();
  await page.waitForURL(/\/rankings\/hall-of-fame$/, { timeout: 10000 });
  check('Rankings links to the Hall of Fame', true);

  section('Hall of Fame');
  await page.getByRole('heading', { level: 1, name: /Hall of Fame/ }).waitFor({ timeout: 20000 });
  await page.locator('[data-holder-tier="gold"][data-student-id]').waitFor({ timeout: 10000 });
  const cards = await page.evaluate(() => [...document.querySelectorAll('[data-holder-tier]')].map((node) => ({ tier: node.dataset.holderTier, student: node.dataset.studentId ?? null, glow: Boolean(node.querySelector('.elite-frame--glow')), shine: Boolean(node.querySelector('.elite-name--shine')) })));
  check('current holders: Gold, Silver, Bronze cards (gold first in reading order), with glow frames and shining names', cards.map((item) => `${item.tier}:${item.student}`).join() === [`gold:${asha.id}`, `silver:${bilal.id}`, `bronze:${chitra.id}`].join() && cards.every((item) => item.glow && item.shine), cards);
  const podiumOrder = await page.evaluate(() => [...document.querySelectorAll('[data-holder-tier]')].sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x).map((node) => node.dataset.holderTier));
  check('desktop: podium order (Silver · Gold · Bronze), gold raised', podiumOrder.join() === 'silver,gold,bronze' && (await page.evaluate(() => document.querySelector('[data-holder-tier="gold"]').getBoundingClientRect().bottom < document.querySelector('[data-holder-tier="silver"]').getBoundingClientRect().bottom)), podiumOrder);
  check('records and token history are shown', (await page.getByText('Longest Gold reign').count()) === 1 && (await page.locator('[data-transfer-tier]').count()) >= 3);
  const goldTab = page.getByRole('tab', { name: 'Gold' });
  await goldTab.focus();
  await page.keyboard.press('ArrowRight');
  check('token tabs: arrow keys move to Silver', (await page.getByRole('tab', { name: 'Silver' }).getAttribute('aria-selected')) === 'true' && (await page.evaluate(() => document.activeElement?.textContent)) === 'Silver');
  await sleep(600); // the cards' entrance (staggered fade) finishes
  await page.screenshot({ path: shotPath('elite-hall-of-fame-desktop') });

  section('A live token transfer: names, frames and the celebration');
  const chitraSide = await newPage({ reducedMotion: 'reduce' });
  await chitraSide.page.addInitScript(MEASURE);
  await signIn(chitraSide.page, chitra);
  const devSide = await newPage();
  await signIn(devSide.page, dev);
  await page.goto(`${web.url}/rankings`);
  await page.locator('[data-podium-rank="1"]:visible [data-elite-frame="gold"]').waitFor({ timeout: 15000 });
  await chitraSide.page.goto(`${web.url}/profile/${chitra.id}`);
  await chitraSide.page.locator('[data-elite-frame="bronze"]').first().waitFor({ timeout: 15000 });
  const calm = await chitraSide.page.evaluate(() => ({
    shine: getComputedStyle(document.querySelector('h1 .elite-name')).animationName,
    glow: getComputedStyle(document.querySelector('[data-elite-frame="bronze"]'), '::after').animationName,
  }));
  check('reduced motion: no shine sweep, no breathing glow (static, polished)', calm.shine === 'none' && calm.glow === 'none', calm);
  // The header photo's frame wrapper is there with or without a token (.elite-frame); measure the photo inside it.
  const photoBox = (target) =>
    target.evaluate(() => {
      const frame = document.querySelector('.elite-frame');
      return { ...window.eliteBox(frame.querySelector(':scope > span > span')), wrapper: window.eliteBox(frame), inner: window.eliteBox(frame.firstElementChild) };
    });
  const avatarBefore = await photoBox(chitraSide.page);
  const cardPhoto = (target) => target.evaluate((id) => window.eliteBox(document.querySelector(`[data-student-id="${id}"] .elite-frame > span`)), chitra.id);
  await page.goto(`${web.url}/search?q=chitralekha&type=students`);
  await page.locator(`[data-student-id="${chitra.id}"] [data-elite-frame="bronze"]`).first().waitFor({ timeout: 20000 });
  const cardBefore = await cardPhoto(page);
  await page.goto(`${web.url}/rankings`);
  await page.locator('[data-podium-rank="1"]:visible [data-elite-frame="gold"]').waitFor({ timeout: 15000 });
  await sleep(1500); // let the sockets connect and the "seen" ranks settle
  // Dev (#4) adds a project: +20 XP → #1. Asha → Silver, Bilal → Bronze, Chitralekha out.
  await must(api('POST', '/projects', { token: dev.token, body: { title: 'Lab Slot Booking', shortDescription: 'Book a lab slot from your phone.', description: 'Students book free lab slots and the lab assistant sees the day schedule at a glance.', category: 'web', visibility: 'public' } }), 'dev project');
  check('the server moved the tokens', await holdersBecome(asha, [dev.id, asha.id, bilal.id]));
  const devOnTop = page.locator('[data-podium-rank="1"]:visible', { hasText: 'Dev Patel' }).locator('[data-elite-token="gold"]');
  await devOnTop.waitFor({ timeout: 15000 }).catch(() => {});
  await sleep(800); // the old ring cross-fades out (0.5 s)
  const ashaSilver = page.locator('[data-podium-rank="2"]:visible', { hasText: 'Asha Rao' }).locator('[data-elite-frame="silver"] .elite-frame__ring');
  check('without a reload, the open leaderboard shows Dev with Gold and Asha with Silver', (await devOnTop.count()) === 1 && (await ashaSilver.count()) === 1, await page.evaluate(() => [...document.querySelectorAll('[data-podium-rank]')].filter((node) => node.offsetParent).map((node) => `${node.dataset.podiumRank}: ${node.textContent.slice(0, 60)} | ${node.querySelector('[data-elite-frame]')?.dataset.eliteFrame}`)));
  const demoted = page.locator('[data-elite-celebration]');
  await demoted.waitFor({ timeout: 10000 }).catch(() => {});
  check('Asha (Gold → Silver) sees a calm notice', (await demoted.getAttribute('data-elite-celebration').catch(() => null)) === 'demoted' && /You are now Silver Elite/.test(await demoted.innerText().catch(() => '')), await demoted.innerText().catch(() => 'none'));
  const gained = devSide.page.locator('[data-elite-celebration]');
  await gained.waitFor({ timeout: 10000 }).catch(() => {});
  check('Dev (#4 → #1) gets the brief celebration: "You claimed the Golden Token!"', (await gained.getAttribute('data-elite-celebration').catch(() => null)) === 'gained' && /You claimed the Golden Token!/.test(await gained.innerText().catch(() => '')), await gained.innerText().catch(() => 'none'));
  await devSide.page.screenshot({ path: shotPath('elite-celebration-gained') });
  const lost = chitraSide.page.locator('[data-elite-celebration]');
  await lost.waitFor({ timeout: 10000 }).catch(() => {});
  check('Chitralekha (Bronze → out) sees "Your Bronze Token passed on" (reduced motion)', (await lost.getAttribute('data-elite-celebration').catch(() => null)) === 'lost' && /Your Bronze Token passed on/.test(await lost.innerText().catch(() => '')), await lost.innerText().catch(() => 'none'));
  await gained.getByRole('button', { name: 'Dismiss' }).click().catch(() => {});
  await sleep(600);
  check('the celebration can be dismissed', (await devSide.page.locator('[data-elite-celebration]').count()) === 0);
  await chitraSide.page.reload();
  await chitraSide.page.locator('h1').first().waitFor({ timeout: 15000 });
  await sleep(500);
  const avatarAfter = await photoBox(chitraSide.page);
  const sameBox = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  check('profile header: the frame adds no size (wrapper = photo border, with and without a token) and the photo keeps its size and column', sameBox(avatarBefore.wrapper, avatarBefore.inner) && sameBox(avatarAfter.wrapper, avatarAfter.inner) && avatarBefore.w === avatarAfter.w && avatarBefore.h === avatarAfter.h && avatarBefore.x === avatarAfter.x, [avatarBefore, avatarAfter]);
  await page.goto(`${web.url}/search?q=chitralekha&type=students`);
  await page.locator(`[data-student-id="${chitra.id}"]`).first().waitFor({ timeout: 20000 });
  await sleep(400);
  const cardAfter = await cardPhoto(page);
  check('student card: no frame any more, and no layout shift (photo box identical)', (await page.locator(`[data-student-id="${chitra.id}"] .elite-frame__ring`).count()) === 0 && JSON.stringify(cardBefore) === JSON.stringify(cardAfter), [cardBefore, cardAfter]);
  check('…and her profile shows the normal name again, with her Elite rank history kept', (await chitraSide.page.locator('.elite-name, [data-elite-frame] .elite-frame__ring').count()) === 0 && (await chitraSide.page.getByRole('heading', { name: 'Elite rank history' }).count()) === 1);
  await chitraSide.page.screenshot({ path: shotPath('elite-history-profile') });
  await devSide.page.goto(`${web.url}/notifications`);
  const note = devSide.page.locator('[data-elite-note="gold"]').first();
  await note.waitFor({ timeout: 15000 }).catch(() => {});
  check('the notification center shows the token change with the gold emblem', (await note.count()) === 1 && (await devSide.page.getByText('You claimed the Golden Token! You are now CampusX Rank #1.').count()) >= 1);

  section('Phone layout and long names');
  const phone = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await signIn(phone.page, esha);
  for (const path of ['/rankings', '/rankings/hall-of-fame', `/profile/${dev.id}`, `/profile/${chitra.id}`]) {
    await phone.page.goto(`${web.url}${path}`);
    await phone.page.locator('h1').first().waitFor({ timeout: 20000 });
    await sleep(700);
    check(`phone: ${path} fits the screen`, await noPageOverflow(phone.page));
  }
  await phone.page.goto(`${web.url}/rankings/hall-of-fame`);
  await phone.page.locator('[data-holder-tier="gold"][data-student-id]').waitFor({ timeout: 15000 });
  const stacked = await phone.page.evaluate(() => [...document.querySelectorAll('[data-holder-tier]')].map((node) => node.getBoundingClientRect().y));
  check('phone: holder cards stack, Gold on top', stacked.every((y, index) => index === 0 || y > stacked[index - 1]), stacked);
  await sleep(600);
  await phone.page.screenshot({ path: shotPath('elite-hall-of-fame-phone'), fullPage: true });
  const reignRow = await phone.page.locator('[data-reign-tier]').first().evaluate((node) => ({ lines: node.children.length, height: node.getBoundingClientRect().height }));
  check('phone: a previous holder row stays two short lines (dates not squeezed)', reignRow.lines === 2 && reignRow.height < 80, reignRow);
  await phone.page.goto(`${web.url}/profile/${dev.id}`);
  await phone.page.locator('[data-elite-frame="gold"]').first().waitFor({ timeout: 15000 });
  await sleep(600);
  await phone.page.screenshot({ path: shotPath('elite-profile-phone') });

  section('Readable in every theme');
  const failed = [];
  for (const [theme, style] of [['light', 'campus'], ['dark', 'campus'], ['light', 'aurora'], ['dark', 'aurora']]) {
    await setTheme(page, theme, style);
    for (const path of ['/rankings', '/rankings/hall-of-fame', `/profile/${dev.id}`]) {
      await page.goto(`${web.url}${path}`);
      await page.locator('.elite-name:visible').first().waitFor({ timeout: 20000 });
      await sleep(400);
      const low = (await eliteContrasts(page)).filter((item) => item.worst < 4.5);
      if (low.length) failed.push(`${style}-${theme} ${path}: ${JSON.stringify(low.slice(0, 3))}`);
    }
    await sleep(500);
    await page.screenshot({ path: shotPath(`elite-profile-${style}-${theme}`) });
    await page.goto(`${web.url}/rankings/hall-of-fame`);
    await page.locator('[data-holder-tier="gold"][data-student-id]').waitFor({ timeout: 15000 });
    await sleep(700);
    await page.screenshot({ path: shotPath(`elite-hall-of-fame-${style}-${theme}`) });
  }
  check('elite names (every gradient stop) and token labels keep ≥ 4.5:1 in Campus and Aurora, light and dark', failed.length === 0, failed);
  await setTheme(page, 'light', 'campus');

  section('Neutral fallbacks when ranking data is unavailable');
  const offline = await newPage();
  await signIn(offline.page, esha);
  await offline.page.route('**/api/v1/rankings/elite', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Unavailable' }) }));
  await offline.page.route('**/api/v1/rankings/hall-of-fame**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Unavailable' }) }));
  const before = errors.length;
  await offline.page.goto(`${web.url}/rankings`);
  await offline.page.locator('[data-podium-rank="1"]:visible').waitFor({ timeout: 20000 });
  check('elite API down: the leaderboard still works (identities come with the leaderboard itself)', (await offline.page.locator('[data-podium-rank="1"]:visible [data-elite-frame="gold"]').count()) === 1);
  await offline.page.goto(`${web.url}/rankings/hall-of-fame`);
  await offline.page.getByText("We couldn't load the Hall of Fame").waitFor({ timeout: 20000 }).catch(() => {});
  check('Hall of Fame down: an error with "Try again", no invented holders', (await offline.page.getByText("We couldn't load the Hall of Fame").count()) === 1 && (await offline.page.getByRole('button', { name: 'Try again' }).count()) === 1 && (await offline.page.locator('[data-holder-tier]').count()) === 0);
  check('no page errors anywhere in the suite', errors.length === before && errors.length === 0, errors.slice(0, 5));

  await context.close();
} catch (error) {
  check('suite ran to the end without crashing', false, error.stack);
}
await browser?.close();
await t.finish();
