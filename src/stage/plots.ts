// Hand-drawn SVG plots for the projector: the log-scale dot plot of the guess
// reveal and the horizontal bars of a choice reveal. No chart library.
//
// Conventions: text is always in ink (never in a series colour), each row carries
// a written label next to its colour, and every mark has a native tooltip.

import { h, svg } from '../ui/dom';
import { logPosition, formatNumber } from '../core/stats';

export const ARM_COLOURS = ['#0072b2', '#d55e00', '#16181d', '#6b7280']; // blue, orange (colour-blind safe), then neutrals
const INK = '#16181d';
const GRID = '#d9dbe0';

export interface DotRow {
  label: string;
  title?: string;
  values: number[];
  median: number | null;
}

/**
 * One row of dots per arm on a shared log axis. Values outside the axis are
 * pinned to its edge. Dots that would overlap are stacked.
 */
export function dotPlot(rows: DotRow[], axis: { min: number; max: number; scale?: string },
  truth: { value: number; label: string } | null): SVGElement {
  const W = 1600, left = 40, right = 40, rowH = rows.length >= 3 ? 140 : 190, top = truth ? 70 : 30, axisH = 70;
  const plotW = W - left - right;
  const H = top + rows.length * rowH + axisH;
  const linear = axis.scale === 'linear';
  const position = (v: number) => (linear
    ? Math.min(1, Math.max(0, (v - axis.min) / (axis.max - axis.min)))
    : logPosition(v, axis.min, axis.max));
  const x = (v: number) => left + position(v) * plotW;
  const name = (r: DotRow) => r.title ?? r.label;
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'dotplot', role: 'img',
    'aria-label': rows.map((r) => `${name(r)}: median ${r.median === null ? 'none' : formatNumber(r.median)}`).join('; ') });

  // Axis ticks. Linear: five even steps. Log: every power of ten, plus 2 and 5
  // times each when the axis spans less than three powers of ten.
  const ticks: number[] = [];
  if (linear) {
    for (let i = 0; i <= 5; i++) ticks.push(axis.min + ((axis.max - axis.min) * i) / 5);
  } else {
    const dense = Math.log10(axis.max / axis.min) < 3;
    for (let p = Math.floor(Math.log10(axis.min)); p <= Math.ceil(Math.log10(axis.max)); p++) {
      for (const m of dense ? [1, 2, 5] : [1]) {
        const v = m * 10 ** p;
        if (v >= axis.min * 0.999 && v <= axis.max * 1.001) ticks.push(v);
      }
    }
  }
  for (const v of ticks) {
    root.append(
      svg('line', { x1: x(v), x2: x(v), y1: top, y2: top + rows.length * rowH, stroke: GRID, 'stroke-width': 2 }),
      svg('text', { x: x(v), y: H - 22, 'text-anchor': 'middle', 'font-size': 34, fill: INK }, formatNumber(v)),
    );
  }

  const r = 11;
  rows.forEach((row, i) => {
    const cy = top + i * rowH + rowH / 2;
    const colour = ARM_COLOURS[i % ARM_COLOURS.length];
    // Stack dots that share a horizontal slot, alternating above and below the centre line.
    const slots = new Map<number, number>();
    for (const v of [...row.values].sort((a, b) => a - b)) {
      const slot = Math.round(x(v) / (r * 2));
      const k = slots.get(slot) ?? 0;
      slots.set(slot, k + 1);
      const offset = Math.ceil(k / 2) * (r * 2) * (k % 2 ? -1 : 1);
      const maxOffset = rowH / 2 - r - 6;
      const dot = svg('circle', { cx: slot * r * 2, cy: cy + Math.max(-maxOffset, Math.min(maxOffset, offset)),
        r, fill: colour, stroke: '#fff', 'stroke-width': 2 });
      dot.append(svg('title', {}, `${name(row)}: ${formatNumber(v)}`));
      root.append(dot);
    }
    // Median marker: a vertical bar in ink with its value.
    if (row.median !== null) {
      const mx = x(row.median);
      root.append(
        svg('line', { x1: mx, x2: mx, y1: cy - rowH / 2 + 14, y2: cy + rowH / 2 - 14, stroke: INK, 'stroke-width': 6, 'stroke-linecap': 'round' }),
      );
    }
  });

  // The true value: one line across all rows.
  if (truth) {
    const tx = x(truth.value);
    const anchor = tx > W * 0.7 ? 'end' : tx < W * 0.3 ? 'start' : 'middle';
    root.append(
      svg('line', { x1: tx, x2: tx, y1: top - 14, y2: top + rows.length * rowH, stroke: INK, 'stroke-width': 4, 'stroke-dasharray': '14 10' }),
      svg('text', { x: tx, y: 40, 'text-anchor': anchor, 'font-size': 40, 'font-weight': 700, fill: INK }, truth.label),
    );
  }
  return root;
}

/** Horizontal bars for the options of a choice question, with counts. */
export function optionBars(options: string[], counts: number[], correct: number | null, letters: boolean): HTMLElement {
  const max = Math.max(1, ...counts);
  return h('div', { class: 'bars', role: 'list' }, options.map((option, i) => {
    const isCorrect = correct === i;
    return h('div', { class: `bar-row ${isCorrect ? 'correct' : ''}`, role: 'listitem', title: `${option}: ${counts[i]}` },
      h('div', { class: 'bar-label' },
        isCorrect ? h('span', { class: 'tick', 'aria-label': 'correct' }, '✓ ') : null,
        letters ? `${String.fromCharCode(65 + i)}. ` : '', option),
      h('div', { class: 'bar-track' },
        h('div', { class: 'bar-fill', style: `width:${(counts[i] / max) * 100}%` }),
        h('span', { class: 'bar-count' }, counts[i])));
  }));
}
