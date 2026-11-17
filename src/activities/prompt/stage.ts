import { S } from '../../strings';
import { h, rich } from '../../ui/dom';
import { modePill } from '../../ui/pill';
import { stageCountdown, type StageViewFn } from '../../stage/env';

const figure = (src: string | undefined) =>
  src && src.startsWith('data:image/') ? h('img', { class: 'figure', src, alt: '' }) : null;


/** Prompt on the stage: how to work on it, the text, a countdown, a figure; then the hidden text. */
export const promptStage: StageViewFn = (env) => {
  const a = env.activity;
  if (env.frame.phase === 'reveal') {
    const image = figure(env.session.images[a.revealImage]);
    return h('div', { class: `view ${image ? 'with-figure' : 'centered'}` },
      h('p', { class: 'prompt-before muted' }, rich(a.text)),
      h('div', { class: 'figure-row' },
        h('div', { class: 'answer-card' },
          h('p', { class: 'answer-label' }, a.revealTitle ?? S.modelAnswer),
          h('p', { class: 'answer-text' }, rich(a.reveal))),
        image));
  }
  const image = figure(env.session.images[a.image]);
  return h('div', { class: `view ${image ? 'with-figure' : 'centered'}` },
    env.room.timer ? stageCountdown(env) : null,
    modePill(a.mode),
    h('h1', { class: `stage-question ${image ? 'small' : ''}` }, rich(a.text)),
    image);
};
