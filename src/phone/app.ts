// The student's phone: a header with the nickname, the current activity, a footer.
// The whole screen is rebuilt whenever something relevant changes; it is small.

import { S } from '../strings';
import { h, replaceContent } from '../ui/dom';
import { countdown } from '../ui/countdown';
import { msLeft } from '../core/timer';
import { nickname } from '../core/nicknames';
import { needsBoard } from '../activities/defs';
import { phoneViews } from '../activities/phoneViews';
import { db } from '../data/firebase';
import { browserStore, PhoneClient } from '../data/phoneClient';
import { waiting, type PhoneEnv } from './env';

export function startPhone(root: HTMLElement, code: string): void {
  const client = new PhoneClient(db, code, browserStore(), needsBoard);
  const draft: Record<string, any> = {};
  let lastSignature = '';

  const render = (force = false) => {
    // Rebuild only when something visible changed, so that typing in the guess
    // field is never interrupted by an unrelated update.
    const room = client.room;
    const signature = JSON.stringify([client.status, room?.seq, room?.status, client.me, client.online,
      room?.open ? client.answers[room.open.key] : null, room?.view.key ? client.answers[room.view.key] : null,
      client.board?.id, client.board?.n, client.me && client.board?.scores[client.me.pid]]);
    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    replaceContent(root, screen());
  };

  const screen = (): HTMLElement => {
    const room = client.room;
    const me = client.me;
    if (client.status === 'missing') {
      return shell(null, h('div', { class: 'card center' }, h('p', null, S.roomNotFound),
        h('a', { class: 'btn', href: location.pathname }, S.enterCode)));
    }
    if (client.status === 'loading' || !room || !me) {
      return shell(null, h('div', { class: 'waiting' }, h('p', { class: 'muted' }, S.joining)));
    }
    const env: PhoneEnv = { client, room, me, draft, rerender: () => render(true) };

    let body: HTMLElement;
    if (room.status !== 'open') {
      body = h('div', { class: 'card center' }, h('h1', null, S.roomClosed));
    } else if (!me.joined) {
      body = h('div', { class: 'waiting' }, h('p', { class: 'muted' }, S.joining));
    } else {
      // If something is open that this phone has not answered, show that; else the current view.
      const view = phoneViews[room.view.type];
      body = view ? view(room.view, env) : waiting();
    }

    const timer = msLeft(room, client.now()) !== null && room.status === 'open'
      ? countdown(() => (client.room ? msLeft(client.room, client.now()) : null), { onZero: () => render(true) })
      : null;
    const header = h('header', { class: 'phone-header' },
      h('div', { class: 'nick' },
        h('span', { class: 'muted small' }, S.youAre),
        h('strong', null, nickname(me.adj, me.eco))),
      me.joined && room.status === 'open'
        ? h('button', { class: 'reroll', title: S.reroll, 'aria-label': S.reroll, onclick: () => void client.reroll() }, '⟳')
        : null,
      timer);
    return shell(header, body);
  };

  const shell = (header: HTMLElement | null, body: HTMLElement): HTMLElement =>
    h('div', { class: 'phone' }, header, h('main', null, body),
      h('footer', { class: 'phone-footer' },
        !client.online ? h('p', { class: 'offline', role: 'status' }, S.reconnecting) : null,
        h('p', null, S.privacy)));

  client.onChange(() => render());
  client.start();
  render();
}

/** The page without a room code: type the four letters from the screen. */
export function startLanding(root: HTMLElement): void {
  const input = h('input', {
    class: 'code-input', type: 'text', maxLength: 4, autocomplete: 'off', autocapitalize: 'characters',
    spellcheck: false, 'aria-label': S.enterCode, placeholder: 'ABCD',
  }) as HTMLInputElement;
  const go = (e: Event) => {
    e.preventDefault();
    const code = input.value.trim().toUpperCase();
    if (/^[A-Z]{4}$/.test(code)) location.search = `?r=${code}`;
  };
  replaceContent(root, h('div', { class: 'phone' },
    h('main', null, h('form', { class: 'card center', onsubmit: go },
      h('h1', null, S.appName),
      h('label', { class: 'muted' }, S.enterCodeHint, input),
      h('button', { class: 'btn primary', type: 'submit' }, S.join))),
    h('footer', { class: 'phone-footer' }, h('p', null, S.privacy),
      h('p', null, h('a', { href: '#/stage' }, S.hostLink)))));
}
