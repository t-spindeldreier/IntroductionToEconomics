// The restaurant game on the projector: a map with one dot per manager, the news,
// then the class's decisions, the real numbers, and the managers who came closest.

import { S } from '../../strings';
import { h, rich } from '../../ui/dom';
import { nickname } from '../../core/nicknames';
import { answerCount, type StageEnv, type StageViewFn } from '../../stage/env';
import { ARM_COLOURS } from '../../stage/plots';
import { modePill } from '../../ui/pill';
import { STATES, didOf, realRows, storeOf, summariseRestaurant, type StateRow } from './def';
import { MAP_H, MAP_PATHS, MAP_PLACES, MAP_W } from './map';

const one = (x: number | null) => (x === null ? '–' : x.toFixed(1));
const signed = (x: number | null) => (x === null ? '–' : `${x > 0.049 ? '+' : x < -0.049 ? '−' : ''}${Math.abs(x).toFixed(1)}`);

/** New Jersey and eastern Pennsylvania, one dot per manager in the room. */
function map(env: StageEnv, highlight: boolean): HTMLElement {
  const dots: string[] = [];
  const counts = [0, 0];
  for (const pid of env.ctl.participants.keys()) {
    const { state, store } = storeOf(pid, env.activity.id);
    counts[state]++;
    dots.push(`<circle cx="${store[5]}" cy="${store[6]}" r="13" fill="${ARM_COLOURS[state]}" stroke="#fff" stroke-width="3" opacity="0.9"/>`);
  }
  const land = (name: string, fill: string) => `<path d="${MAP_PATHS[name]}" fill="${fill}" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>`;
  const label = (x: number, y: number, text: string, size: number, weight: number, fill: string) =>
    `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" font-weight="${weight}" fill="${fill}" letter-spacing="2">${text}</text>`;
  const city = (x: number, y: number, name: string) =>
    `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" fill="#16181d"/><text x="${x + 14}" y="${y + 10}" font-size="30" fill="#16181d">${name}</text>`;
  const box = h('div', { class: 'map-box' });
  box.innerHTML = `<svg viewBox="0 0 ${MAP_W} ${MAP_H}" class="map" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Map of New Jersey and eastern Pennsylvania">
    <rect width="${MAP_W}" height="${MAP_H}" fill="#d6e4f0"/>
    ${['New York', 'Connecticut', 'Delaware', 'Maryland'].map((n) => land(n, '#e9e6df')).join('')}
    ${land('Pennsylvania', highlight ? '#ece9e2' : '#f6e3d2')}${land('New Jersey', highlight ? '#bcd9ee' : '#d5e6f3')}
    ${label(MAP_PLACES.pa[0], MAP_PLACES.pa[1], 'PENNSYLVANIA', 40, 800, '#5a6270')}${label(MAP_PLACES.nj[0], MAP_PLACES.nj[1], 'NEW', 40, 800, '#14304f')}${label(MAP_PLACES.nj[0], MAP_PLACES.nj[1] + 46, 'JERSEY', 40, 800, '#14304f')}
    ${dots.join('')}
    ${city(MAP_PLACES.philadelphia[0], MAP_PLACES.philadelphia[1], 'Philadelphia')}${city(MAP_PLACES.newYork[0], MAP_PLACES.newYork[1], 'New York')}
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
      didCard(s.rows, a.classTakeaway));
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
