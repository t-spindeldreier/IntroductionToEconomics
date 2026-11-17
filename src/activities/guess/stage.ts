// Guess on the stage. While answers are collected only the neutral question is
// shown: nothing here may hint at the two versions before the "versions" phase.

import { S } from '../../strings';
import { h, rich } from '../../ui/dom';
import { formatNumber } from '../../core/stats';
import type { Activity } from '../../core/types';
import { answerCount, type StageEnv, type StageViewFn } from '../../stage/env';
import { ARM_COLOURS, dotPlot } from '../../stage/plots';
import { modePill } from '../../ui/pill';
import { part1Text, summariseGuess } from './def';

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
  const last = phase === (a.truth ? 'truth' : 'results');
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
