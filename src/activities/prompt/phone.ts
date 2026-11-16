import { h, rich } from '../../ui/dom';
import type { PhoneViewFn } from '../../phone/env';

/** Prompt on the phone: the same text as on the stage; the countdown is in the header. */
export const promptPhone: PhoneViewFn = (view) =>
  h('div', { class: 'card' },
    h('p', { class: view.phase === 'reveal' ? 'muted' : 'question' }, rich(String(view.text))),
    view.phase === 'reveal' ? h('p', { class: 'reveal-text' }, rich(String(view.reveal))) : null);
