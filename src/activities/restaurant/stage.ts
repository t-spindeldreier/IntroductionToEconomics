// The restaurant game on the projector: a map with one dot per manager, the news,
// then the class's decisions, the real numbers, and the managers who came closest.

import { S } from '../../strings';
import { h, rich } from '../../ui/dom';
import { nickname } from '../../core/nicknames';
import { answerCount, type StageEnv, type StageViewFn } from '../../stage/env';
import { ARM_COLOURS } from '../../stage/plots';
import { modePill } from '../../ui/pill';
import { STATES, assignStores, classTakeawayOf, didOf, realRows, storeAt, summariseRestaurant, type StateRow } from './def';
import { MAP_COUNTIES, MAP_H, MAP_PLACES, MAP_STATES, MAP_W } from './map';

const one = (x: number | null) => (x === null ? '–' : x.toFixed(1));
const signed = (x: number | null) => (x === null ? '–' : `${x > 0.049 ? '+' : x < -0.049 ? '−' : ''}${Math.abs(x).toFixed(1)}`);

/**
 * New Jersey and eastern Pennsylvania with their counties, one dot per manager in
 * the room. After the news, New Jersey is picked out.
 */
function map(env: StageEnv, news: boolean): HTMLElement {
  const dots: string[] = [];
  const counts = [0, 0];
  for (const code of Object.values(assignStores(env.ctl.participants))) {
    const { state, store } = storeAt(code);
    counts[state]++;
    dots.push(`<circle cx="${store[5]}" cy="${store[6]}" r="11" fill="${ARM_COLOURS[state]}" stroke="#fff" stroke-width="3"/>`);
  }
  const land = (name: string, fill: string) => `<path d="${MAP_STATES[name]}" fill="${fill}" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>`;
  const counties = (name: string) => `<path d="${MAP_COUNTIES[name]}" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.75"/>`;
  // Text with a light halo, so that it stays readable on top of borders and dots.
  const text = (p: number[], t: string, size: number, o: { weight?: number; fill?: string; spacing?: number; italic?: boolean; dy?: number } = {}) =>
    `<text x="${p[0]}" y="${p[1] + (o.dy ?? 0)}" text-anchor="middle" font-size="${size}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? '#16181d'}"` +
    ` letter-spacing="${o.spacing ?? 0}" ${o.italic ? 'font-style="italic"' : ''} stroke="#fff" stroke-opacity="0.85" stroke-width="7" paint-order="stroke" stroke-linejoin="round">${t}</text>`;
  const city = (p: number[], name: string) =>
    `<circle cx="${p[0]}" cy="${p[1]}" r="6" fill="#fff" stroke="#16181d" stroke-width="3"/>` +
    text([p[0], p[1]], name, 26, { dy: -14 });
  const box = h('div', { class: 'map-box' });
  box.innerHTML = `<svg viewBox="0 0 ${MAP_W} ${MAP_H}" class="map" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Map of New Jersey and eastern Pennsylvania">
    <defs>
      <linearGradient id="sea" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#cfe0ee"/><stop offset="1" stop-color="#b9d2e6"/></linearGradient>
      <filter id="lift" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#14304f" flood-opacity="0.35"/></filter>
    </defs>
    <rect width="${MAP_W}" height="${MAP_H}" fill="url(#sea)"/>
    ${['New York', 'Connecticut', 'Delaware', 'Maryland'].map((n) => land(n, '#ebe9e3')).join('')}
    ${land('Pennsylvania', '#f4ead8')}${counties('Pennsylvania')}
    <g ${news ? 'filter="url(#lift)"' : ''}>${land('New Jersey', news ? '#bfe0c9' : '#dfeadf')}</g>${counties('New Jersey')}
    ${news ? `<path d="${MAP_STATES['New Jersey']}" fill="none" stroke="#1a7f4b" stroke-width="6" stroke-linejoin="round"/>` : ''}
    ${text(MAP_PLACES.ocean, 'Atlantic', 30, { fill: '#5d7f9c', italic: true })}${text(MAP_PLACES.ocean, 'Ocean', 30, { fill: '#5d7f9c', italic: true, dy: 36 })}
    ${text(MAP_PLACES.ny, 'NEW YORK', 26, { fill: '#8a8f99', weight: 700, spacing: 3 })}
    <g>${dots.join('')}</g>
    ${text(MAP_PLACES.pa, 'PENNSYLVANIA', 38, { weight: 800, fill: '#7a4a12', spacing: 3 })}
    ${text(MAP_PLACES.pa, '$4.25', 34, { weight: 800, fill: '#7a4a12', dy: 44 })}
    ${text(MAP_PLACES.nj, 'NEW JERSEY', 38, { weight: 800, fill: '#14532d', spacing: 3 })}
    ${text(MAP_PLACES.nj, news ? '$4.25 → $5.05' : '$4.25', 34, { weight: 800, fill: news ? '#b3261e' : '#14532d', dy: 44 })}
    ${city(MAP_PLACES.philadelphia, 'Philadelphia')}${city(MAP_PLACES.newYork, 'New York City')}${city(MAP_PLACES.trenton, 'Trenton')}
  </svg>`;
  return h('div', { class: 'map-panel' }, box,
    h('p', { class: 'map-legend' }, STATES.map((name, i) => h('span', null,
      h('span', { class: 'swatch', style: `background:${ARM_COLOURS[i]}` }), `${name}: ${S.managers(counts[i])}`))));
}

