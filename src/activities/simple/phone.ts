import { S } from '../../strings';
import { h } from '../../ui/dom';
import { waiting, type PhoneViewFn } from '../../phone/env';
import { ownStanding } from '../choice/phone';

export const lobbyPhone: PhoneViewFn = () =>
  waiting(h('p', { class: 'badge' }, S.youAreIn), h('p', { class: 'muted' }, S.waitingHint));

export const podiumPhone: PhoneViewFn = (_view, env) =>
  waiting(env.client.board ? h('p', { class: 'muted' }, S.finalRank) : null, ownStanding(env, false));

export const endPhone: PhoneViewFn = (view, env) =>
  h('div', { class: 'card center' },
    h('h1', null, String(view.text)),
    env.client.board ? h('p', { class: 'muted' }, S.finalRank) : null,
    ownStanding(env, false));
