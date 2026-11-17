// Browser check of the hint game (before-and-after guess): two real phones, one in
// each group. Only the phone in the hinted group may show the hint, and the stage
// must compute the difference in differences from the two rounds.
//
//   node scripts/emu.mjs emulators:exec --only firestore,auth "node scripts/smoke-hint.mjs"

import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = 'smoke-shots';
mkdirSync(OUT, { recursive: true });
const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`);
  if (!ok) failures.push(message);
};

const file = path.join(os.tmpdir(), 'econ-live-hint.json');
writeFileSync(file, JSON.stringify({
  title: 'Hint game check',
  activities: {
    side: { type: 'choice', question: 'Where?', options: ['Front half', 'Back half'], items: [{ text: 'Where are you sitting?' }] },
    g1: { type: 'guess', stageText: 'How many?', part2: 'About ___ thousand.' },
    g2: { type: 'guess', stageText: 'Again: how many?', part2: 'About ___ thousand.', splitBy: 'side', before: 'g1',
      hint: 'SECRETHINT fewer than 500', hintFor: 'Front half', takeaway: 'Subtract.' },
  },
  steps: ['lobby', { activity: 'side', phases: ['open', 'closed'] }, { activity: 'g1', phases: ['open', 'closed'] }, 'g2'],
}));

const server = await createServer({ server: { port: 5197, strictPort: true }, logLevel: 'error' });
await server.listen();
const BASE = 'http://localhost:5197/';
let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel }); break; } catch { /* next */ }
}
if (!browser) throw new Error('Neither Edge nor Chrome could be started.');

try {
  const errors = [];
  const stage = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  stage.on('pageerror', (e) => errors.push(`stage: ${e.message}`));
  await stage.goto(BASE + '#/stage');
  await stage.click('#dev-sign-in');
  const makeHost = stage.getByText('Emulator only: put me on the host list');
  await Promise.race([makeHost.waitFor(), stage.getByText('Load the demo session').waitFor()]);
  if (await makeHost.isVisible()) await makeHost.click();
  await stage.getByText('Load the demo session').waitFor();
  await stage.setInputFiles('#session-file', [file]);
  await stage.getByText('Session uploaded.').waitFor();
  await stage.getByRole('button', { name: 'Create room' }).first().click();
  await stage.waitForSelector('.join-code');
  const code = (await stage.textContent('.join-code')).trim();

  const phones = [];
  for (let i = 0; i < 2; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`phone ${i}: ${e.message}`));
    await page.goto(`${BASE}?r=${code}`);
    await page.getByText('You are in.').waitFor();
    phones.push(page);
  }
  const [front, back] = phones;
  // One key press, then wait until the "next: ..." hint has changed.
  const next = async () => {
    const before = (await stage.textContent('.next-hint')).trim();
    await stage.keyboard.press('ArrowRight');
    await stage.waitForFunction((b) => document.querySelector('.next-hint')?.textContent?.trim() !== b, before, { timeout: 5000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
  };
  const guess = async (page, value) => {
    await page.fill('.guess-input', value);
    await page.locator('button[type=submit]').tap();
    await page.getByText('Received').waitFor();
  };

  await next(); // side: open
  await front.getByRole('button', { name: /Front half/ }).tap();
  await back.getByRole('button', { name: /Back half/ }).tap();
  await front.getByText('Received').waitFor();
  await back.getByText('Received').waitFor();
  await next(); // side: closed
  await next(); // g1: open
  await front.waitForSelector('.guess-input');
  await back.waitForSelector('.guess-input');
  check(!(await front.textContent('body')).includes('SECRETHINT'), 'no hint in the first round');
  await guess(front, '900');
  await guess(back, '1000');
  await next(); // g1: closed
  await next(); // g2: open
  await front.waitForSelector('.guess-input');
  await back.waitForSelector('.guess-input');
  check((await front.textContent('body')).includes('SECRETHINT'), 'the phone in the front half shows the hint');
  check(!(await back.textContent('body')).includes('SECRETHINT'), 'the phone in the back half shows no hint');
  check((await front.textContent('body')).includes('First guess: 900'), 'the phone shows its first guess');
  check(!(await stage.textContent('.stage')).includes('SECRETHINT'), 'the stage does not show the hint while collecting');
  await front.screenshot({ path: `${OUT}/hint-phone-front.png` });
  await back.screenshot({ path: `${OUT}/hint-phone-back.png` });
  await guess(front, '400');
  await guess(back, '950');
  await next(); // g2: closed
  await next(); // g2: change
  await stage.waitForSelector('.change-table');
  await next(); // g2: did
  await stage.waitForSelector('.answer-main');
  const did = (await stage.textContent('.answer-main')).trim();
  check(did === '−500 − (−50) = −450', `the stage computes the difference in differences (${did})`);
  await stage.screenshot({ path: `${OUT}/hint-stage-did.png` });
  await back.getByText('Your group got no hint').waitFor();
  await front.getByText('Your group got a hint').waitFor();
  check(!(await back.textContent('body')).includes('SECRETHINT'), 'after the reveal the back half still does not see the hint text on its phone');
  check(errors.length === 0, `no page errors ${errors.join('; ')}`);
} catch (e) {
  failures.push(String(e));
  console.error(e);
} finally {
  await browser.close();
  await server.close();
  rmSync(file, { force: true });
}
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('\nHint game check passed.');
