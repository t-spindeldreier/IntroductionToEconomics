// Entry point. GitHub Pages has no server-side routing, so everything hangs off
// one page:
//   ?r=ABCD        a student's phone in room ABCD (this is what the QR code encodes)
//   #/stage        the host's pages (sign-in, sessions and rooms)
//   #/stage/ABCD   the stage of room ABCD
// The stage code (auth, QR code, plots, export, YAML) is loaded only on #/stage,
// so phones never download it.

import './styles.css';
import { h, replaceContent } from './ui/dom';
import { NOT_CONFIGURED } from './data/firebase';
import { ROOM_CODE_PATTERN } from './core/identity';
import { startLanding, startPhone } from './phone/app';

const root = document.getElementById('app')!;
const code = (new URLSearchParams(location.search).get('r') ?? '').toUpperCase();
const onStage = () => location.hash.startsWith('#/stage');

if (NOT_CONFIGURED) {
  replaceContent(root, h('div', { class: 'phone' }, h('main', null, h('div', { class: 'card center' },
    h('h1', null, 'Not configured yet'),
    h('p', null, 'Paste your Firebase web configuration into src/firebase-config.ts and deploy again (see README).')))));
} else if (onStage()) {
  void import('./stage/app').then((m) => m.startStage(root));
} else if (ROOM_CODE_PATTERN.test(code)) {
  startPhone(root, code);
} else {
  startLanding(root);
  // The "Host sign-in" link only changes the hash: load the stage then.
  window.addEventListener('hashchange', () => { if (onStage()) location.reload(); });
}
