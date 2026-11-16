// What every phone view gets, plus two small building blocks they share.

import type { PhoneView, RoomState } from '../core/types';
import type { Answer, Identity, PhoneClient } from '../data/phoneClient';
import { S } from '../strings';
import { h } from '../ui/dom';

export interface PhoneEnv {
  client: PhoneClient;
  room: RoomState;
  me: Identity;
  /** Unsent input per question (for example the more/less choice before the guess). Survives re-renders. */
  draft: Record<string, any>;
  rerender(): void;
}

/** A phone view turns the room's view payload into a piece of screen. */
export type PhoneViewFn = (view: PhoneView, env: PhoneEnv) => HTMLElement;

/** "Sending…" until the server has confirmed, then "Received". */
export function answerStatus(answer: Answer): HTMLElement {
  if (answer.state === 'pending') return h('p', { class: 'status pending', role: 'status' }, S.sending);
  if (answer.state === 'late') return h('p', { class: 'status late', role: 'status' }, S.notCounted);
  return h('p', { class: 'status ok', role: 'status' }, '✓ ', S.received);
}

/** The calm state between activities. */
export function waiting(...extra: (Node | string | null)[]): HTMLElement {
  return h('div', { class: 'waiting' }, h('div', { class: 'eyes', 'aria-hidden': 'true' }, '↑'),
    h('h1', null, S.lookAtScreen), ...extra);
}
