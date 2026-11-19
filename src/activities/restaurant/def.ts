// Restaurant: the minimum-wage game after Card and Krueger (1994). Every phone
// manages one real fast-food restaurant, in New Jersey (where the minimum wage rose
// in April 1992) or in Pennsylvania (where it did not). After the news, each manager
// decides how many employees the restaurant will have in November. The class's
// decisions are then set against what the 410 real restaurants did.
//
// Session file fields:
//   intro               line on the projector when the restaurants are handed out
//   news                the headline of the news flash
//   question            shown while managers decide
//   classTakeaway       under the class's decisions, if New Jersey managers cut jobs
//   classTakeawayNoCut  the same, if they did not (default: classTakeaway)
//   takeaway            one or two sentences under the real numbers
//
// Phases: assign, news, open, closed, class, real, best.
//
// Who gets which restaurant: students are taken in the order in which they joined
// and dealt alternately to New Jersey and Pennsylvania, each time the next restaurant
// on the state's list. So the two groups are equally large, nobody chooses a state,
// and no two students share a restaurant (up to 100 + 70 students). The stage sends
// the list to the phones with every screen of the game.

import { S } from '../../strings';
import type { Activity, ActivityDef, LiveData, Participant } from '../../core/types';
import { STORES, type Store } from './stores';

export const STATES = ['New Jersey', 'Pennsylvania'];
export const OLD_MINIMUM = 4.25, NEW_MINIMUM = 5.05;

/** All 410 restaurants of the study: average employees (full-time equivalents), Table 3 of the paper. */
export const REAL = [
  { name: STATES[0], n: 331, before: 20.44, after: 21.03 },
  { name: STATES[1], n: 79, before: 23.33, after: 21.17 },
];

/** pid -> state * 1000 + position in the state's list. */
export type Assignment = Record<string, number>;

export function assignStores(participants: Map<string, Participant>): Assignment {
  const order = [...participants.entries()].sort(([p, a], [q, b]) => a.joinedAt - b.joinedAt || (p < q ? -1 : 1));
  const out: Assignment = {};
  order.forEach(([pid], i) => {
    const state = i % 2;
    out[pid] = state * 1000 + (Math.floor(i / 2) % STORES[state].length);
  });
  return out;
}

export function storeAt(code: number): { state: number; store: Store } {
  const state = Math.floor(code / 1000);
  return { state, store: STORES[state][code % 1000] };
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
export function summariseRestaurant(a: Activity, live: Pick<LiveData, 'responses' | 'participants'>) {
  const assignment = assignStores(live.participants);
  const by: { before: number[]; after: number[] }[] = [{ before: [], after: [] }, { before: [], after: [] }];
  const closest: { pid: string; said: number; real: number; off: number; at: number }[] = [];
  for (const r of live.responses(a.id)) {
    if (assignment[r.pid] === undefined) continue;
    const { state, store } = storeAt(assignment[r.pid]);
    by[state].before.push(store[2]);
    by[state].after.push(r.v);
    closest.push({ pid: r.pid, said: r.v, real: store[3], off: Math.abs(r.v - store[3]), at: r.at });
  }
  const rows = by.map((g, i) => row(STATES[i], g.before.length, mean(g.before), mean(g.after)));
  closest.sort((x, y) => x.off - y.off || x.at - y.at);
  const did = didOf(rows);
  return { rows, did, closest, cut: did !== null && did <= -0.3 };
}

/** The text under the class's decisions: it depends on whether New Jersey managers cut jobs. */
export const classTakeawayOf = (a: Activity, cut: boolean): string | undefined =>
  (cut ? a.classTakeaway : a.classTakeawayNoCut ?? a.classTakeaway);

/** The paper's unrounded estimate is 2.76; with one decimal throughout it reads 2.7. */
export const realRows = (): StateRow[] => REAL.map((r) => row(r.name, r.n, r.before, r.after));

export const restaurantDef: ActivityDef = {
  type: 'restaurant',

  validate(a, v) {
    v.only(a, ['type', 'id', 'intro', 'news', 'question', 'classTakeaway', 'classTakeawayNoCut', 'takeaway']);
    v.text(a, 'intro', { required: true, max: 200 });
    v.text(a, 'news', { required: true, max: 200 });
    v.text(a, 'question', { required: true, max: 200 });
    v.text(a, 'classTakeaway', { max: 500 });
    v.text(a, 'classTakeawayNoCut', { max: 500 });
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

  enter({ activity: a, frame, live }) {
    const stores = assignStores(live.participants);
    a.assignment = stores; // for the simulated students of rehearsal mode
    const view = { type: 'restaurant', key: a.id, phase: frame.phase, news: frame.phase === 'assign' ? null : a.news, stores };
    if (frame.phase !== 'open') return { view };
    return { view, open: { key: a.id, type: 'guess', durationMs: null, min: 0, max: 200, xmin: false, p1: false } };
  },
};
