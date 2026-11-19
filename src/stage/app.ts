// The host's side: sign-in, the page with sessions and rooms, and the stage itself.
// This file and everything it imports is loaded only on #/stage.

import './stage.css';
import {
  getAuth, connectAuthEmulator, GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signInWithPopup,
  signOut, type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import demoYaml from '../../sessions/demo.yaml?raw';
import { S } from '../strings';
import type { Session } from '../core/types';
import { h, replaceContent } from '../ui/dom';
import { app, db, USE_EMULATOR } from '../data/firebase';
import { compileSession, nextLabel } from '../core/session';
import { msLeft } from '../core/timer';
import { examBankHtml, studySlidesHtml } from '../core/handout';
import { ROOM_CODE_PATTERN } from '../core/identity';
import {
  createRoom, deleteSession, listRooms, listSessions, loadSession, StageController, uploadSession,
} from '../data/hostClient';
import { fromFs } from '../data/convert';
import { stageViews } from '../activities/stageViews';
import { joinBlock, stageCountdown, type StageEnv } from './env';

const auth = getAuth(app);
if (USE_EMULATOR) connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });

let root: HTMLElement;
let user: User | null = null;
let isHost = false;
let controller: StageController | null = null;
let removeKeys: (() => void) | null = null;

export function startStage(el: HTMLElement): void {
  root = el;
  document.body.classList.add('stage-body');
  replaceContent(root, page(h('p', { class: 'muted' }, S.working)));
  onAuthStateChanged(auth, async (u) => {
    user = u;
    isHost = false;
    if (u) {
      // The rules let a signed-in user read config/hosts only if they are listed in it.
      try {
        isHost = (await getDoc(doc(db, 'config', 'hosts'))).exists();
      } catch {
        isHost = false;
      }
    }
    void route();
  });
  window.addEventListener('hashchange', () => void route());
}

function page(...children: (Node | string | null)[]): HTMLElement {
  return h('div', { class: 'host-page' }, h('h1', null, S.appName), ...children,
    h('p', { class: 'muted build-label' }, `${S.version} ${__BUILD__}`));
}

async function route(): Promise<void> {
  controller?.stop();
  controller = null;
  removeKeys?.();
  removeKeys = null;
  if (!location.hash.startsWith('#/stage')) return location.reload();

  if (!user) {
    return replaceContent(root, page(
      h('p', null, S.signInIntro),
      h('button', { class: 'btn primary narrow', onclick: () => void signInWithPopup(auth, new GoogleAuthProvider()).catch(showError) }, S.signIn),
      // The auth emulator accepts a made-up Google account: handy for rehearsing offline.
      USE_EMULATOR ? h('button', { class: 'btn narrow', id: 'dev-sign-in', onclick: () => void signInWithCredential(auth,
        GoogleAuthProvider.credential(JSON.stringify({ sub: 'dev-host', email: 'dev-host@example.com', email_verified: true }))).catch(showError) },
        'Emulator only: sign in as a test host') : null));
  }
  if (!isHost) {
    return replaceContent(root, page(
      h('h2', null, S.notHostTitle),
      h('p', null, S.notHostBody),
      h('p', null, h('code', { class: 'uid' }, user.uid)),
      USE_EMULATOR ? h('button', { class: 'btn narrow', onclick: () => void devMakeHost() }, 'Emulator only: put me on the host list') : null,
      h('button', { class: 'btn narrow', onclick: () => void signOut(auth) }, S.signOut)));
  }
  const code = location.hash.split('/')[2]?.toUpperCase() ?? '';
  if (ROOM_CODE_PATTERN.test(code)) return openRoom(code);
  return home();
}

function showError(e: unknown): void {
  alert(e instanceof Error ? e.message : String(e));
}

/** Development convenience. "Bearer owner" only works on the emulator. */
async function devMakeHost(): Promise<void> {
  await fetch(`http://${location.hostname}:8080/v1/projects/${app.options.projectId}/databases/(default)/documents/config/hosts`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { uids: { arrayValue: { values: [{ stringValue: user!.uid }] } } } }),
  });
  location.reload();
}

// ---------- sessions and rooms ----------

