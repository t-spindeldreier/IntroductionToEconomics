// The "bar" game (a regression discontinuity made in class): every student guesses
// twice, and only those whose first guess was above a bar see a message before the
// second guess. This file holds the numbers and the scatter plot, as plain strings,
// so the stage, the study slides and the exam bank all use the same picture.

import type { Activity, LiveData } from './types';
import { formatNumber, logPosition, median } from './stats';

export interface BarSide {
  n: number;
  median: number | null; // median SECOND guess
}

export interface BarSummary {
  bar: number | null;
  /** One point per student who answered both rounds. */
  points: { x: number; y: number; above: boolean; near: boolean }[];
  below: BarSide;
  above: BarSide;
  /** The students closest to the bar on each side. */
  nearBelow: BarSide & { from: number | null };
  nearAbove: BarSide & { to: number | null };
  /** Median second guess just above minus just below the bar. */
  jump: number | null;
}

/** The bar: a fixed number from the session file, or the median of the first guesses. */
export function barOf(a: Activity, live: Pick<LiveData, 'responses'>): number | null {
  if (typeof a.barValue === 'number') return a.barValue; // fixed when the second guess opened
  if (typeof a.bar === 'number') return a.bar;
  return median(live.responses(a.before).map((r) => r.v));
}

export function summariseBar(a: Activity, live: Pick<LiveData, 'responses'>): BarSummary {
  const bar = barOf(a, live);
  const first = new Map(live.responses(a.before).map((r) => [r.pid, r.v]));
  const points: BarSummary['points'] = [];
  if (bar !== null) {
    for (const r of live.responses(a.id)) {
      const x = first.get(r.pid);
      if (x !== undefined) points.push({ x, y: r.v, above: x > bar, near: false });
    }
  }
  const below = points.filter((p) => !p.above).sort((p, q) => q.x - p.x); // nearest to the bar first
  const above = points.filter((p) => p.above).sort((p, q) => p.x - q.x);
  // "Near": about a third of the smaller side, at least 3 students per side.
  const k = Math.min(Math.max(3, Math.ceil(Math.min(below.length, above.length) / 3)), below.length, above.length);
  const nearB = below.slice(0, k), nearA = above.slice(0, k);
  for (const p of [...nearB, ...nearA]) p.near = true;
  const side = (ps: typeof points) => ({ n: ps.length, median: median(ps.map((p) => p.y)) });
  const nb = side(nearB), na = side(nearA);
  return {
    bar, points, below: side(below), above: side(above),
    nearBelow: { ...nb, from: nearB.length ? nearB[nearB.length - 1].x : null },
    nearAbove: { ...na, to: nearA.length ? nearA[nearA.length - 1].x : null },
    jump: nb.median === null || na.median === null ? null : na.median - nb.median,
  };
}

const BLUE = '#0072b2', ORANGE = '#d55e00', INK = '#16181d', GRID = '#d9dbe0';
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * First guess (across) against second guess (up), the bar as a vertical line.
 * With showBand the students near the bar are highlighted and the others fade.
 */
export function scatterSvg(s: BarSummary, axis: { min: number; max: number; scale?: string }, showBand: boolean,
  labels = { x: 'First guess', y: 'Second guess', bar: 'the bar', same: 'same guess twice' }): string {
  const W = 1040, H = 900, left = 130, right = 70, top = 50, bottom = 100;
  const pw = W - left - right, ph = H - top - bottom;
  const linear = axis.scale === 'linear';
  const pos = (v: number) => (linear ? Math.min(1, Math.max(0, (v - axis.min) / (axis.max - axis.min))) : logPosition(v, axis.min, axis.max));
  const x = (v: number) => left + pos(v) * pw;
  const y = (v: number) => top + (1 - pos(v)) * ph;

  const ticks: number[] = [];
  if (linear) for (let i = 0; i <= 5; i++) ticks.push(axis.min + ((axis.max - axis.min) * i) / 5);
  else for (let p = Math.floor(Math.log10(axis.min)); p <= Math.ceil(Math.log10(axis.max)); p++) {
    if (10 ** p >= axis.min * 0.999 && 10 ** p <= axis.max * 1.001) ticks.push(10 ** p);
  }

  const out: string[] = [];
  out.push(`<svg viewBox="0 0 ${W} ${H}" class="scatter" role="img" aria-label="${esc(labels.x)} against ${esc(labels.y)}">`);
  if (showBand && s.nearBelow.from !== null && s.nearAbove.to !== null) {
    out.push(`<rect x="${x(s.nearBelow.from) - 12}" y="${top}" width="${x(s.nearAbove.to) - x(s.nearBelow.from) + 24}" height="${ph}" fill="#f3e9c8"/>`);
  }
  for (const t of ticks) {
    out.push(`<line x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${top + ph}" stroke="${GRID}" stroke-width="2"/>`,
      `<line x1="${left}" x2="${left + pw}" y1="${y(t)}" y2="${y(t)}" stroke="${GRID}" stroke-width="2"/>`,
      `<text x="${x(t)}" y="${top + ph + 38}" text-anchor="middle" font-size="28" fill="${INK}">${formatNumber(t)}</text>`,
      `<text x="${left - 14}" y="${y(t) + 10}" text-anchor="end" font-size="28" fill="${INK}">${formatNumber(t)}</text>`);
  }
  // Where a student lands who gives the same guess twice.
  out.push(`<line x1="${left}" y1="${top + ph}" x2="${left + pw}" y2="${top}" stroke="#8a8f99" stroke-width="2" stroke-dasharray="10 8"/>`,
    `<text x="${left + pw - 10}" y="${top + 58}" text-anchor="end" font-size="24" fill="#5a6270">${esc(labels.same)}</text>`);
  if (s.bar !== null) {
    out.push(`<line x1="${x(s.bar)}" x2="${x(s.bar)}" y1="${top - 8}" y2="${top + ph}" stroke="${INK}" stroke-width="5"/>`,
      `<text x="${x(s.bar)}" y="${top - 18}" text-anchor="middle" font-size="30" font-weight="800" fill="${INK}">${esc(labels.bar)}: ${formatNumber(s.bar)}</text>`);
  }
  for (const p of s.points) {
    out.push(`<circle cx="${x(p.x).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="11" fill="${p.above ? ORANGE : BLUE}" stroke="#fff" stroke-width="2"` +
      `${showBand && !p.near ? ' opacity="0.22"' : ''}><title>${formatNumber(p.x)} → ${formatNumber(p.y)}</title></circle>`);
  }
  out.push(`<text x="${left + pw / 2}" y="${H - 14}" text-anchor="middle" font-size="30" font-weight="700" fill="${INK}">${esc(labels.x)} →</text>`,
    `<text transform="translate(34 ${top + ph / 2}) rotate(-90)" text-anchor="middle" font-size="30" font-weight="700" fill="${INK}">${esc(labels.y)} →</text>`,
    '</svg>');
  return out.join('');
}