function table(rows: StateRow[], afterLabel: string): HTMLElement {
  return h('table', { class: 'change-table' },
    h('thead', null, h('tr', null, h('th', null), h('th', null, S.feb1992), h('th', null, afterLabel), h('th', null, S.change))),
    h('tbody', null, rows.map((r, i) => h('tr', null,
      h('th', null, h('span', { class: 'swatch', style: `background:${ARM_COLOURS[i]}` }), r.name,
        h('span', { class: 'muted' }, ` · ${i === 0 ? S.wageUp : S.wageSame} · ${S.restaurants(r.n)}`)),
      h('td', null, one(r.before)), h('td', null, one(r.after)), h('td', { class: 'change-cell' }, signed(r.change))))));
}

const didCard = (rows: StateRow[], text: string | undefined, extra: Node | null = null) =>
  h('div', { class: 'answer-card compact' },
    h('p', { class: 'answer-label' }, S.njMinusPa),
    h('p', { class: 'answer-main' }, `${signed(rows[0].change)} − (${signed(rows[1].change)}) = ${signed(didOf(rows))} ${S.jobsPerRestaurant}`),
    text ? h('p', { class: 'answer-text' }, rich(text)) : null, extra);

export const restaurantStage: StageViewFn = (env) => {
  const a = env.activity;
  const phase = env.frame.phase;

  if (phase === 'assign' || phase === 'news' || phase === 'open' || phase === 'closed') {
    const side = phase === 'assign'
      ? [modePill('phone'), h('h1', { class: 'stage-question' }, rich(a.intro)), h('p', { class: 'hint' }, S.february1992)]
      : [h('div', { class: 'news-card' },
          h('p', { class: 'news-date' }, S.newsDate),
          h('h1', { class: 'news-title' }, rich(a.news)),
          h('p', { class: 'news-sub' }, S.newsSub)),
        phase === 'news' ? null : h('h1', { class: 'stage-question small' }, rich(a.question)),
        phase === 'news' ? null : answerCount(env.ctl.responses(a.id).length)];
    return h('div', { class: 'view map-view' }, map(env, phase !== 'assign'), h('div', { class: 'map-side' }, side));
  }

  const s = summariseRestaurant(a, env.ctl);
  if (phase === 'class') {
    return h('div', { class: 'view' },
      h('h1', { class: 'headline' }, S.classDecided),
      table(s.rows, S.nov1992Plan),
      didCard(s.rows, classTakeawayOf(a, s.cut)));
  }
  if (phase === 'real') {
    const real = realRows();
    return h('div', { class: 'view' },
      h('h1', { class: 'headline' }, S.reallyHappened),
      table(real, S.nov1992),
      didCard(real, a.takeaway, h('p', { class: 'muted' }, `${S.youExpected}: ${signed(s.did)}`)));
  }
  // best: the managers whose plan was closest to what their real restaurant did
  return h('div', { class: 'view' },
    h('h1', { class: 'headline' }, S.managersOfYear),
    h('p', { class: 'kicker' }, S.managersOfYearSub),
    s.closest.length === 0 ? h('p', { class: 'muted' }, S.noScores)
      : h('ol', { class: 'top-list' }, s.closest.slice(0, 5).map((c, i) => {
        const p = env.ctl.participants.get(c.pid);
        return h('li', null,
          h('span', { class: 'top-rank' }, i + 1),
          h('span', { class: 'top-name' }, p ? nickname(p.adj, p.eco) : '…'),
          h('span', { class: 'top-points' }, S.saidReally(c.said, c.real)));
      })));
};
