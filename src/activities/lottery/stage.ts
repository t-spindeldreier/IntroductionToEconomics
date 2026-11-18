import { S } from '../../strings';
import { h, rich } from '../../ui/dom';
import { countOptions } from '../../core/stats';
import { answerCount, type StageViewFn } from '../../stage/env';
import { optionBars } from '../../stage/plots';
import { modePill } from '../../ui/pill';

/** While collecting: the instruction and a count. Then: how many of the room were called up. */
export const lotteryStage: StageViewFn = (env) => {
  const a = env.activity;
  const responses = env.ctl.responses(a.id);
  if (env.frame.phase !== 'reveal') {
    return h('div', { class: 'view centered' }, env.frame.phase === 'open' ? modePill('phone') : null,
      h('div', { class: 'collecting' },
        h('h1', { class: 'stage-question' }, rich(a.text)),
        h('p', { class: 'hint' }, S.lotteryPrivate),
        answerCount(responses.length)));
  }
  const counts = countOptions(responses.map((r) => r.v), 2);
  const share = responses.length ? Math.round((100 * counts[0]) / responses.length) : 0;
  return h('div', { class: 'view' },
    h('p', { class: 'kicker' }, rich(a.text)),
    h('h1', { class: 'headline' }, S.lotteryHeadline(counts[0], responses.length, share)),
    optionBars([S.calledUp(a.cutoff), S.notCalled(a.cutoff)], counts, null, false),
    a.takeaway ? h('div', { class: 'answer-card compact' }, h('p', { class: 'answer-text' }, rich(a.takeaway))) : null);
};
