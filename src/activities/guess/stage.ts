// Guess on the stage. While answers are collected only the neutral question is
// shown: nothing here may hint at the two versions before the "versions" phase.

import { S } from '../../strings';
import { h, rich } from '../../ui/dom';
import { formatNumber } from '../../core/stats';
import type { Activity } from '../../core/types';
import { answerCount, type StageEnv, type StageViewFn } from '../../stage/env';
import { ARM_COLOURS, dotPlot } from '../../stage/plots';
import { modePill } from '../../ui/pill';
import { part1Text, signed, summariseChange, summariseGuess } from './def';
import { scatterSvg, summariseBar, type BarSide } from '../../core/scatter';

/** The neutral question with the answer count. Also used by the lobby. */
export function guessCollecting(a: Activity, env: StageEnv): HTMLElement {
  return h('div', { class: 'collecting' },
    h('h1', { class: 'stage-question' }, rich(a.stageText)),
    h('p', { class: 'hint' }, a.stageHint ?? S.keepPrivate),
    answerCount(env.ctl.responses(a.id).length));
}

export const guessStage: StageViewFn = (env) => {
  const a = env.activity;
  const phase = env.frame.phase;
  if (phase === 'open' || phase === 'closed') {
    return h('div', { class: 'view centered' }, phase === 'open' ? modePill('phone') : null, guessCollecting(a, env));
  }

  // The bar game: first against second guess, then the students next to the bar.
  if (phase === 'scatter' || phase === 'band') {
    const s = summariseBar(a, env.ctl);
    const band = phase === 'band';
    const plot = h('div', { class: 'scatter-box' });
    plot.innerHTML = scatterSvg(s, a.axis, band);
    const card = (i: number, title: string, sub: string, side: BarSide) =>
      h('div', { class: 'median-card' },
        h('p', { class: 'version-label' }, h('span', { class: 'swatch', style: `background:${ARM_COLOURS[i]}` }), title),
        h('p', { class: 'median-value' }, side.median === null ? '–' : formatNumber(side.median)),
        h('p', { class: 'muted' }, `${S.medianSecond} · ${sub} · ${S.students(side.n)}`));
    return h('div', { class: 'view' },
      h('h1', { class: 'headline' }, a.revealHeadline ?? S.barHeadline),
      h('div', { class: 'scatter-row' }, plot,
        h('div', { class: 'scatter-side' },
          h('p', { class: 'kicker' }, S.barMessage, ': “', rich(a.hint), '”'),
          h('div', { class: 'medians' }, band
            ? [card(0, S.justBelow, S.noMessage, s.nearBelow), card(1, S.justAbove, S.gotMessage, s.nearAbove)]
            : [card(0, S.allBelow, S.noMessage, s.below), card(1, S.allAbove, S.gotMessage, s.above)]),
          band ? h('div', { class: 'answer-card compact' },
            h('p', { class: 'answer-label' }, S.jumpLabel),
            h('p', { class: 'answer-main' }, signed(s.jump, formatNumber)),
            a.takeaway ? h('p', { class: 'answer-text' }, rich(a.takeaway)) : null,
            a.truth ? h('p', { class: 'muted' }, `${S.trueValue}: ${a.truth.label}`) : null) : null)));
  }

  // Before and after: one row per group; the "did" phase adds the subtraction.
  if (phase === 'change' || phase === 'did') {
    const { rows, did } = summariseChange(a, env.ctl);
    const treated = rows.find((r) => r.hinted), control = rows.find((r) => !r.hinted);
    const num = (x: number | null) => (x === null ? '–' : formatNumber(x));
    return h('div', { class: 'view' },
      h('h1', { class: 'headline' }, a.revealHeadline ?? S.changeHeadline),
      h('p', { class: 'kicker' }, S.theHint, ': “', rich(a.hint), '”'),
      h('table', { class: 'change-table' },
        h('thead', null, h('tr', null, h('th', null), h('th', null, S.firstGuess), h('th', null, S.secondGuess), h('th', null, S.change))),
        h('tbody', null, rows.map((r, i) => h('tr', null,
          h('th', null, h('span', { class: 'swatch', style: `background:${ARM_COLOURS[i]}` }), r.title,
            h('span', { class: 'muted' }, ` · ${r.hinted ? S.gotHint : S.noHint} · ${S.students(r.n)}`)),
          h('td', null, num(r.before)), h('td', null, num(r.after)),
          h('td', { class: 'change-cell' }, signed(r.change, formatNumber)))))),
      phase === 'did' && treated && control ? h('div', { class: 'answer-card compact' },
        h('p', { class: 'answer-label' }, S.didLabel),
        h('p', { class: 'answer-main' }, `${signed(treated.change, formatNumber)} − (${signed(control.change, formatNumber)}) = ${signed(did, formatNumber)}`),
        a.takeaway ? h('p', { class: 'answer-text' }, rich(a.takeaway)) : null)
        : h('p', { class: 'plot-note muted' }, S.mediansBoth));
  }

  const groups = summariseGuess(a, env.ctl);
  const several = groups.length > 1;
  const swatch = (i: number) => (several ? h('span', { class: 'swatch', style: `background:${ARM_COLOURS[i]}` }) : null);

  if (phase === 'versions') {
    return h('div', { class: 'view' },
      h('h1', { class: 'headline' }, a.revealHeadline ?? ''),
      h('div', { class: 'versions' }, groups.map((g, i) =>
        h('div', { class: 'version', style: `border-color:${ARM_COLOURS[i]}` },
          h('p', { class: 'version-label' }, swatch(i), g.title),
          h('p', { class: 'version-text' }, rich(a.part1 ? part1Text(a, a.arms[i].anchor) : a.part2)),
          h('p', { class: 'version-n' }, S.students(g.n))))));
  }

  // results and truth
  const last = !a.before && phase === (a.truth ? 'truth' : 'results'); // with "before", the takeaway belongs to "did"
  return h('div', { class: 'view' },
    h('p', { class: 'kicker' }, rich(a.stageText)),
    h('div', { class: 'medians' }, groups.map((g, i) =>
      h('div', { class: 'median-card' },
        h('p', { class: 'version-label' }, swatch(i), g.title,
          !a.splitBy && several && a.arms[i].anchor !== undefined ? h('span', { class: 'muted' }, ` · “${a.arms[i].anchor}”`) : null),
        h('p', { class: 'median-value' }, g.median === null ? '–' : formatNumber(g.median)),
        h('p', { class: 'muted' }, `${S.median} · ${S.answers(g.n)}`)))),
    dotPlot(groups, a.axis, phase === 'truth' ? a.truth : null),
    last && a.takeaway
      ? h('div', { class: 'answer-card compact' }, h('p', { class: 'answer-text' }, rich(a.takeaway)))
      : h('p', { class: 'plot-note muted' }, '▏ = ', S.median, a.axis.scale === 'log' ? ' · log scale' : ''));
};
