// Rehearsal mode: how a simulated student answers (brief, section 4.6).
// Guesses are pulled towards the anchor, about 60% of quiz answers are correct,
// response times vary.

import type { Activity, Frame, OpenWindow } from '../core/types';
import { armOf } from '../core/identity';
import { storeAt } from '../activities/restaurant/def';

export interface FakeAnswer {
  delayMs: number;
  v: number;
  p1?: number;
}

/** Standard normal draw (Box-Muller). */
function normal(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

export function fakeAnswer(a: Activity, frame: Frame, open: OpenWindow, pid: string, rand: () => number = Math.random): FakeAnswer {
  // Timed: between 2 seconds and 90% of the time, more often early. Untimed: within 12 seconds.
  const delayMs = open.durationMs !== null
    ? Math.min(2000 + rand() * rand() * open.durationMs, open.durationMs * 0.9)
    : 800 + rand() * 11000;

  // The bar game: a simulated student guesses consistently in both rounds, and
  // lowers the second guess after seeing the message.
  if (a.type === 'guess' && (a.paired || a.bar !== undefined)) {
    const seed = a.bar !== undefined ? a.before : a.id;
    const u = (k: number) => (armOf(pid, `bot-${seed}-${k}`, 10007) + 0.5) / 10007;
    const z = (u(1) + u(2) + u(3) - 1.5) * 2; // roughly standard normal, fixed per student
    const tidy = (x: number) => {
      let v = Math.min(a.max, Math.max(a.exclusiveMin ? a.min + 0.5 : a.min, x));
      v = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
      return a.exclusiveMin && v <= a.min ? a.min + 1 : v;
    };
    const firstGuess = tidy(Math.sqrt(a.axis.min * a.axis.max) * Math.exp(0.7 * z));
    if (a.bar === undefined) return { delayMs, v: firstGuess };
    const pulled = typeof a.barValue === 'number' && firstGuess > a.barValue ? 0.65 : 1;
    return { delayMs, v: tidy(firstGuess * pulled * Math.exp(0.12 * normal(rand))) };
  }

  if (a.type === 'guess') {
    const anchor = Number(a.arms[armOf(pid, a.id, a.arms.length)].anchor);
    // Without a true value, aim at the middle of the plot's axis.
    let truth = a.truth?.value ?? (a.axis.scale === 'linear' ? (a.axis.min + a.axis.max) / 2 : Math.sqrt(a.axis.min * a.axis.max));
    // A guess that is split by another question: make the groups differ, as self-chosen groups do.
    if (a.splitBy) {
      const n = a.splitOptions.length;
      truth *= 1.3 - (0.4 * armOf(pid, 'bot-' + a.splitBy, n)) / Math.max(1, n - 1);
    }
    // Somewhere between the truth and the anchor on a log scale, plus noise.
    const centre = Number.isFinite(anchor) && anchor > 0
      ? Math.exp(0.5 * Math.log(anchor) + 0.5 * Math.log(Math.max(truth, 1e-6)))
      : truth;
    // A hint pulls the simulated students who see it close to the truth.
    const hinted = a.hintOption !== undefined && armOf(pid, 'bot-' + a.splitBy, a.splitOptions.length) === a.hintOption;
    // Without the hint they guess as in the first round: around the middle of the axis.
    const unhinted = a.before ? (centre / truth) * Math.sqrt(a.axis.min * a.axis.max) : centre;
    let v = Math.exp(Math.log(Math.max(hinted ? (a.truth?.value ?? centre) : unhinted, 1e-6)) + (hinted ? 0.15 : a.splitBy ? 0.3 : 0.7) * normal(rand));
    v = Math.min(a.max, Math.max(a.exclusiveMin ? a.min + 0.5 : a.min, v));
    v = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
    if (a.exclusiveMin && v <= a.min) v = a.min + 1;
    return { delayMs, v, ...(a.part1 ? { p1: v > anchor ? 0 : 1 } : {}) };
  }

  // restaurant game: simulated managers in New Jersey cut about a tenth of their staff
  if (a.type === 'restaurant') {
    const code = (a.assignment as Record<string, number> | undefined)?.[pid];
    if (code === undefined) return { delayMs, v: 20 };
    const { state, store } = storeAt(code);
    return { delayMs, v: Math.max(1, Math.round(store[2] * (state === 0 ? 0.9 : 1) * Math.exp(0.06 * normal(rand)))) };
  }

  // birthday lottery: 195 of 366 birthdays were called up
  if (a.type === 'lottery') return { delayMs, v: rand() < 195 / 366 ? 0 : 1 };

  // choice
  const n = open.n ?? 2;
  const correct: number | null = a.items[frame.item ?? 0].correct;
  // A question without a correct answer is an opinion: the same simulated student always gives the same one.
  let v = armOf(pid, 'bot-' + a.id, n);
  if (correct !== null) {
    if (rand() < 0.6) v = correct;
    else if (n > 1) v = (correct + 1 + Math.floor(rand() * (n - 1))) % n;
  }
  return { delayMs, v };
}
