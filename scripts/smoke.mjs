// Browser smoke test: drives the real pages (one stage, three phones) through the
// demo session in a real browser against the emulators and saves screenshots to
// smoke-shots/. It uses the Edge or Chrome that is already installed.
//
//   npm run smoke
//
// It checks the things the Node simulation cannot: that the pages render, that
// keys work, that a reload resumes, and that nothing leaks before the reveal.

import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync, rmSync } from 'node:fs';

const OUT = 'smoke-shots';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`);
  if (!ok) failures.push(message);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const BASE = 'http://localhost:5199/';

let browser;
for (const channel of ['msedge', 'chrome']) {
  try {
    browser = await chromium.launch({ channel });
    break;
  } catch { /* try the next browser */ }
}
if (!browser) throw new Error('Neither Edge nor Chrome could be started.');

let n = 0;
const shot = async (page, name) => page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` });

try {
  // ----- host: sign in, get on the list, load the demo, create a room -----
  const stageCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const stage = await stageCtx.newPage();
  const errors = [];
  stage.on('pageerror', (e) => errors.push(`stage: ${e.message}`));
  stage.on('dialog', (d) => d.accept(d.message().match(/Type (\w{4})/)?.[1] ?? ''));
  await stage.goto(BASE + '#/stage');
  await stage.click('#dev-sign-in');
  // On a fresh emulator the test host is not on the list yet; on a used one it is.
  const makeHost = stage.getByText('Emulator only: put me on the host list');
  await Promise.race([makeHost.waitFor(), stage.getByText('Load the demo session').waitFor()]);
  if (await makeHost.isVisible()) await makeHost.click();
  await stage.getByText('Load the demo session').click();
  await stage.getByText('Session uploaded.').waitFor();
  await shot(stage, 'host-home');
  await stage.getByRole('button', { name: 'Create room' }).first().click();
  await stage.waitForSelector('.join-code');
  const code = (await stage.textContent('.join-code')).trim();
  check(/^[A-Z]{4}$/.test(code), `room created with code ${code}`);

  // ----- three phones join -----
  const phones = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`phone ${i}: ${e.message}`));
    await page.goto(`${BASE}?r=${code}`);
    await page.waitForSelector('.two-buttons');
    phones.push(page);
  }
  await shot(phones[0], 'phone-guess-part1');
  const nick = await phones[0].textContent('.nick strong');
  check(/^[\w-]+ \w+$/.test(nick), `phone got the nickname "${nick}"`);
  await phones[0].click('.reroll');
  await sleep(300);
  const nick2 = await phones[0].textContent('.nick strong');

  // Nothing on the stage may hint at two versions while collecting.
  const lobbyText = await stage.textContent('.stage');
  check(!/version|anchor|60|600/i.test(lobbyText.replace(code, '')), 'the lobby shows only the neutral question');

  // Simulated students make the plots worth looking at.
  await stage.keyboard.press('h');
  await stage.fill('.count-input', '40');
  await stage.getByRole('button', { name: 'Add simulated students' }).click();
  await stage.getByText('40 simulated students').waitFor();
  await shot(stage, 'stage-host-panel');
  await stage.keyboard.press('Escape');

  // The phones answer the guess.
  const guesses = ['150', '80,5', '300'];
  for (const [i, page] of phones.entries()) {
    await page.locator('.two-buttons .btn').first().tap();
    await page.fill('.guess-input', guesses[i]);
    if (i === 1) await shot(page, 'phone-guess-part2');
    await page.locator('button[type=submit]').tap();
    await page.getByText('Received').waitFor();
  }
  await shot(phones[0], 'phone-received');
  await sleep(13000); // simulated students answer within 12 seconds
  await shot(stage, 'stage-lobby-collecting');
  const counted = Number(await stage.textContent('.collecting .count-number'));
  check(counted === 43, `the stage counts 43 answers (shows ${counted})`);

  // A reload of a phone keeps its identity and its answer.
  await phones[0].reload();
  await phones[0].getByText('Received').waitFor();
  check((await phones[0].textContent('.nick strong')) === nick2, 'a reloaded phone keeps its nickname and its answer');

  const next = async (expectHint) => {
    await stage.keyboard.press('ArrowRight');
    if (expectHint) await stage.getByText(`next: ${expectHint}`).waitFor({ timeout: 5000 });
    await sleep(350);
  };
  const hint = async () => (await stage.textContent('.next-hint')).trim();
  check((await hint()) === 'next: close', `hint before closing is "${await hint()}"`);

  await next('open'); // guess closed
  await phones[0].getByText('Look at the screen').waitFor();
  await shot(phones[0], 'phone-waiting');

  await next('reveal'); // warm-up open
  await phones[0].waitForSelector('.two-buttons');
  await shot(phones[0], 'phone-choice');
  await phones[0].locator('.two-buttons .btn').first().tap();
  await phones[1].locator('.two-buttons .btn').last().tap();
  await sleep(12500);
  await shot(stage, 'stage-choice-open');
  check(!(await stage.textContent('.view')).includes('✓'), 'no correct answer on the stage before the reveal');

  await next('reveal (1 of 3)'); // warm-up reveal
  await shot(stage, 'stage-choice-reveal');
  await phones[0].getByText('Correct').waitFor();
  await shot(phones[0], 'phone-choice-reveal');

  // A reload of the stage in the middle resumes exactly here.
  await stage.reload();
  await stage.getByText('next: reveal (1 of 3)').waitFor();
  check((await stage.textContent('.view')).includes('botany'), 'a reloaded stage resumes on the same frame');

  await next('reveal (2 of 3)');
  await shot(stage, 'stage-guess-versions');
  await phones[0].getByText(/You had version [AB]/).waitFor();
  await shot(phones[0], 'phone-guess-version');
  await next('reveal (3 of 3)');
  await sleep(600);
  await shot(stage, 'stage-guess-results');
  await next('show');
  await sleep(600);
  await shot(stage, 'stage-guess-truth');

  await next('reveal'); // prompt with a running countdown
  await stage.waitForSelector('.stage-countdown');
  await stage.keyboard.press('t'); // pause
  await stage.keyboard.press('+'); // 30 seconds more
  await sleep(500);
  await shot(stage, 'stage-prompt');
  await shot(phones[0], 'phone-prompt');
  const paused = await stage.textContent('.stage-countdown');
  check(/^(5\d|1:00)$/.test(paused.trim()), `timer paused and extended (shows ${paused})`);
  await stage.keyboard.press('j');
  await shot(stage, 'stage-join-overlay');
  await stage.keyboard.press('j');
  await next('open');
  await shot(stage, 'stage-prompt-reveal');

  await next('reveal'); // quiz 1 open
  await phones[0].waitForSelector('.options');
  await shot(phones[0], 'phone-quiz');
  await phones[0].locator('.options .btn').nth(1).tap(); // Mercury: correct
  await phones[1].locator('.options .btn').nth(0).tap();
  await phones[0].getByText('Received').waitFor();
  await sleep(4000);
  await shot(stage, 'stage-quiz-open');
  await stage.keyboard.press('ArrowLeft'); // back one state and forward again must not break anything
  await sleep(400);
  await stage.keyboard.press('ArrowRight');
  await sleep(14000);
  await next('leaderboard');
  await sleep(2000);
  await shot(stage, 'stage-quiz-reveal');
  await phones[0].getByText(/You are \d+(st|nd|rd|th) of \d+/).waitFor();
  await shot(phones[0], 'phone-quiz-reveal');
  check((await phones[0].textContent('main')).includes('Correct'), 'the phone shows correct, points and rank');
  check((await phones[2].textContent('main')).includes('No answer'), 'a phone that did not answer says so');
  await next('open');
  await shot(stage, 'stage-leaderboard');

  await next('reveal'); // quiz 2
  await phones[2].locator('.options .btn').nth(1).tap();
  await sleep(1500);
  await next('leaderboard');
  await next('podium');
  await next('end');
  await sleep(500);
  await shot(stage, 'stage-podium');
  await shot(phones[0], 'phone-podium');
  await next(null);
  await sleep(500);
  await shot(stage, 'stage-end');
  await shot(phones[0], 'phone-end');
  check((await hint()) === 'next: end of session', 'the last frame says "end of session"');

  // ----- export and deletion -----
  await stage.keyboard.press('h');
  const downloads = [];
  stage.on('download', (d) => downloads.push(d.suggestedFilename()));
  await stage.getByRole('button', { name: 'Download CSV files' }).click();
  await sleep(1500);
  check(downloads.length === 2, `two CSV files downloaded (${downloads.join(', ')})`);
  await stage.getByRole('button', { name: 'Remove simulated students' }).click();
  await stage.getByText('0 simulated students').waitFor({ timeout: 20000 });
  check(true, 'simulated students removed');
  await stage.getByRole('button', { name: 'Delete all data of this room' }).click();
  await stage.getByText('Sessions', { exact: true }).waitFor({ timeout: 20000 });
  check(true, 'room deleted');
  await phones[0].getByText('This room does not exist').waitFor({ timeout: 10000 });
  check(true, 'phones of a deleted room show a calm message');

  check(errors.length === 0, `no JavaScript errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} catch (e) {
  failures.push(String(e));
  console.error(e);
} finally {
  await browser.close();
  await server.close();
}
console.log(failures.length === 0 ? `\nSmoke test passed. Screenshots are in ${OUT}/.` : `\nSmoke test FAILED (${failures.length}).`);
process.exit(failures.length === 0 ? 0 : 1);
