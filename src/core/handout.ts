// Two documents generated on the stage after class, each one self-contained HTML:
//
//   studySlidesHtml  for students: every question of the session, the answers, the
//                    explanations and how the class answered. Opened in a browser
//                    it reads like a slide deck; printed to PDF it gives one slide
//                    per landscape page.
//   examBankHtml     for the tutor only: the open questions with model answers
//                    from the "exam" list of the session file, followed by the
//                    class's actual numbers, so an exam question months later can
//                    refer to what really happened in the room.

import type { Activity, LiveData, Session } from './types';
import { countOptions, formatNumber } from './stats';
import { armOf } from './identity';
import { scatterSvg, summariseBar } from './scatter';
import { barChartSvg } from './chart';
import { classTakeawayOf, didOf, realRows, summariseRestaurant, type StateRow } from '../activities/restaurant/def';
import { summariseChange, summariseGuess, part1Text, signed } from '../activities/guess/def';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
/** Escape, then turn **bold** into <strong>. */
const rich = (s: unknown) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const letter = (i: number) => String.fromCharCode(65 + i);
const img = (src: unknown) => (typeof src === 'string' && src.startsWith('data:image/') ? `<img class="figure" src="${esc(src)}" alt="">` : '');
const pct = (k: number, n: number) => (n ? `${Math.round((100 * k) / n)}%` : '–');

const MODES: Record<string, string> = {
  pair: 'With your neighbour', group: 'In groups', discuss: 'Class discussion',
  paper: 'On paper, on your own', think: 'Think for yourself',
};

const STYLE = `
  @page { size: 13.333in 7.5in; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #e9e6df; color: #16181d; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  .slide { width: min(100vw, 13.333in); aspect-ratio: 16 / 9; margin: 1.2rem auto; padding: 4.5% 6%; background: #fcfcfb;
    display: flex; flex-direction: column; gap: 0.8em; font-size: clamp(11px, 1.6vw, 23px); line-height: 1.35;
    box-shadow: 0 2px 12px rgba(0,0,0,.12); overflow: hidden; page-break-after: always; break-after: page; }
  .slide.title { justify-content: center; background: #14304f; color: #fff; }
  .slide.title .muted, .slide.title .kicker { color: #c9d6e6; }
  h1 { font-size: 2.6em; line-height: 1.1; margin: 0; }
  h2 { font-size: 1.45em; line-height: 1.25; margin: 0; }
  p { margin: 0; }
  .kicker { font-size: 0.8em; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #5a6270; }
  .muted { color: #5a6270; font-size: 0.85em; }
  .label { font-size: 0.75em; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
  .answer { margin-top: auto; padding: 0.7em 1em; border-left: 0.4em solid #1a7f4b; background: #edf6f0; border-radius: 0 .5em .5em 0; }
  .answer .label { color: #1a7f4b; margin-bottom: .2em; }
  .options { list-style: none; margin: 0; padding: 0; display: grid; gap: .25em; }
  .options li { display: flex; justify-content: space-between; gap: 1em; padding: .2em .6em; border-radius: .4em; }
  .options li.right { background: #edf6f0; font-weight: 700; }
  .share { color: #5a6270; font-variant-numeric: tabular-nums; }
  .grid { border-collapse: collapse; width: 100%; font-size: .8em; }
  .grid th, .grid td { padding: .35em .7em; text-align: left; vertical-align: top; border-bottom: 1px solid #d8d5cc; }
  .grid thead th { font-size: .8em; text-transform: uppercase; letter-spacing: .04em; color: #5a6270; }
  .grid tbody th { color: #14304f; }
  .grid.numbers { font-size: 1em; } .grid.numbers td { font-weight: 800; font-size: 1.3em; }
  svg.barchart { max-height: 17em; max-width: 100%; }
  svg.scatter { max-height: 19em; max-width: 100%; }
  .doc svg.scatter { max-height: 26rem; display: block; }
  .cols { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 1.2em; }
  .box { padding: .7em 1em; background: #fff; border: .2em solid #0072b2; border-radius: .7em; display: flex; flex-direction: column; gap: .3em; }
  .box.g1 { border-color: #d55e00; } .box.g2 { border-color: #16181d; } .box.g3 { border-color: #6b7280; }
  .big { font-size: 2.2em; font-weight: 800; line-height: 1; }
  .figure { max-width: 100%; max-height: 16em; object-fit: contain; align-self: flex-start; }
  .doc { max-width: 52rem; margin: 2rem auto; padding: 2.5rem 3rem; background: #fcfcfb; font-size: 16px; line-height: 1.5; }
  .doc h1 { font-size: 1.8rem; } .doc h2 { font-size: 1.2rem; margin: 2rem 0 .5rem; border-bottom: 2px solid #14304f; padding-bottom: .2rem; }
  .doc .q { margin: 1.2rem 0 .3rem; font-weight: 700; } .doc .a { margin: 0 0 .3rem; padding-left: 1rem; border-left: 4px solid #1a7f4b; }
  .doc table { border-collapse: collapse; margin: .5rem 0 1rem; } .doc td, .doc th { padding: .2rem .8rem .2rem 0; text-align: left; vertical-align: top; }
  .warn { padding: .6rem 1rem; background: #fbeceb; border-left: 5px solid #b3261e; font-weight: 700; }
  @media print { body { background: none; } .slide { margin: 0; width: 13.333in; height: 7.5in; box-shadow: none; font-size: 21px; } .doc { margin: 0; } }
`;

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>${STYLE}</style></head>
<body>
${body}
</body></html>
`;

/** The distinct things students answered or discussed, in session order. */
function* questions(session: Session): Generator<{ activity: Activity; item: number | null; key: string; part: string }> {
  const done = new Set<string>();
  let part = '';
  for (const frame of session.frames) {
    if (frame.type === 'section') {
      part = session.activities[frame.id].title;
      yield { activity: session.activities[frame.id], item: null, key: frame.key, part };
      continue;
    }
    const activity = session.activities[frame.collect ?? frame.id];
    const key = frame.collect ?? frame.key;
    if (done.has(key) || !['guess', 'choice', 'prompt', 'table', 'chart', 'lottery', 'restaurant'].includes(activity.type)) continue;
    done.add(key);
    yield { activity, item: frame.collect ? null : frame.item, key, part };
  }
}

/** Before, after and change per group as an HTML table (for a guess with "before"). */
function changeTable(a: Activity, live: Pick<LiveData, 'responses'>): string {
  const { rows, did } = summariseChange(a, live);
  const num = (x: number | null) => (x === null ? '–' : formatNumber(x));
  return `<table class="grid numbers"><thead><tr><th></th><th>First guess</th><th>Second guess</th><th>Change</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><th>${esc(r.title)} (${r.hinted ? 'got the hint' : 'no hint'}, ${r.n} students)</th>
      <td>${num(r.before)}</td><td>${num(r.after)}</td><td>${signed(r.change, formatNumber)}</td></tr>`).join('')}
    <tr><th>Difference in differences</th><td></td><td></td><td>${signed(did, formatNumber)}</td></tr></tbody></table>`;
}

