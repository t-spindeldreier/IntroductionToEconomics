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

/**
 * Browsers and GitHub Pages keep the page for a while after a new version is
 * deployed. The host must never work with an old copy (it would reject newer
 * session files), so the stage asks the server which version is current and, if
 * it is older, loads the page again under an address the cache has not seen.
 */
async function isCurrent(): Promise<boolean> {
  if (import.meta.env.DEV) return true;
  try {
    const response = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    const { build } = await response.json();
    const query = new URLSearchParams(location.search);
    if (build === __BUILD__ || query.get('v') === build) return true; // current, or already tried once
    query.set('v', build);
    location.replace(`${location.pathname}?${query}${location.hash}`);
    return false;
  } catch {
    return true; // offline or no version file: carry on with what we have
  }
}

const root = document.getElementById('app')!;
const code = (new URLSearchParams(location.search).get('r') ?? '').toUpperCase();
const onStage = () => location.hash.startsWith('#/stage');

if (NOT_CONFIGURED) {
  replaceContent(root, h('div', { class: 'phone' }, h('main', null, h('div', { class: 'card center' },
    h('h1', null, 'Not configured yet'),
    h('p', null, 'Paste your Firebase web configuration into src/firebase-config.ts and deploy again (see README).')))));
} else if (onStage()) {
  void isCurrent().then((ok) => { if (ok) void import('./stage/app').then((m) => m.startStage(root)); });
} else if (ROOM_CODE_PATTERN.test(code)) {
  startPhone(root, code);
} else {
  startLanding(root);
  // The "Host sign-in" link only changes the hash: load the stage then.
  window.addEventListener('hashchange', () => { if (onStage()) location.reload(); });
}