async function home(message: string | null = null, errors: string[] = []): Promise<void> {
  replaceContent(root, page(h('p', { class: 'muted' }, S.working)));
  let sessions, rooms;
  try {
    [sessions, rooms] = await Promise.all([listSessions(db), listRooms(db)]);
  } catch (e) {
    return replaceContent(root, page(h('p', { class: 'error' }, String(e))));
  }
  const date = (ms: number) => new Date(ms).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  const fileInput = h('input', {
    type: 'file', accept: '.yaml,.yml,.json,image/*', multiple: true, class: 'visually-hidden', id: 'session-file',
    onchange: async () => {
      // One session file, plus any figures it refers to, selected together.
      const files = [...(fileInput.files ?? [])];
      const sessionFile = files.find((f) => /\.(ya?ml|json)$/i.test(f.name));
      if (!sessionFile) return home(null, ['Select a .yaml or .json session file (and its figures, if any).']);
      const images = new Map<string, string>();
      for (const f of files) if (f !== sessionFile) images.set(f.name.toLowerCase(), await readAsDataUrl(f));
      await addSession(await sessionFile.text(), images);
    },
  }) as HTMLInputElement;

  replaceContent(root, page(
    message ? h('p', { class: 'notice', role: 'status' }, message) : null,
    errors.length ? h('div', { class: 'errors', role: 'alert' }, h('p', null, S.sessionProblems),
      h('ul', null, errors.map((e) => h('li', null, e)))) : null,

    h('h2', null, S.sessions),
    sessions.length === 0 ? h('p', { class: 'muted' }, S.noSessions) : h('ul', { class: 'rows' }, sessions.map((s) =>
      h('li', null,
        h('span', { class: 'row-title' }, s.title, h('span', { class: 'muted' }, ` · ${date(s.uploadedAt)}`)),
        h('button', { class: 'btn small-btn primary', onclick: () => void newRoom(s.id) }, S.createRoom),
        h('button', { class: 'btn small-btn', onclick: async () => { await deleteSession(db, s.id); void home(); } }, S.deleteSession)))),
    h('div', { class: 'button-row' },
      fileInput,
      h('label', { class: 'btn small-btn', for: 'session-file', tabindex: 0 }, S.loadSession),
      h('button', { class: 'btn small-btn', onclick: () => void addSession(demoYaml) }, S.loadDemo)),

    h('h2', null, S.rooms),
    rooms.length === 0 ? h('p', { class: 'muted' }, S.noRooms) : h('ul', { class: 'rows' }, rooms.map((r) =>
      h('li', null,
        h('span', { class: 'row-title' }, h('strong', null, r.code), ` · ${r.title}`,
          h('span', { class: 'muted' }, ` · ${date(r.createdAt)}${r.status === 'closed' ? ' · closed' : ''}`)),
        h('a', { class: 'btn small-btn primary', href: `#/stage/${r.code}` }, S.openStage)))),

    h('p', { class: 'muted small' }, user!.email ?? user!.uid, ' · ',
      h('a', { href: '#', onclick: (e: Event) => { e.preventDefault(); void signOut(auth); } }, S.signOut))));
}

/** Validate a session file; upload it only if it is flawless. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** The session's logo for a corner of the slide, on a white tile so it also works on dark slides. */
function logoOf(session: Session): HTMLElement | null {
  const src = session.logo ? session.images[session.logo] : null;
  return src && src.startsWith('data:image/') ? h('img', { class: 'corner-logo', src, alt: '' }) : null;
}

/** Put the figures the session refers to into the session itself, so it is one document. */
function embedImages(raw: any, images: Map<string, string>): string[] {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null) return errors;
  raw.images = {};
  for (const a of [{ image: raw.logo }, ...Object.values<any>(raw.activities ?? {})]) {
    const names = [a?.image, a?.revealImage, ...(Array.isArray(a?.images) ? a.images.map((im: any) => im?.file) : [])];
    for (const name of names) {
      if (typeof name !== 'string') continue;
      const data = images.get(name.split(/[\\/]/).pop()!.toLowerCase());
      if (data) raw.images[name] = data; // stored once, even if shown twice
      else errors.push(S.imageMissing(name));
    }
  }
  if (errors.length === 0 && JSON.stringify(raw).length > 900_000) errors.push(S.sessionTooBig);
  return errors;
}

