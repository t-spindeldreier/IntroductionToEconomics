// Study slides: one self-contained HTML file with every question of a session,
// the correct answers, the explanations and (if available) the class's results.
// Opened in a browser it reads like a slide deck; printed to PDF it gives one
// slide per landscape page, which can be handed out or dropped into a presentation.
//
// It contains the answers, so it is generated on the stage (hosts only), after class.

import type { LiveData, Session } from './types';
import { countOptions, formatNumber } from './stats';
import { summariseGuess, part1Text } from '../activities/guess/def';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
/** Escape, then turn **bold** into <strong>. */
const rich = (s: unknown) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const letter = (i: number) => String.fromCharCode(65 + i);

const MODES: Record<string, string> = {
  pair: 'With your neighbour', group: 'In groups', discuss: 'Class discussion',
  paper: 'On paper, on your own', think: 'Think for yourself',
};

export function studySlidesHtml(session: Session, live: LiveData | null, code: string | null): string {
  const slides: string[] = [];
  const slide = (kicker: string, body: string, cls = '') =>
    slides.push(`<section class="slide ${cls}"><p class="kicker">${esc(kicker)}</p>${body}</section>`);

  slides.push(`<section class="slide title"><p class="kicker">Study slides</p><h1>${esc(session.title)}</h1>
    <p class="muted">Every question from the session with its answer${live ? ' and how the class answered' : ''}.</p></section>`);

  const done = new Set<string>();
  let part = '';
  for (const frame of session.frames) {
    const a = session.activities[frame.id];
    const key = frame.collect ?? frame.key;
    const activity = frame.collect ? session.activities[frame.collect] : a;
    if (frame.type === 'section') {
      part = a.title;
      slides.push(`<section class="slide title"><p class="kicker">Part ${a.number} of ${session.sections.length}</p>
        <h1>${esc(a.title)}</h1>${a.subtitle ? `<p class="muted">${esc(a.subtitle)}</p>` : ''}</section>`);
      continue;
    }
    if (done.has(key) || !['guess', 'choice', 'prompt'].includes(activity.type)) continue;
    done.add(key);
    const kicker = part || session.title;

    if (activity.type === 'guess') {
      const arms = live ? summariseGuess(activity, live.responses(activity.id)) : null;
      const versions = activity.arms.length > 1
        ? `<div class="cols">${activity.arms.map((arm: any, i: number) => `<div class="box arm${i}">
            <p class="label">Version ${esc(arm.label)}</p>
            <p>${rich(activity.part1 ? part1Text(activity, arm.anchor) : activity.part2)}</p>
            ${arms && arms[i].n ? `<p class="big">${formatNumber(arms[i].median!)}</p><p class="muted">class median, ${arms[i].n} answers</p>` : ''}
          </div>`).join('')}</div>
          <p class="muted">Each phone got one of the versions at random. The only difference is the number in the question.</p>`
        : arms && arms[0].n ? `<p class="big">${formatNumber(arms[0].median!)}</p><p class="muted">class median, ${arms[0].n} answers</p>` : '';
      slide(kicker, `<h2>${rich(activity.stageText)}</h2>${versions}
        ${activity.truth ? `<div class="answer"><p class="label">Answer</p><p>${esc(activity.truth.label)}</p></div>` : ''}`);
    }

    if (activity.type === 'choice') {
      const i = frame.item ?? 0;
      const item = activity.items[i];
      const options: string[] = item.options ?? activity.options;
      const answers = live ? live.responses(key).map((r) => r.v) : [];
      const counts = countOptions(answers, options.length);
      const n = answers.length;
      const list = options.map((o, k) => `<li class="${k === item.correct ? 'right' : ''}">
        <span class="opt">${k === item.correct ? '✓ ' : ''}${activity.letters ? letter(k) + '. ' : ''}${esc(o)}</span>
        ${n ? `<span class="share">${Math.round((100 * counts[k]) / n)}%</span>` : ''}</li>`).join('');
      slide(`${kicker} · ${activity.question}${activity.items.length > 1 ? ` · ${i + 1}/${activity.items.length}` : ''}`,
        `<h2>${rich(item.text)}</h2><ul class="options">${list}</ul>
        ${item.correct !== null ? `<div class="answer"><p class="label">Correct answer</p>
          <p><strong>${activity.letters ? letter(item.correct) + '. ' : ''}${esc(options[item.correct])}</strong>${item.explanation ? ` — ${esc(item.explanation)}` : ''}</p></div>` : ''}
        ${item.source ? `<p class="muted">Source: ${esc(item.source)}</p>` : ''}
        ${n ? `<p class="muted">${n} answers in class</p>` : ''}`);
    }

    if (activity.type === 'prompt') {
      slide(`${kicker}${activity.mode ? ` · ${MODES[activity.mode] ?? ''}` : ''}`,
        `<h2>${rich(activity.text)}</h2>
        ${activity.reveal ? `<div class="answer"><p class="label">${esc(activity.revealTitle ?? 'Answer')}</p><p>${rich(activity.reveal)}</p></div>` : ''}`);
    }
  }

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(session.title)} · study slides</title>
<style>
  @page { size: 13.333in 7.5in; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #e9e6df; color: #16181d; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  .slide { width: min(100vw, 13.333in); aspect-ratio: 16 / 9; margin: 1.2rem auto; padding: 5% 6%; background: #fcfcfb;
    display: flex; flex-direction: column; gap: 0.9em; font-size: clamp(12px, 1.7vw, 24px); line-height: 1.35;
    box-shadow: 0 2px 12px rgba(0,0,0,.12); overflow: hidden; page-break-after: always; break-after: page; }
  .slide.title { justify-content: center; background: #14304f; color: #fff; }
  .slide.title .muted, .slide.title .kicker { color: #c9d6e6; }
  h1 { font-size: 2.6em; line-height: 1.1; margin: 0; }
  h2 { font-size: 1.5em; line-height: 1.25; margin: 0; }
  p { margin: 0; }
  .kicker { font-size: 0.8em; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #5a6270; }
  .muted { color: #5a6270; font-size: 0.85em; }
  .label { font-size: 0.75em; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
  .answer { margin-top: auto; padding: 0.8em 1em; border-left: 0.4em solid #1a7f4b; background: #edf6f0; border-radius: 0 .5em .5em 0; }
  .answer .label { color: #1a7f4b; margin-bottom: .2em; }
  .options { list-style: none; margin: 0; padding: 0; display: grid; gap: .3em; }
  .options li { display: flex; justify-content: space-between; gap: 1em; padding: .25em .6em; border-radius: .4em; }
  .options li.right { background: #edf6f0; font-weight: 700; }
  .share { color: #5a6270; font-variant-numeric: tabular-nums; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2em; }
  .box { padding: .8em 1em; background: #fff; border: .2em solid #0072b2; border-radius: .7em; display: flex; flex-direction: column; gap: .4em; }
  .box.arm1 { border-color: #d55e00; }
  .big { font-size: 2.4em; font-weight: 800; line-height: 1; }
  @media print { body { background: none; } .slide { margin: 0; width: 13.333in; height: 7.5in; box-shadow: none; font-size: 22px; } }
</style></head>
<body>
${slides.join('\n')}
<!-- ${esc(session.title)}${code ? ` · room ${esc(code)}` : ''} · generated by Econ Live -->
</body></html>
`;
}
