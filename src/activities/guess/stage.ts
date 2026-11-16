// Guess on the stage. While answers are collected only the neutral question is
// shown: nothing here may hint at the two versions before the "versions" phase.

import { S } from '../../strings';
import { h, rich } from '../../ui/dom';
import { formatNumber } from '../../core/stats';
import type { Activity } from '../../core/types';
import { answerCount, type StageEnv, type StageViewFn } from '../../stage/env';
import { ARM_COLOURS, dotPlot } from '../../stage/plots';
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
  if (phase === 'open' || phase === 'closed') return h('div', { class: 'view centered' }, guessCollecting(a, env));

  const arms = summariseGuess(a, env.ctl.responses(a.id));
  const swatch = (i: number) => h('span', { class: 'swatch', style: `background:${ARM_COLOURS[i]}` });

  if (phase === 'versions') {
    return h('div', { class: 'view' },
      h('h1', { class: 'headline' }, a.revealHeadline ?? ''),
      h('div', { class: 'versions' }, arms.map((arm, i) =>
        h('div', { class: 'version', style: `border-color:${ARM_COLOURS[i]}` },
          h('p', { class: 'version-label' }, swatch(i), `${S.version} ${arm.label}`),
          h('p', { class: 'version-text' }, rich(a.part1 ? part1Text(a, a.arms[i].anchor) : a.part2)),
          h('p', { class: 'version-n' }, S.students(arm.n))))));
  }

  // results and truth
  return h('div', { class: 'view' },
    h('div', { class: 'medians' }, arms.map((arm, i) =>
      h('div', { class: 'median-card' },
        h('p', { class: 'version-label' }, swatch(i), `${S.version} ${arm.label}`,
          a.arms[i].anchor !== undefined ? h('span', { class: 'muted' }, ` · “${a.arms[i].anchor}”`) : null),
        h('p', { class: 'median-value' }, arm.median === null ? '–' : formatNumber(arm.median)),
        h('p', { class: 'muted' }, `${S.median} · ${S.answers(arm.n)}`)))),
    dotPlot(arms, a.axis, phase === 'truth' ? a.truth : null),
    h('p', { class: 'plot-note muted' }, '▏ = ', S.median, ' · log scale'));
};
