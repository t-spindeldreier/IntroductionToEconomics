// Walks through ANY session file with simulated students in a real browser and
// saves a screenshot of every stage screen, plus the study slides and the exam bank.
// Use it to proof-read a new session before class without touching the real project.
//
//   npm run preview -- sessions/private/week1.yaml
//
// Figures referenced by the session file are picked up from the same folder.
// Output: preview-shots/

import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const file = process.argv[2] ?? 'sessions/demo.yaml';
const students = Number(process.argv[3] ?? 40);
const OUT = 'preview-shots';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The session file plus the images next to it that it mentions.
const text = readFileSync(file, 'utf8');
const folder = path.dirname(file);
const uploads = [file, ...readdirSync(folder).filter((f) => /\.(png|jpe?g|gif|webp|svg)$/i.test(f) && text.includes(f)).map((f) => path.join(folder, f))];

const server = await createServer({ server: { port: 5198, strictPort: true }, logLevel: 'error' });
await server.listen();
let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel }); break; } catch { /* next */ }
}
if (!browser) throw new Error('Neither Edge nor Chrome could be started.');

let failed = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const stage = await ctx.newPage();
  stage.on('pageerror', (e) => { failed = true; console.error('page error:', e.message); });
  stage.on('dialog', (d) => d.accept(d.message().match(/Type (\w{4})/)?.[1] ?? ''));
  await stage.goto('http://localhost:5198/#/stage');
  await stage.click('#dev-sign-in');
  const makeHost = stage.getByText('Emulator only: put me on the host list');
  await Promise.race([makeHost.waitFor(), stage.getByText('Load the demo session').waitFor()]);
  if (await makeHost.isVisible()) await makeHost.click();
  await stage.getByText('Load the demo session').waitFor();
  await stage.setInputFiles('#session-file', uploads);
  await Promise.race([stage.getByText('Session uploaded.').waitFor(), stage.locator('.errors').waitFor()]);
  if (await stage.locator('.errors').count()) throw new Error('The session file has problems:\n' + (await stage.locator('.errors').innerText()));
  await stage.getByRole('button', { name: 'Create room' }).first().click();
  await stage.waitForSelector('.next-hint');

  await stage.keyboard.press('h');
  await stage.fill('.count-input', String(students));
  await stage.getByRole('button', { name: 'Add simulated students' }).click();
  await stage.getByText(`${students} simulated students`).waitFor({ timeout: 60000 }).catch(async (e) => {
    console.error('PANEL SAYS:', (await stage.textContent('body')).replace(/\s+/g, ' ').slice(-700));
    throw e;
  });
  await stage.keyboard.press('Escape');

  let n = 0;
  for (;;) {
    // Give simulated students time to answer whatever is open.
    const open = await stage.locator('.count-number').count() && !(await stage.locator('.answer-card, .bars, .dotplot, .versions').count());
    await sleep(open ? 9000 : 700);
    const hint = (await stage.textContent('.next-hint')).trim();
    const name = hint.replace('next: ', '').replace(/[^a-z0-9]+/gi, '-');
    await stage.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-then-${name}.png` });
    if (hint.includes('end of session')) break;
    await stage.keyboard.press('ArrowRight');
    await stage.waitForFunction((before) => document.querySelector('.next-hint')?.textContent?.trim() !== before || false, hint, { timeout: 5000 }).catch(() => {});
  }
  console.log(`${n} screens saved.`);

  await stage.keyboard.press('h');
  for (const [button, name] of [['Download study slides', 'study_slides.html'], ['Download exam question bank', 'exam_bank.html']]) {
    const [download] = await Promise.all([stage.waitForEvent('download'), stage.getByRole('button', { name: button }).click()]);
    await download.saveAs(`${OUT}/${name}`);
    const doc = await ctx.newPage();
    await doc.goto('file:///' + path.resolve(OUT, name).replace(/\\/g, '/'));
    await doc.screenshot({ path: `${OUT}/${name.replace('.html', '.png')}`, fullPage: true });
    await doc.close();
  }
  await stage.getByRole('button', { name: 'Delete all data of this room' }).click();
  await stage.getByText('Sessions', { exact: true }).waitFor({ timeout: 20000 });
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser.close();
  await server.close();
}
console.log(failed ? 'Preview FAILED.' : `Preview finished. Look in ${OUT}/.`);
process.exit(failed ? 1 : 0);
