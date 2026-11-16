import { S } from '../../strings';
import { h, rich } from '../../ui/dom';
import { modePill } from '../../ui/pill';
import type { PhoneViewFn } from '../../phone/env';

/** Prompt on the phone: how to work on it, the text; later the hidden text. The countdown is in the header. */
export const promptPhone: PhoneViewFn = (view) =>
  h('div', { class: 'card' },
    modePill(view.mode as string | null),
    h('p', { class: view.phase === 'reveal' ? 'muted' : 'question' }, rich(String(view.text))),
    view.phase === 'reveal'
      ? h('div', { class: 'reveal-text' },
        h('p', { class: 'answer-label' }, String(view.revealTitle ?? S.modelAnswer)),
        h('p', null, rich(String(view.reveal))))
      : null);