async function addSession(text: string, images = new Map<string, string>()): Promise<void> {
  let raw: unknown;
  try {
    const { parse } = await import('yaml'); // YAML is a superset of JSON, so this reads both
    raw = parse(text);
  } catch (e) {
    return home(null, [`The file is not valid YAML or JSON: ${e instanceof Error ? e.message : e}`]);
  }
  const imageErrors = embedImages(raw, images);
  if (imageErrors.length) return home(null, imageErrors);
  const result = compileSession(raw);
  if (!result.ok) return home(null, result.errors);
  await uploadSession(db, user!.uid, result.session.title, raw);
  return home(S.sessionUploaded);
}

async function newRoom(sessionId: string): Promise<void> {
  try {
    const session = await loadSession(db, sessionId);
    location.hash = `#/stage/${await createRoom(db, user!.uid, sessionId, session)}`;
  } catch (e) {
    showError(e);
  }
}

// ---------- the stage of one room ----------

async function openRoom(code: string): Promise<void> {
  replaceContent(root, page(h('p', { class: 'muted' }, S.working)));
  let ctl: StageController;
  try {
    const snap = await getDoc(doc(db, 'rooms', code));
    if (!snap.exists()) return void (location.hash = '#/stage');
    ctl = new StageController(db, code, await loadSession(db, fromFs(snap.data()).sessionId));
  } catch (e) {
    return replaceContent(root, page(h('p', { class: 'error' }, String(e)), h('a', { href: '#/stage' }, S.backHome)));
  }
  controller = ctl;

  const joinUrl = `${location.origin}${location.pathname}?r=${code}`;
  const ui = { join: false, panel: false, includeFakes: false, busy: '' };
  const stageEl = h('div', { class: 'stage' });
  replaceContent(root, stageEl);

  // Redraw at most once per animation frame, however many answers arrive.
  let queued = false;
  const redraw = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (controller === ctl) draw();
    });
  };

  const draw = () => {
    const room = ctl.room;
    if (!room) {
      if (ctl.missing) location.hash = '#/stage';
      return;
    }
    const frame = ctl.session.frames[room.frame];
    const env: StageEnv = { ctl, session: ctl.session, room, frame, activity: ctl.session.activities[frame.id], joinUrl };
    const next = nextLabel(ctl.session, room.frame);
    const hasOwnCountdown = frame.type === 'prompt' || (frame.type === 'choice' && frame.phase === 'open');
    const section = frame.section >= 0 ? ctl.session.sections[frame.section] : null;
    replaceContent(stageEl,
      stageViews[frame.type](env),
      logoOf(ctl.session),
      // Where we are in the session, like the footer of a slide deck.
      section && frame.type !== 'section' ? h('div', { class: 'crumb' },
        h('span', { class: 'crumb-part' }, S.part(frame.section + 1, ctl.session.sections.length)),
        h('span', null, section.title)) : null,
      // An ad-hoc timer (key T) on a view that has no countdown of its own.
      !hasOwnCountdown && msLeft(room, ctl.now()) !== null ? stageCountdown(env) : null,
      h('div', { class: 'status-bar' },
        h('span', { class: `dot ${ctl.online ? 'on' : 'off'}`, title: ctl.online ? S.online : S.offline }),
        h('span', null, ctl.online ? (ctl.saving ? S.saving : '') : S.offline),
        h('span', { class: 'status-code' }, room.code),
        h('span', null, `${ctl.participants.size} ${S.joinedShort}`),
        room.status === 'closed' ? h('span', { class: 'closed-flag' }, S.roomIsClosed) : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'ghost', onclick: () => { ui.panel = !ui.panel; draw(); } }, 'H'),
        h('span', { class: 'next-hint' }, `${S.next}: ${next ?? S.endOfSession}`)),
      ui.join ? h('div', { class: 'overlay', onclick: () => { ui.join = false; draw(); } }, joinBlock(env)) : null,
      ui.panel ? panel(env) : null);
  };

  const run = async (label: string, action: () => Promise<unknown>) => {
    ui.busy = label;
    draw();
    try {
      await action();
    } catch (e) {
      showError(e);
    }
    ui.busy = '';
    redraw();
  };

  const download = (name: string, text: string, type = 'text/csv') => {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` })), download: name }) as HTMLAnchorElement;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };

  // The host panel. It is visible on the projector, so it shows no answers.
  const panel = (env: StageEnv): HTMLElement => {
    const room = env.room;
    const count = h('input', { type: 'number', min: 1, max: 300, value: 30, class: 'count-input', 'aria-label': S.simulate }) as HTMLInputElement;
    const stop = (e: Event) => e.stopPropagation();
    return h('div', { class: 'overlay', onclick: () => { ui.panel = false; draw(); } },
      h('div', { class: 'panel', onclick: stop, onkeydown: stop },
        h('h2', null, S.panel, ui.busy ? h('span', { class: 'muted' }, ` · ${ui.busy}`) : null),
        h('p', { class: 'muted small' }, S.panelHint),
        h('div', { class: 'panel-columns' },
          h('div', null,
            h('h3', null, S.steps),
            h('ol', { class: 'steps' }, ctl.session.steps.map((step) =>
              h('li', { class: step.index === env.frame.step ? 'current' : '' },
                h('button', { class: 'step-btn', title: S.jump,
                  onclick: () => { ui.panel = false; void ctl.goto(step.firstFrame); } }, step.label))))),
          h('div', null,
            h('h3', null, S.rehearsal),
            h('p', { class: 'muted small' }, S.fakesNote(ctl.fakeCount)),
            h('div', { class: 'button-row' }, count,
              h('button', { class: 'btn small-btn', onclick: () => void run(S.working, () => ctl.simulate(Math.min(300, Math.max(1, Number(count.value) || 30)))) }, S.simulate)),
            h('button', { class: 'btn small-btn', onclick: () => void run(S.working, () => ctl.removeFakes()) }, S.removeFakes),

            h('h3', null, S.data),
            h('button', { class: 'btn small-btn', onclick: () => {
              const csv = ctl.exportCsv(ui.includeFakes);
              download(`${room.code}_responses.csv`, csv.responses);
              download(`${room.code}_participants.csv`, csv.participants);
            } }, S.exportCsv),
            h('label', { class: 'check small' },
              h('input', { type: 'checkbox', checked: ui.includeFakes, onchange: (e: Event) => { ui.includeFakes = (e.target as HTMLInputElement).checked; } }),
              ' ', S.includeFakes),
            h('button', { class: 'btn small-btn', title: S.studyNote, onclick: () =>
              download(`${room.code}_study_slides.html`, studySlidesHtml(ctl.session, ctl.live, room.code), 'text/html') }, S.studySlides),
            h('p', { class: 'muted small' }, S.studyNote),
            h('button', { class: 'btn small-btn', title: S.examBankNote, onclick: () =>
              download(`${room.code}_exam_bank.html`, examBankHtml(ctl.session, ctl.live, room.code), 'text/html') }, S.examBank),
            h('p', { class: 'muted small' }, S.examBankNote),
            room.status === 'open'
              ? h('button', { class: 'btn small-btn', onclick: () => void run(S.working, () => ctl.closeRoom()) }, S.closeRoom)
              : h('button', { class: 'btn small-btn', onclick: () => void run(S.working, () => ctl.reopenRoom()) }, S.reopenRoom),
            h('button', { class: 'btn small-btn danger', onclick: () => {
              if (prompt(S.deleteConfirm(room.code)) !== room.code) return;
              void run(S.working, async () => { await ctl.deleteRoom(); location.hash = '#/stage'; });
            } }, S.deleteRoom),
            h('p', null, h('a', { href: '#/stage' }, S.backHome)))),
        h('p', { class: 'muted small' }, S.keys)));
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const typing = e.target instanceof HTMLInputElement;
    if (e.key === 'Escape') { ui.panel = false; ui.join = false; return draw(); }
    if (typing) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === 'h') { ui.panel = !ui.panel; return draw(); }
    if (ui.panel) return; // while the panel is open, the arrow keys do nothing by accident
    if (key === 'ArrowRight' || key === ' ' || key === 'PageDown') { e.preventDefault(); void ctl.next(); }
    else if (key === 'ArrowLeft' || key === 'PageUp') { e.preventDefault(); void ctl.prev(); }
    else if (key === 'j') { ui.join = !ui.join; draw(); }
    else if (key === 't') void ctl.toggleTimer();
    else if (key === '+' || key === '=') void ctl.addTime();
    else if (key === 'f') {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen().catch(() => {});
    }
  };
  window.addEventListener('keydown', onKey);
  // "Time is up" must appear even when no new answer triggers a redraw.
  const ticker = setInterval(redraw, 1000);
  removeKeys = () => {
    window.removeEventListener('keydown', onKey);
    clearInterval(ticker);
  };

  ctl.onChange(redraw);
  ctl.start();
}
