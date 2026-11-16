import { h, rich } from '../../ui/dom';
import { stageCountdown, type StageViewFn } from '../../stage/env';

/** Prompt on the stage: the text, a countdown if there is one, then the hidden text. */
export const promptStage: StageViewFn = (env) => {
  const a = env.activity;
  if (env.frame.phase === 'reveal') {
    return h('div', { class: 'view centered' },
      h('p', { class: 'prompt-before muted' }, rich(a.text)),
      h('div', { class: 'reveal-card' }, rich(a.reveal)));
  }
  return h('div', { class: 'view centered' },
    env.room.timer ? stageCountdown(env) : null,
    h('h1', { class: 'stage-question' }, rich(a.text)));
};