/** February, November and change per state (the restaurant game), with the difference in differences. */
function stateTable(rows: StateRow[], afterLabel: string): string {
  const one = (x: number | null) => (x === null ? '–' : x.toFixed(1));
  const sign = (x: number | null) => (x === null ? '–' : `${x > 0.049 ? '+' : x < -0.049 ? '−' : ''}${Math.abs(x).toFixed(1)}`);
  return `<table class="grid"><thead><tr><th></th><th>February 1992</th><th>${afterLabel}</th><th>Change</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><th>${esc(r.name)} (${r.n} restaurants)</th><td>${one(r.before)}</td><td>${one(r.after)}</td><td>${sign(r.change)}</td></tr>`).join('')}
    <tr><th>New Jersey compared with Pennsylvania</th><td></td><td></td><td>${sign(didOf(rows))}</td></tr></tbody></table>`;
}

/** The bar game in numbers (for a guess with "bar"). */
function barTable(a: Activity, live: Pick<LiveData, 'responses'>): string {
  const s = summariseBar(a, live);
  const num = (x: number | null) => (x === null ? '–' : formatNumber(x));
  const row = (name: string, side: { n: number; median: number | null }) => `<tr><th>${name}</th><td>${side.n}</td><td>${num(side.median)}</td></tr>`;
  return `<table class="grid"><thead><tr><th>First guess</th><th>Students</th><th>Median second guess</th></tr></thead><tbody>
    ${row('All below the bar (no message)', s.below)}${row('All above the bar (got the message)', s.above)}
    ${row('Just below the bar', s.nearBelow)}${row('Just above the bar', s.nearAbove)}
    <tr><th>Jump at the bar (${num(s.bar)})</th><td></td><td>${signed(s.jump, formatNumber)}</td></tr></tbody></table>`;
}

/** Shares of the options of a choice item within each arm of an experiment (the balance check). */
export function sharesByArm(choice: Activity, key: string, guess: Activity, live: Pick<LiveData, 'responses'>) {
  const options: string[] = choice.items[0].options ?? choice.options;
  return guess.arms.map((arm: any, i: number) => {
    const answers = live.responses(key).filter((r) => armOf(r.pid, guess.id, guess.arms.length) === i).map((r) => r.v);
    return { label: arm.label as string, n: answers.length, counts: countOptions(answers, options.length) };
  }) as { label: string; n: number; counts: number[] }[];
}

export function studySlidesHtml(session: Session, live: LiveData | null, code: string | null): string {
  const slides: string[] = [];
  const slide = (kicker: string, body: string) =>
    slides.push(`<section class="slide"><p class="kicker">${esc(kicker)}</p>${body}</section>`);

  slides.push(`<section class="slide title"><p class="kicker">Study slides</p><h1>${esc(session.title)}</h1>
    <p class="muted">Every question from the session with its answer${live ? ' and how the class answered' : ''}.</p></section>`);

  for (const { activity: a, item, key, part } of questions(session)) {
    const kicker = part || session.title;

    if (a.type === 'section') {
      slides.push(`<section class="slide title"><p class="kicker">Part ${a.number} of ${session.sections.length}</p>
        <h1>${esc(a.title)}</h1>${a.subtitle ? `<p class="muted">${esc(a.subtitle)}</p>` : ''}</section>`);
    }

    if (a.type === 'restaurant') {
      slide(kicker, `<h2>${rich(a.news)}</h2>
        <p>Every student managed one real fast-food restaurant, in New Jersey (minimum wage raised from $4.25 to $5.05) or in Pennsylvania (no change), and decided how many employees to have in November.</p>
        ${live ? `<p class="label">What the class decided (average employees per restaurant)</p>${stateTable(summariseRestaurant(a, live).rows, 'November (plans)')}` : ''}
        ${a.classTakeaway ? `<p class="muted">${rich(classTakeawayOf(a, live ? summariseRestaurant(a, live).cut : true))}</p>` : ''}`);
      slide(kicker, `<h2>What really happened</h2>
        <p class="label">All 410 restaurants of the study (average employees per restaurant, full-time equivalents)</p>
        ${stateTable(realRows(), 'November 1992')}
        ${a.takeaway ? `<div class="answer"><p class="label">What it shows</p><p>${rich(a.takeaway)}</p></div>` : ''}
        <p class="muted">Source: Card and Krueger (1994), American Economic Review, Table 3.</p>`);
    }

    if (a.type === 'chart') {
      slide(kicker, `<h2>${esc(a.title)}</h2>${barChartSvg(a as any)}
        ${a.takeaway ? `<div class="answer"><p class="label">What it shows</p><p>${rich(a.takeaway)}</p></div>` : ''}
        ${a.source ? `<p class="muted">Source: ${esc(a.source)}</p>` : ''}`);
    }

    if (a.type === 'lottery') {
      const answers = live ? live.responses(key).map((r) => r.v) : [];
      const called = answers.filter((v) => v === 0).length;
      slide(kicker, `<h2>${rich(a.text)}</h2>
        ${answers.length ? `<p class="big">${called} of ${answers.length}</p><p class="muted">students in class had a birthday with a number from 1 to ${a.cutoff} and would have been called up</p>` : ''}
        ${a.takeaway ? `<div class="answer"><p class="label">What it shows</p><p>${rich(a.takeaway)}</p></div>` : ''}`);
    }

    if (a.type === 'table') {
      slide(kicker, `<h2>${esc(a.title)}</h2><table class="grid">
        <thead><tr>${a.columns.map((c: string) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${a.rows.map((row: string[]) => `<tr>${row.map((c, k) => (k === 0 ? `<th>${rich(c)}</th>` : `<td>${rich(c)}</td>`)).join('')}</tr>`).join('')}</tbody>
        </table>${a.note ? `<p class="muted">${rich(a.note)}</p>` : ''}`);
    }

    // The bar game: the scatter plot, the numbers and what it shows.
    if (a.type === 'guess' && a.bar !== undefined) {
      slide(kicker, `<h2>${rich(a.stageText)}</h2>
        <div class="cols">${live ? scatterSvg(summariseBar(a, live), a.axis, true) : ''}<div>
        <p>Everyone guessed twice. Before the second guess, only phones whose first guess was above the bar
          (${a.bar === 'median' ? 'the class median' : formatNumber(a.bar)}) showed: “${rich(a.hint)}”</p>
        ${live ? barTable(a, live) : ''}</div></div>
        ${a.takeaway ? `<div class="answer"><p class="label">What it shows</p><p>${rich(a.takeaway)}${a.truth ? ` <span class="muted">True value: ${esc(a.truth.label)}.</span>` : ''}</p></div>` : ''}`);
      continue;
    }

    // Before and after: the hint, the table of changes and what it shows.
    if (a.type === 'guess' && a.before) {
      slide(kicker, `<h2>${rich(a.stageText)}</h2>
        <p>Everyone guessed twice. Before the second guess, only the group “${esc(a.splitOptions[a.hintOption])}” saw a hint: “${rich(a.hint)}”</p>
        ${live ? changeTable(a, live) : ''}
        ${a.truth || a.takeaway ? `<div class="answer"><p class="label">What it shows</p>
          <p>${rich(a.takeaway ?? '')}${a.truth ? ` <span class="muted">True value: ${esc(a.truth.label)}.</span>` : ''}</p></div>` : ''}`);
      continue;
    }

    if (a.type === 'guess') {
      const groups = live ? summariseGuess(a, live) : null;
      const several = a.arms.length > 1 || a.splitBy;
      const boxes = several
        ? `<div class="cols">${(groups ?? a.arms.map((arm: any) => ({ title: `Version ${arm.label}`, n: 0, median: null }))).map((g: any, i: number) => `<div class="box g${i}">
            <p class="label">${esc(g.title)}</p>
            ${a.arms.length > 1 ? `<p>${rich(a.part1 ? part1Text(a, a.arms[i].anchor) : a.part2)}</p>` : ''}
            ${g.n ? `<p class="big">${formatNumber(g.median)}</p><p class="muted">class median, ${g.n} answers</p>` : ''}
          </div>`).join('')}</div>
          <p class="muted">${a.arms.length > 1
            ? 'Each phone got one of the versions at random. The only difference is the number in the question.'
            : 'These groups were not assigned at random: students sorted themselves into them by their own answer.'}</p>`
        : groups && groups[0].n ? `<p class="big">${formatNumber(groups[0].median!)}</p><p class="muted">class median, ${groups[0].n} answers</p>` : '';
      slide(kicker, `<h2>${rich(a.stageText)}</h2>${boxes}
        ${a.truth || a.takeaway ? `<div class="answer"><p class="label">${a.truth ? 'Answer' : 'What it shows'}</p>
          <p>${a.truth ? `<strong>${esc(a.truth.label)}</strong>${a.takeaway ? '. ' : ''}` : ''}${rich(a.takeaway ?? '')}</p></div>` : ''}`);
    }

    if (a.type === 'choice') {
      const i = item ?? 0;
      const it = a.items[i];
      const options: string[] = it.options ?? a.options;
      const answers = live ? live.responses(key).map((r) => r.v) : [];
      const counts = countOptions(answers, options.length);
      const n = answers.length;
      const list = options.map((o, k) => `<li class="${k === it.correct ? 'right' : ''}">
        <span class="opt">${k === it.correct ? '✓ ' : ''}${a.letters ? letter(k) + '. ' : ''}${esc(o)}</span>
        ${n ? `<span class="share">${pct(counts[k], n)}</span>` : ''}</li>`).join('');
      slide(`${kicker} · ${a.question}${a.items.length > 1 ? ` · ${i + 1}/${a.items.length}` : ''}`,
        `<h2>${rich(it.text)}</h2><ul class="options">${list}</ul>
        ${it.correct !== null || it.explanation ? `<div class="answer"><p class="label">${it.correct !== null ? 'Correct answer' : 'What it shows'}</p>
          <p>${it.correct !== null ? `<strong>${a.letters ? letter(it.correct) + '. ' : ''}${esc(options[it.correct])}</strong>` : ''}${it.correct !== null && it.explanation ? ' — ' : ''}${esc(it.explanation ?? '')}</p></div>` : ''}
        ${it.source ? `<p class="muted">Source: ${esc(it.source)}</p>` : ''}
        ${n ? `<p class="muted">${n} answers in class</p>` : ''}`);
    }

    if (a.type === 'prompt') {
      slide(`${kicker}${a.mode ? ` · ${MODES[a.mode] ?? ''}` : ''}`,
        `<h2>${rich(a.text)}</h2>${img(session.images[a.revealImage ?? a.image])}
        ${a.reveal ? `<div class="answer"><p class="label">${esc(a.revealTitle ?? 'Answer')}</p><p>${rich(a.reveal)}</p></div>` : ''}`);
    }
  }

  return page(`${session.title} · study slides`,
    `${slides.join('\n')}\n<!-- ${esc(session.title)}${code ? ` · room ${esc(code)}` : ''} · generated by Econ Live -->`);
}

export function examBankHtml(session: Session, live: LiveData, code: string): string {
  const parts: string[] = [];
  parts.push(`<h1>${esc(session.title)}: exam question bank</h1>
    <p class="warn">For the tutor only. Contains exam questions and model answers. Do not share.</p>
    <p class="muted">Room ${esc(code)} · ${live.participants.size} participants · generated ${new Date().toISOString().slice(0, 10)}</p>`);

  parts.push('<h2>Open questions with model answers</h2>');
  if (session.exam.length === 0) parts.push('<p class="muted">The session file has no "exam" list.</p>');
  session.exam.forEach((e, i) => parts.push(
    `<p class="q">${i + 1}. ${rich(e.question)}${e.points ? ` <span class="muted">[${e.points}p]</span>` : ''}</p>
     <p class="a">${rich(e.answer)}</p>${e.about ? `<p class="muted">Based on: ${esc(e.about)}</p>` : ''}`));

  parts.push(`<h2>What happened in class</h2>
    <p class="muted">Use these numbers to make a question concrete ("In the tutorial, the median guess of group A was …").</p>`);
  for (const { activity: a, item, key } of questions(session)) {
    if (a.type === 'guess') {
      const groups = summariseGuess(a, live);
      parts.push(`<p class="q">${rich(a.stageText)}</p><table><tr><th>Group</th><th>Answers</th><th>Median</th></tr>
        ${groups.map((g, i) => `<tr><td>${esc(g.title)}${a.arms.length > 1 && a.arms[i].anchor !== undefined ? ` (saw “${esc(a.arms[i].anchor)}”)` : ''}</td>
          <td>${g.n}</td><td>${g.median === null ? '–' : formatNumber(g.median)}</td></tr>`).join('')}</table>
        ${a.truth ? `<p class="muted">True value: ${esc(a.truth.label)}</p>` : ''}
        ${a.bar !== undefined ? `<p class="muted">Message above the bar only: “${rich(a.hint)}”. Students who answered both rounds:</p>${barTable(a, live)}${scatterSvg(summariseBar(a, live), a.axis, true)}` : ''}
        ${a.before && a.splitBy ? `<p class="muted">Hint for “${esc(a.splitOptions[a.hintOption])}” only: “${rich(a.hint)}”. Medians of students who answered both rounds:</p>${changeTable(a, live)}` : ''}`);
    }
    if (a.type === 'restaurant') {
      parts.push(`<p class="q">Restaurant game: ${rich(a.news)}</p>
        <p class="muted">What the class decided (average employees per restaurant):</p>${stateTable(summariseRestaurant(a, live).rows, 'November (plans)')}
        <p class="muted">What really happened (Card and Krueger 1994, Table 3):</p>${stateTable(realRows(), 'November 1992')}`);
    }
    if (a.type === 'choice') {
      const i = item ?? 0;
      const it = a.items[i];
      const options: string[] = it.options ?? a.options;
      const answers = live.responses(key).map((r) => r.v);
      const counts = countOptions(answers, options.length);
      const split = a.compareBy ? sharesByArm(a, key, session.activities[a.compareBy], live) : null;
      parts.push(`<p class="q">${rich(it.text)}</p><table>
        <tr><th>Option</th><th>All (${answers.length})</th>${split ? split.map((s) => `<th>Version ${esc(s.label)} (${s.n})</th>`).join('') : ''}</tr>
        ${options.map((o, k) => `<tr><td>${k === it.correct ? '✓ ' : ''}${esc(o)}</td><td>${pct(counts[k], answers.length)}</td>
          ${split ? split.map((s) => `<td>${pct(s.counts[k], s.n)}</td>`).join('') : ''}</tr>`).join('')}</table>`);
    }
  }
  return page(`${session.title} · exam question bank`, `<div class="doc">${parts.join('\n')}</div>`);
}
