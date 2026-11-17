// Guess on the phone: (optional) more/less question, then the numeric guess.

import { S } from '../../strings';
import { h, rich } from '../../ui/dom';
import { armOf } from '../../core/identity';
import { formatNumber, parseGuess } from '../../core/stats';
import { answerStatus, waiting, type PhoneViewFn } from '../../phone/env';
import { part1Text } from './def';

export const guessPhone: PhoneViewFn = (view, env) => {
  const key = view.key!;
  const arms = (view.arms ?? []) as { label: string; anchor: unknown }[];
  const arm = arms.length ? arms[armOf(env.me.pid, key, arms.length)] : null;
  const answer = env.client.answers[key];
  // A hint that only one group gets: decided by this phone's own answer to another question.
  const hinted = view.hint !== undefined && env.client.answers[String(view.hintKey)]?.v === view.hintOpt;

  // After the reveal has started, the phone may say which version it had.
  if (view.phase !== 'open') {
    const revealed = view.phase !== 'closed' && arm && arms.length > 1;
    return waiting(
      view.hint !== undefined ? h('p', { class: 'badge' }, hinted ? S.youHadHint : S.youHadNoHint) : null,
      hinted ? h('p', { class: 'quote' }, rich(String(view.hint))) : null,
      revealed ? h('p', { class: 'badge' }, S.youHadVersion(arm.label)) : null,
      revealed && view.part1 ? h('p', { class: 'quote' }, rich(part1Text(view, arm.anchor))) : null,
      answer?.state === 'ok' ? h('p', { class: 'muted' }, `${S.yourGuess}: ${formatNumber(answer.v)}`) : null,
    );
  }

  if (answer) {
    return h('div', { class: 'card' }, answerStatus(answer),
      h('p', { class: 'big-value' }, formatNumber(answer.v)),
      h('p', { class: 'muted' }, S.lookAtScreen));
  }

  const draft = (env.draft[key] ??= {}) as { p1?: number; text?: string };
  const first = view.beforeKey ? env.client.answers[String(view.beforeKey)] : undefined;

  // Part 1: more or less than the anchor?
  if (view.part1 && draft.p1 === undefined) {
    const options = view.p1opts as string[];
    return h('div', { class: 'card' },
      h('p', { class: 'question' }, rich(part1Text(view, arm?.anchor))),
      h('div', { class: 'two-buttons' }, options.map((label, i) =>
        h('button', { class: 'btn', onclick: () => { draft.p1 = i; env.rerender(); } }, label))));
  }

  // Part 2: the guess. "___" in the text marks where the input goes.
  const min = view.min as number, max = view.max as number, xmin = view.xmin as boolean;
  const [before, after] = String(view.part2).split('___');
  const echo = h('p', { class: 'muted echo', 'aria-live': 'polite' });
  const error = h('p', { class: 'error', role: 'alert' });
  const input = h('input', {
    class: 'guess-input', type: 'text', inputMode: 'decimal', autocomplete: 'off', enterKeyHint: 'send',
    'aria-label': S.yourGuess, value: draft.text ?? '',
  }) as HTMLInputElement;
  const send = h('button', { class: 'btn primary', type: 'submit' }, S.send) as HTMLButtonElement;
  const valid = (x: number | null): x is number => x !== null && (xmin ? x > min : x >= min) && x <= max;
  const refresh = () => {
    draft.text = input.value;
    const x = parseGuess(input.value);
    echo.textContent = x === null ? '' : S.guessEcho(formatNumber(x));
    error.textContent = '';
    send.disabled = input.value.trim() === '';
  };
  const submit = (e: Event) => {
    e.preventDefault();
    const x = parseGuess(input.value);
    if (!valid(x)) {
      error.textContent = (xmin ? S.guessAbove : S.guessInvalid)(formatNumber(min), formatNumber(max));
      return;
    }
    send.disabled = true; // a second tap does nothing
    void env.client.submit(key, x, draft.p1);
  };
  input.addEventListener('input', refresh);
  refresh();
  return h('form', { class: 'card', onsubmit: submit, novalidate: true },
    hinted ? h('p', { class: 'quote hint-box' }, rich(String(view.hint))) : null,
    first ? h('p', { class: 'muted' }, `${S.firstGuess}: ${formatNumber(first.v)}`) : null,
    h('label', { class: 'question' }, before, after !== undefined ? input : null, after ?? ''),
    after === undefined ? input : null,
    echo, error, send);
};
