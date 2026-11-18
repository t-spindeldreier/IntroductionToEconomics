import { S } from '../../strings';
import { h, rich } from '../../ui/dom';
import { barChartSvg } from '../../core/chart';
import type { StageViewFn } from '../../stage/env';

/** The chart; in the phase "part" only the bars before "revealFrom". */
export const chartStage: StageViewFn = (env) => {
  const a = env.activity;
  const part = env.frame.phase === 'part';
  const plot = h('div', { class: 'chart-box' });
  plot.innerHTML = barChartSvg(a as any, part ? a.labels.indexOf(a.revealFrom) : a.values.length);
  return h('div', { class: 'view' },
    h('h1', { class: 'headline' }, part ? a.partTitle ?? a.title : a.title),
    plot,
    !part && a.takeaway ? h('div', { class: 'answer-card compact' }, h('p', { class: 'answer-text' }, rich(a.takeaway))) : null,
    a.source ? h('p', { class: 'source muted' }, `${S.source}: ${a.source}`) : null);
};
