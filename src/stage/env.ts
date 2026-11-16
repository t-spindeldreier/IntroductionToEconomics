import type { Activity, Frame, RoomState, Session } from '../core/types';
import type { StageController } from '../data/hostClient';
import { S } from '../strings';
import { h } from '../ui/dom';
import { countdown } from '../ui/countdown';
import { msLeft } from '../core/timer';
import { qrSvg } from './qr';

/** What every stage view gets. */
export interface StageEnv {
  ctl: StageController;
  session: Session;
  room: RoomState;
  frame: Frame;
  activity: Activity;
  joinUrl: string;
}

/** A stage view draws the projector picture for one frame. */
export type StageViewFn = (env: StageEnv) => HTMLElement;

/** The large countdown in the corner of a stage view. */
export function stageCountdown(env: StageEnv): HTMLElement {
  return countdown(() => (env.ctl.room ? msLeft(env.ctl.room, env.ctl.now()) : null), { class: 'stage-countdown' });
}

export function answerCount(n: number): HTMLElement {
  return h('p', { class: 'count' }, h('span', { class: 'count-number' }, n), ' ', S.answers(n).replace(/^\d+\s/, ''));
}

/** QR code, URL and room code: used by the lobby and by the J overlay. */
export function joinBlock(env: { joinUrl: string; room: RoomState }): HTMLElement {
  const shown = env.joinUrl.replace(/^https?:\/\//, '').replace(/\?r=.*$/, '');
  return h('div', { class: 'join' },
    h('div', { class: 'qr' }, qrSvg(env.joinUrl)),
    h('div', { class: 'join-text' },
      h('p', { class: 'label' }, S.joinAt),
      h('p', { class: 'join-url' }, shown),
      h('p', { class: 'label' }, S.roomCode),
      h('p', { class: 'join-code' }, env.room.code)));
}
