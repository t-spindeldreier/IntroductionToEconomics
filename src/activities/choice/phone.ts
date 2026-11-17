// Choice on the phone: one button per option; after the reveal, the own result.

import { S } from '../../strings';
import { h } from '../../ui/dom';
import { msLeft } from '../../core/timer';
import { answerStatus, waiting, type PhoneEnv, type PhoneViewFn } from '../../phone/env';

const letter = (i: number) => String.fromCharCode(65 + i);

/** "2,340 points" and "You are 12th of 68", from the leaderboard document. */
export function ownStanding(env: PhoneEnv, showGain: boolean): HTMLElement | null {
  const board = env.client.board;
  if (!board) return null;
  const mine = board.scores[env.me.pid];
  if (!mine) return h('p', { class: 'muted' }, S.noScoreYet);
  const [points, rank, gain] = mine;
  return h('div', { class: 'standing' },
    showGain && gain > 0 ? h('p', { class: 'gain' }, `+${gain}`) : null,
    h('p', { class: 'points' }, `${points.toLocaleString('en-US')} ${S.points}`),
    h('p', { class: 'rank' }, S.rankOf(rank, board.n)));
}

export const choicePhone: PhoneViewFn = (view, env) => {
  const key = view.key!;
  const options = view.options as string[];
  const label = (i: number) => (view.letters ? `${letter(i)}. ${options[i]}` : options[i]);
  const answer = env.client.answers[key];

  if (view.phase === 'leaderboard') return waiting(ownStanding(env, false));
  if (view.phase === 'split') return waiting();

  if (view.phase === 'reveal') {
    const reveal = view.reveal as { correct: number | null; explain: string | null };
    const hasCorrect = reveal.correct !== null;
    const answered = answer && answer.state === 'ok';
    const right = answered && answer.v === reveal.correct;
    return h('div', { class: 'card' },
      !answered ? h('p', { class: 'result none' }, S.noAnswer)
        : hasCorrect ? h('p', { class: `result ${right ? 'right' : 'wrong'}` }, right ? `✓ ${S.correct}` : `✗ ${S.incorrect}`)
        : null,
      answered ? h('p', { class: 'muted' }, `${S.yourAnswer}: ${label(answer.v)}`) : null,
      hasCorrect ? h('p', null, `${S.answerWas}: `, h('strong', null, label(reveal.correct!))) : null,
      reveal.explain ? h('p', { class: 'muted' }, reveal.explain) : null,
      view.scored ? ownStanding(env, true) : null);
  }

  if (answer) {
    return h('div', { class: 'card' }, answerStatus(answer),
      h('p', { class: 'muted' }, `${S.yourAnswer}: ${label(answer.v)}`),
      h('p', { class: 'muted' }, S.lookAtScreen));
  }

  const left = msLeft(env.room, env.client.now());
  if (view.phase !== 'open' || !env.room.open || left === 0) {
    return waiting(view.phase === 'open' ? h('p', { class: 'badge' }, S.timesUp) : null);
  }

  // Open: tapping an option sends it at once and locks all buttons.
  const buttons = options.map((_, i) => h('button', {
    class: 'btn option',
    onclick: () => {
      for (const b of buttons) (b as HTMLButtonElement).disabled = true;
      void env.client.submit(key, i);
    },
  }, label(i)));
  return h('div', { class: 'card' },
    h('p', { class: 'muted' }, String(view.q)),
    h('p', { class: 'question' }, String(view.text)),
    h('div', { class: options.length === 2 ? 'two-buttons' : 'options' }, buttons));
};
