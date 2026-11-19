// Restaurant: the minimum-wage game after Card and Krueger (1994). Every phone
// manages one real fast-food restaurant, in New Jersey (where the minimum wage rose
// in April 1992) or in Pennsylvania (where it did not). After the news, each manager
// decides how many employees the restaurant will have in November. The class's
// decisions are then set against what the 410 real restaurants did.
//
// Session file fields:
//   intro         line on the projector when the restaurants are handed out
//   news          the headline of the news flash
//   question      shown while managers decide
//   classTakeaway one or two sentences under the class's decisions
//   takeaway      one or two sentences under the real numbers
//
// Phases: assign, news, open, closed, class, real, best.
// A phone's state and restaurant follow from its pid, like the arms of a guess.

import { S } from '../../strings';
import type { Activity, ActivityDef, LiveData } from '../../core/types';
import { armOf } from '../../core/identity';
import { STORES, type Store } from './stores';

export const STATES = ['New Jersey', 'Pennsylvania'];
export const OLD_MINIMUM = 4.25, NEW_MINIMUM = 5.05;

/** All 410 restaurants of the study: average employees (full-time equivalents), Table 3 of the paper. */
export const REAL = [
  { name: STATES[0], n: 331, before: 20.44, after: 21.03 },
  { name: STATES[1], n: 79, before: 23.33, after: 21.17 },
];

/** The restaurant a phone manages: state 0 = New Jersey, 1 = Pennsylvania. */
export function storeOf(pid: string, activityId: string): { state: number; store: Store } {
  const state = armOf(pid, activityId, 2);
  return { state, store: STORES[state][armOf(pid, `${activityId}:store`, STORES[state].length)] };
}

export interface StateRow {
  name: string;
  n: number;
  before: number | null;
  after: number | null;
  change: number | null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
// Everything is shown with one decimal, and the changes are computed from the numbers
// as shown, so that the arithmetic on the screen can be checked by hand.
const r1 = (x: number) => Math.round(x * 10) / 10;
const row = (name: string, n: number, before: number | null, after: number | null): StateRow => {
  const b = before === null ? null : r1(before), a = after === null ? null : r1(after);
  return { name, n, before: b, after: a, change: a === null || b === null ? null : r1(a - b) };
};
export const didOf = (rows: StateRow[]) =>
  (rows[0].change === null || rows[1].change === null ? null : r1(rows[0].change - rows[1].change));

/** What the managers in the room decided, per state, and who came closest to the real restaurant. */
export function summariseRestaurant(a: Activity, live: Pick<LiveData, 'responses'>) {
  const by: { before: number[]; after: number[] }[] = [{ before: [], after: [] }, { before: [], after: [] }];
  const closest: { pid: string; said: number; real: number; off: number; at: number }[] = [];
  for (const r of live.responses(a.id)) {
    const { state, store } = storeOf(r.pid, a.id);
    by[state].before.push(store[2]);
    by[state].after.push(r.v);
    closest.push({ pid: r.pid, said: r.v, real: store[3], off: Math.abs(r.v - store[3]), at: r.at });
  }
  const rows = by.map((g, i) => row(STATES[i], g.before.length, mean(g.before), mean(g.after)));
  closest.sort((x, y) => x.off - y.off || x.at - y.at);
  return { rows, did: didOf(rows), closest };
}

/** The paper's unrounded estimate is 2.76; with one decimal throughout it reads 2.7. */
export const realRows = (): StateRow[] => REAL.map((r) => row(r.name, r.n, r.before, r.after));

export const restaurantDef: ActivityDef = {
  type: 'restaurant',

  validate(a, v) {
    v.only(a, ['type', 'id', 'intro', 'news', 'question', 'classTakeaway', 'takeaway']);
    v.text(a, 'intro', { required: true, max: 200 });
    v.text(a, 'news', { required: true, max: 200 });
    v.text(a, 'question', { required: true, max: 200 });
    v.text(a, 'classTakeaway', { max: 500 });
    v.text(a, 'takeaway', { max: 500 });
  },

  itemCount: () => 0,
  phases: () => ['assign', 'news', 'open', 'closed', 'class', 'real', 'best'],
  defaultPhases() {
    return this.phases({} as Activity);
  },
  phaseLabel: (_a, phase) => ({ assign: S.phase.show, news: S.phase.news, open: S.phase.open, closed: S.phase.closed,
    class: S.phase.revealStep(1, 3), real: S.phase.revealStep(2, 3), best: S.phase.revealStep(3, 3) }[phase] ?? phase),
  stepLabel: () => S.step.restaurant,

  enter({ activity: a, frame }) {
    const view = { type: 'restaurant', key: a.id, phase: frame.phase, news: frame.phase === 'assign' ? null : a.news };
    if (frame.phase !== 'open') return { view };
    return { view, open: { key: a.id, type: 'guess', durationMs: null, min: 0, max: 200, xmin: false, p1: false } };
  },
};
