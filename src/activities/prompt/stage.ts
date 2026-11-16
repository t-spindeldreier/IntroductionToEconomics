import { S } from '../../strings';
import { h, rich } from '../../ui/dom';
import { modePill } from '../../ui/pill';
import { stageCountdown, type StageViewFn } from '../../stage/env';

/** Prompt on the stage: how to work on it, the text, a countdown; then the hidden text. */
export const promptStage: StageViewFn = (env) => {
  const a = env.activity;
  if (env.frame.phase === 'reveal') {
    return h('div', { class: 'view centered' },
      h('p', { class: 'prompt-before muted' }, rich(a.text)),
      h('div', { class: 'answer-card' },
        h('p', { class: 'answer-label' }, a.revealTitle ?? S.modelAnswer),
        h('p', { class: 'answer-text' }, rich(a.reveal))));
  }
  return h('div', { class: 'view centered' },
    env.room.timer ? stageCountdown(env) : null,
    modePill(a.mode),
    h('h1', { class: 'stage-question' }, rich(a.text)));
};
