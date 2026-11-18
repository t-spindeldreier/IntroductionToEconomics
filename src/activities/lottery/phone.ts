// Lottery on the phone: pick day and month, see the number, send "called" or "not called".

import { S } from '../../strings';
import { h } from '../../ui/dom';
import { answerStatus, waiting, type PhoneViewFn } from '../../phone/env';
import { DRAFT_1969 } from './draft1969';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const lotteryPhone: PhoneViewFn = (view, env) => {
  const key = view.key!;
  const cutoff = Number(view.cutoff);
  const answer = env.client.answers[key];
  const draft = (env.draft[key] ??= {}) as { month?: number; day?: number; number?: number };

  if (answer) {
    const called = answer.v === 0;
    return h('div', { class: 'card center' }, view.phase === 'open' ? answerStatus(answer) : null,
      draft.number ? h('p', { class: 'muted' }, S.yourNumber) : null,
      draft.number ? h('p', { class: 'big-value' }, String(draft.number)) : null,
      h('p', { class: `result ${called ? 'wrong' : 'right'}` }, called ? S.youCalled : S.youNotCalled),
      h('p', { class: 'muted' }, S.cutoffNote(cutoff)));
  }
  if (view.phase !== 'open') return waiting();

  const day = h('select', { class: 'pick', 'aria-label': S.day }, h('option', { value: '' }, S.day),
    Array.from({ length: 31 }, (_, i) => h('option', { value: String(i + 1) }, String(i + 1)))) as HTMLSelectElement;
  const month = h('select', { class: 'pick', 'aria-label': S.month }, h('option', { value: '' }, S.month),
    MONTHS.map((m, i) => h('option', { value: String(i) }, m))) as HTMLSelectElement;
  if (draft.day) day.value = String(draft.day);
  if (draft.month !== undefined) month.value = String(draft.month);
  // Remember a half-made choice: the view is rebuilt whenever the room changes.
  day.addEventListener('change', () => { draft.day = day.value === '' ? undefined : Number(day.value); });
  month.addEventListener('change', () => { draft.month = month.value === '' ? undefined : Number(month.value); });
  const error = h('p', { class: 'error', role: 'alert' });
  const send = h('button', { class: 'btn primary', type: 'submit' }, S.drawNumber) as HTMLButtonElement;
  const submit = (e: Event) => {
    e.preventDefault();
    const number = month.value === '' || day.value === '' ? undefined : DRAFT_1969[Number(month.value)][Number(day.value) - 1];
    if (!number) {
      error.textContent = S.noSuchDay;
      return;
    }
    draft.number = number;
    send.disabled = true;
    void env.client.submit(key, number <= cutoff ? 0 : 1);
  };
  return h('form', { class: 'card', onsubmit: submit, novalidate: true },
    h('p', { class: 'question' }, S.birthdayQuestion),
    h('div', { class: 'two-buttons' }, day, month),
    h('p', { class: 'muted' }, S.birthdayPrivate),
    error, send);
};
