// Rehearsal mode: how a simulated student answers (brief, section 4.6).
// Guesses are pulled towards the anchor, about 60% of quiz answers are correct,
// response times vary.

import type { Activity, Frame, OpenWindow } from '../core/types';
import { armOf } from '../core/identity';

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
    let v = Math.exp(Math.log(Math.max(centre, 1e-6)) + (a.splitBy ? 0.3 : 0.7) * normal(rand));
    v = Math.min(a.max, Math.max(a.exclusiveMin ? a.min + 0.5 : a.min, v));
    v = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
    if (a.exclusiveMin && v <= a.min) v = a.min + 1;
    return { delayMs, v, ...(a.part1 ? { p1: v > anchor ? 0 : 1 } : {}) };
  }

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
