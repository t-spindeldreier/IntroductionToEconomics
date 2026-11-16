// Scoring for timed, scored choice questions (brief, section 4.3, item 4).
// Pure functions, unit-tested.

export const BASE_POINTS = 500;
export const SPEED_POINTS = 500;

/**
 * Points for one answer.
 *   correct: 500 + up to 500 for speed, proportional to the time left.
 *   wrong or missing: 0.
 * `durationMs` null means the question was untimed: no speed bonus.
 */
export function pointsFor(correct: boolean, responseMs: number, durationMs: number | null): number {
  if (!correct) return 0;
  if (durationMs === null || durationMs <= 0) return BASE_POINTS;
  const left = Math.min(durationMs, Math.max(0, durationMs - responseMs));
  return BASE_POINTS + Math.round((SPEED_POINTS * left) / durationMs);
}

/** One scored question, as the stage knows it at reveal time. */
export interface ScoredItem {
  key: string;
  correct: number;
  durationMs: number | null;
  /** pid -> the answer given and the response time in milliseconds */
  answers: Map<string, { value: number; ms: number }>;
}

export interface Standing {
  pid: string;
  points: number;
  rank: number; // 1 = best
  gain: number; // points earned on the last item in the list
  totalMs: number; // tie-breaker: lower is better
}

/**
 * Cumulative leaderboard over the given items (in order).
 * Everyone who answered at least one of them is ranked. A missing answer counts
 * as the full duration towards the tie-breaker. Remaining ties are broken by pid,
 * which is arbitrary but stable.
 */
export function leaderboard(items: ScoredItem[]): Standing[] {
  const table = new Map<string, Standing>();
  for (const item of items) for (const pid of item.answers.keys()) {
    if (!table.has(pid)) table.set(pid, { pid, points: 0, rank: 0, gain: 0, totalMs: 0 });
  }
  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    for (const s of table.values()) {
      const a = item.answers.get(s.pid);
      const points = a ? pointsFor(a.value === item.correct, a.ms, item.durationMs) : 0;
      s.points += points;
      s.totalMs += a ? Math.max(0, a.ms) : item.durationMs ?? 0;
      if (isLast) s.gain = points;
    }
  });
  const sorted = [...table.values()].sort(
    (a, b) => b.points - a.points || a.totalMs - b.totalMs || (a.pid < b.pid ? -1 : 1),
  );
  sorted.forEach((s, i) => (s.rank = i + 1));
  return sorted;
}
