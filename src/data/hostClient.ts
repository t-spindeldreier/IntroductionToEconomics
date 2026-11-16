// Everything the stage does with the database. No screen code in here, so the
// simulation script can drive a whole session in Node.
//
// The StageController is the engine: it knows the compiled session, listens to the
// room, the participants and the responses, and moves the room from frame to frame.
// All session state lives in the room document, so a reload of the stage resumes
// exactly where it was.

import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, setDoc, writeBatch,
  type Firestore, type Unsubscribe,
} from 'firebase/firestore';
import type {
  Activity, Frame, FramePatch, LiveData, OpenWindow, Participant, Resp, RoomState, Session, TimerState,
} from '../core/types';
import { compileSession } from '../core/session';
import { pidOf, randomRoomCode, randomSecret, SECRET_LENGTH } from '../core/identity';
import { randomNick } from '../core/nicknames';
import { participantsCsv, responsesCsv } from '../core/csv';
import { defs } from '../activities/defs';
import { fakeAnswer } from './bots';
import { fromFs, Meter, SERVER_TIME, ServerClock, toFs } from './convert';

const ROOM_LIFETIME_MS = 6 * 3600 * 1000;
const EMPTY_LIVE: LiveData = { responses: () => [], participants: new Map(), timing: () => null };

// ---------- sessions ----------

export interface SessionInfo {
  id: string;
  title: string;
  uploadedAt: number;
}

export async function listSessions(db: Firestore): Promise<SessionInfo[]> {
  const snap = await getDocs(collection(db, 'sessions'));
  return snap.docs
    .map((d) => ({ id: d.id, title: d.data().title as string, uploadedAt: fromFs(d.data().uploadedAt) as number }))
    .sort((a, b) => b.uploadedAt - a.uploadedAt);
}

/** Store a session file (as parsed from YAML or JSON). Call compileSession first. */
export async function uploadSession(db: Firestore, uid: string, title: string, raw: unknown): Promise<string> {
  const ref = await addDoc(collection(db, 'sessions'), toFs({
    title, json: JSON.stringify(raw), by: uid, uploadedAt: SERVER_TIME,
  }));
  return ref.id;
}

export async function loadSession(db: Firestore, id: string): Promise<Session> {
  const snap = await getDoc(doc(db, 'sessions', id));
  if (!snap.exists()) throw new Error('The session of this room no longer exists.');
  const result = compileSession(JSON.parse(snap.data().json));
  if (!result.ok) throw new Error('The stored session is not valid:\n' + result.errors.join('\n'));
  return result.session;
}

export async function deleteSession(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, 'sessions', id));
}

// ---------- rooms ----------

export interface RoomInfo {
  code: string;
  title: string;
  status: string;
  createdAt: number;
}

export async function listRooms(db: Firestore): Promise<RoomInfo[]> {
  const snap = await getDocs(collection(db, 'rooms'));
  return snap.docs
    .map((d) => ({ code: d.id, title: d.data().title as string, status: d.data().status as string,
      createdAt: fromFs(d.data().createdAt) as number }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function createRoom(db: Firestore, uid: string, sessionId: string, session: Session): Promise<string> {
  let code = randomRoomCode();
  while ((await getDoc(doc(db, 'rooms', code))).exists()) code = randomRoomCode();
  const patch = enterFrame(session, 0, EMPTY_LIVE);
  await setDoc(doc(db, 'rooms', code), toFs({
    title: session.title,
    status: 'open',
    hostUid: uid,
    sessionId,
    createdAt: SERVER_TIME,
    expiresAt: Date.now() + ROOM_LIFETIME_MS,
    updatedAt: SERVER_TIME,
    seq: 0,
    frame: 0,
    frameCount: session.frames.length,
    view: patch.view,
    open: patch.open ? { ...patch.open, opensAt: SERVER_TIME } : null,
    timer: startTimer(patch),
    board: null,
    boardV: 0,
    timing: {},
  }));
  return code;
}

function enterFrame(session: Session, index: number, live: LiveData): FramePatch {
  const frame = session.frames[index];
  const activity = session.activities[frame.id];
  return defs[frame.type].enter({ session, activity, frame, live });
}

function startTimer(patch: FramePatch): Record<string, unknown> | null {
  if (!patch.timer) return null;
  return patch.timer.autostart
    ? { startedAt: SERVER_TIME, durationMs: patch.timer.durationMs, leftMs: null }
    : { startedAt: null, durationMs: patch.timer.durationMs, leftMs: patch.timer.durationMs };
}

// ---------- the engine ----------

type StoredParticipant = Participant & { docId: string };
type StoredResp = Resp & { docId: string };

export class StageController {
  room: RoomState | null = null;
  missing = false;
  online = true;
  saving = false;
  readonly participants = new Map<string, StoredParticipant>();
  readonly clock = new ServerClock();

  private byKey = new Map<string, Map<string, StoredResp>>();
  private listeners = new Set<() => void>();
  private subscriptions: Unsubscribe[] = [];
  private lastSeq: number | null = null;
  private busy = false;
  private published = new Map<string, string>(); // results id -> JSON last written
  private botQueue: { docId: string; data: Record<string, unknown> }[] = [];
  private botPlanned = new Set<string>();
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private db: Firestore,
    readonly code: string,
    readonly session: Session,
    private meter: Meter = new Meter(),
  ) {}

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit(): void {
    for (const l of this.listeners) l();
  }

  private roomRef() {
    return doc(this.db, 'rooms', this.code);
  }

  start(): void {
    this.meter.ruleReads += 2; // the host check for the two collection listeners
    this.subscriptions.push(
      onSnapshot(this.roomRef(), { includeMetadataChanges: true }, (snap) => {
        this.online = !snap.metadata.fromCache;
        this.saving = snap.metadata.hasPendingWrites;
        if (!snap.exists()) {
          this.missing = !snap.metadata.fromCache;
          this.room = null;
          return this.emit();
        }
        const room = { ...fromFs(snap.data({ serverTimestamps: 'estimate' })), code: this.code } as RoomState;
        if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites && room.seq !== this.lastSeq) {
          this.meter.reads++;
          if (this.lastSeq !== null && room.seq === this.lastSeq + 1) this.clock.sample(room.updatedAt);
          this.lastSeq = room.seq;
        }
        this.room = room;
        this.emit();
        this.planBots();
      }),
      onSnapshot(collection(this.roomRef(), 'participants'), (snap) => {
        for (const change of snap.docChanges()) {
          const d = fromFs(change.doc.data({ serverTimestamps: 'estimate' }));
          if (change.type === 'removed') this.participants.delete(d.pid);
          else {
            if (!snap.metadata.fromCache && !change.doc.metadata.hasPendingWrites) this.meter.reads++;
            this.participants.set(d.pid, { pid: d.pid, adj: d.adj, eco: d.eco, joinedAt: d.joinedAt,
              fake: d.fake === true, docId: change.doc.id });
          }
        }
        this.emit();
        this.planBots();
      }, (e) => this.listenFailed('participants', e)),
      onSnapshot(collection(this.roomRef(), 'responses'), (snap) => {
        for (const change of snap.docChanges()) {
          const docId = change.doc.id;
          const key = docId.slice(0, docId.length - SECRET_LENGTH - 1);
          const d = fromFs(change.doc.data({ serverTimestamps: 'estimate' }));
          if (change.type === 'removed') this.byKey.get(key)?.delete(d.pid);
          else {
            if (!snap.metadata.fromCache && !change.doc.metadata.hasPendingWrites) this.meter.reads++;
            if (!this.byKey.has(key)) this.byKey.set(key, new Map());
            this.byKey.get(key)!.set(d.pid, { key, pid: d.pid, v: d.v, ...(d.p1 === undefined ? {} : { p1: d.p1 }),
              at: d.at, fake: d.fake === true, docId });
          }
        }
        this.emit();
      }, (e) => this.listenFailed('responses', e)),
    );
  }

  private listenFailed(what: string, error: unknown): void {
    console.error('Lost the ' + what + ' listener:', error);
    this.online = false;
    this.emit();
  }

  stop(): void {
    this.stopped = true;
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.subscriptions = [];
    if (this.botTimer) clearTimeout(this.botTimer);
  }

  // ---------- live data for the activity modules and the stage views ----------

  responses(key: string): Resp[] {
    return [...(this.byKey.get(key)?.values() ?? [])];
  }

  timing(key: string): { openedAt: number; durationMs: number | null } | null {
    const room = this.room;
    if (!room) return null;
    if (room.open?.key === key) return { openedAt: room.open.opensAt, durationMs: room.open.durationMs };
    return room.timing[key] ?? null;
  }

  get live(): LiveData {
    return { responses: (key) => this.responses(key), participants: this.participants, timing: (key) => this.timing(key) };
  }

  get frame(): Frame | null {
    return this.room ? this.session.frames[this.room.frame] ?? null : null;
  }

  get fakeCount(): number {
    let n = 0;
    for (const p of this.participants.values()) if (p.fake) n++;
    return n;
  }

  now(): number {
    return this.clock.now();
  }

  // ---------- moving through the session ----------

  next(): Promise<void> {
    return this.room ? this.goto(this.room.frame + 1) : Promise.resolve();
  }
  prev(): Promise<void> {
    return this.room ? this.goto(this.room.frame - 1) : Promise.resolve();
  }

  /** Enter frame `index`: one write that every phone receives. */
  async goto(index: number): Promise<void> {
    const room = this.room;
    if (!room || this.busy || index < 0 || index >= this.session.frames.length || index === room.frame) return;
    this.busy = true;
    try {
      // Remember when the window we are leaving was open; scores and exports need it.
      const timing = { ...room.timing };
      if (room.open) timing[room.open.key] = { openedAt: room.open.opensAt, durationMs: room.open.durationMs };
      room.timing = timing;

      const patch = enterFrame(this.session, index, this.live);
      await this.write(index, patch, room);
      // An answer sent in the last instant may reach the stage a moment after the
      // reveal was computed. Look again shortly and correct the published numbers.
      if (patch.results || patch.view.reveal) setTimeout(() => void this.settle(index), 1500);
    } finally {
      this.busy = false;
    }
  }

  private openFor(patch: FramePatch, room: RoomState): Record<string, unknown> | null {
    if (!patch.open) return null;
    // Still the same window (for example lobby -> same guess): keep its clock.
    if (room.open?.key === patch.open.key) {
      return { ...patch.open, opensAt: room.open.opensAt, durationMs: room.open.durationMs };
    }
    // Re-opened after going back: keep the original opening time so that earlier
    // answers keep their response times, and extend the duration from now.
    const before = room.timing[patch.open.key];
    if (before) {
      const durationMs = patch.open.durationMs === null ? null
        : Math.max(0, this.now() - before.openedAt) + patch.open.durationMs;
      return { ...patch.open, opensAt: before.openedAt, durationMs };
    }
    return { ...patch.open, opensAt: SERVER_TIME };
  }

  private async write(index: number, patch: FramePatch, room: RoomState): Promise<void> {
    const batch = writeBatch(this.db);
    const update: Record<string, unknown> = {
      frame: index,
      view: patch.view,
      open: this.openFor(patch, room),
      timer: startTimer(patch),
      timing: room.timing,
      seq: room.seq + 1,
      updatedAt: SERVER_TIME,
    };
    if (patch.results) {
      const json = JSON.stringify(patch.results.data);
      const changed = this.published.get(patch.results.id) !== json;
      if (changed) {
        batch.set(doc(this.roomRef(), 'results', patch.results.id), patch.results.data);
        this.published.set(patch.results.id, json);
        this.meter.writes++;
      }
      if (patch.results.board && (changed || room.board !== patch.results.id)) {
        update.board = patch.results.id;
        update.boardV = room.boardV + 1;
      }
    }
    batch.update(this.roomRef(), toFs(update));
    this.meter.writes++;
    this.meter.ruleReads++;
    await batch.commit();
  }

  private async settle(index: number): Promise<void> {
    const room = this.room;
    if (!room || room.frame !== index || this.busy || this.stopped) return;
    const patch = enterFrame(this.session, index, this.live);
    const sameView = JSON.stringify(patch.view) === JSON.stringify(room.view);
    const sameResults = !patch.results || this.published.get(patch.results.id) === JSON.stringify(patch.results.data);
    if (sameView && sameResults) return;
    this.busy = true;
    try {
      // Keep the timer and the answer window exactly as they are.
      const batch = writeBatch(this.db);
      const update: Record<string, unknown> = { view: patch.view, seq: room.seq + 1, updatedAt: SERVER_TIME };
      if (patch.results && !sameResults) {
        batch.set(doc(this.roomRef(), 'results', patch.results.id), patch.results.data);
        this.published.set(patch.results.id, JSON.stringify(patch.results.data));
        this.meter.writes++;
        if (patch.results.board) update.boardV = room.boardV + 1;
      }
      batch.update(this.roomRef(), toFs(update));
      this.meter.writes++;
      this.meter.ruleReads++;
      await batch.commit();
    } finally {
      this.busy = false;
    }
  }

  private async updateRoom(fields: Record<string, unknown>): Promise<void> {
    const room = this.room;
    if (!room) return;
    const batch = writeBatch(this.db);
    batch.update(this.roomRef(), toFs({ ...fields, seq: room.seq + 1, updatedAt: SERVER_TIME }));
    this.meter.writes++;
    this.meter.ruleReads++;
    await batch.commit();
  }

  // ---------- timer (keys T and +) ----------

  /** T: start or pause the countdown. On a frame without one, start 60 seconds. */
  async toggleTimer(): Promise<void> {
    const room = this.room;
    if (!room || room.open?.durationMs != null) return; // answer windows cannot be paused
    const t = room.timer;
    let timer: TimerState | Record<string, unknown>;
    if (!t) timer = { startedAt: SERVER_TIME, durationMs: 60000, leftMs: null };
    else if (t.startedAt !== null) {
      timer = { startedAt: null, durationMs: t.durationMs, leftMs: Math.max(0, t.startedAt + t.durationMs - this.now()) };
    } else {
      const left = t.leftMs ?? t.durationMs;
      timer = { startedAt: SERVER_TIME, durationMs: left > 0 ? left : t.durationMs, leftMs: null };
    }
    await this.updateRoom({ timer });
  }

  /** +: add time to the running countdown or to the open answer window. */
  async addTime(ms = 30000): Promise<void> {
    const room = this.room;
    if (!room) return;
    if (room.open && room.open.durationMs !== null) {
      // If the window has already closed, count the extra time from now.
      const elapsed = Math.max(0, this.now() - room.open.opensAt);
      const durationMs = Math.max(room.open.durationMs, elapsed) + ms;
      return this.updateRoom({ open: { ...room.open, durationMs } satisfies OpenWindow });
    }
    const t = room.timer;
    if (!t) return;
    if (t.startedAt !== null) {
      const elapsed = Math.max(0, this.now() - t.startedAt);
      return this.updateRoom({ timer: { ...t, durationMs: Math.max(t.durationMs, elapsed) + ms } });
    }
    return this.updateRoom({ timer: { ...t, leftMs: (t.leftMs ?? t.durationMs) + ms } });
  }

  // ---------- room status ----------

  closeRoom(): Promise<void> {
    return this.updateRoom({ status: 'closed', open: null });
  }
  reopenRoom(): Promise<void> {
    return this.updateRoom({ status: 'open', expiresAt: Date.now() + ROOM_LIFETIME_MS });
  }

  // ---------- rehearsal mode ----------

  /** Add n simulated students. They answer by themselves while this page is open. */
  async simulate(n: number): Promise<void> {
    for (let done = 0; done < n; done += 400) {
      const batch = writeBatch(this.db);
      for (let i = done; i < Math.min(n, done + 400); i++) {
        const secret = randomSecret();
        batch.set(doc(this.roomRef(), 'participants', secret), toFs({
          pid: pidOf(secret), ...randomNick(), joinedAt: SERVER_TIME, fake: true,
        }));
        this.meter.writes++;
      }
      this.meter.ruleReads++;
      await batch.commit();
    }
  }

  async removeFakes(): Promise<void> {
    const refs = [];
    for (const p of this.participants.values()) if (p.fake) refs.push(doc(this.roomRef(), 'participants', p.docId));
    for (const map of this.byKey.values()) {
      for (const r of map.values()) if (r.fake) refs.push(doc(this.roomRef(), 'responses', r.docId));
    }
    this.botPlanned.clear();
    this.botQueue = [];
    await this.deleteAll(refs);
  }

  /** Schedule answers of simulated students for whatever is open right now. */
  private planBots(): void {
    const room = this.room;
    const frame = this.frame;
    if (!room || !frame || !room.open || room.status !== 'open' || this.stopped) return;
    const open = room.open;
    const activity: Activity = this.session.activities[frame.collect ?? frame.id];
    const answered = this.byKey.get(open.key);
    for (const p of this.participants.values()) {
      const tag = `${open.key}_${p.docId}`;
      if (!p.fake || this.botPlanned.has(tag) || answered?.has(p.pid)) continue;
      this.botPlanned.add(tag);
      const answer = fakeAnswer(activity, frame, open, p.pid);
      setTimeout(() => {
        // Only if this window is still open and the student still exists.
        if (this.room?.open?.key !== open.key || !this.participants.has(p.pid) || this.stopped) return;
        this.botQueue.push({
          docId: tag,
          data: { pid: p.pid, v: answer.v, ...(answer.p1 === undefined ? {} : { p1: answer.p1 }), at: SERVER_TIME, fake: true },
        });
        this.botTimer ??= setTimeout(() => void this.flushBots(), 300);
      }, answer.delayMs);
    }
  }

  private async flushBots(): Promise<void> {
    this.botTimer = null;
    const queue = this.botQueue.splice(0, 400);
    if (queue.length === 0) return;
    const batch = writeBatch(this.db);
    for (const item of queue) {
      batch.set(doc(this.roomRef(), 'responses', item.docId), toFs(item.data));
      this.meter.writes++;
    }
    this.meter.ruleReads++;
    try {
      await batch.commit();
    } catch {
      /* rehearsal only: a lost batch of simulated answers does not matter */
    }
    if (this.botQueue.length > 0) this.botTimer = setTimeout(() => void this.flushBots(), 300);
  }

  // ---------- export and deletion ----------

  exportCsv(includeFake: boolean): { responses: string; participants: string } {
    const input = {
      code: this.code,
      session: this.session,
      participants: [...this.participants.values()],
      responses: [...this.byKey.values()].flatMap((m) => [...m.values()]),
      timing: (key: string) => this.timing(key),
      includeFake,
    };
    return { responses: responsesCsv(input), participants: participantsCsv(input) };
  }

  /** Delete every document of this room, then the room itself. */
  async deleteRoom(): Promise<void> {
    const room = this.roomRef();
    const refs = [];
    for (const sub of ['responses', 'participants', 'results']) {
      const snap = await getDocs(collection(room, sub));
      this.meter.reads += Math.max(1, snap.size);
      for (const d of snap.docs) refs.push(d.ref);
    }
    this.stop();
    await this.deleteAll([...refs, room]);
  }

  private async deleteAll(refs: ReturnType<typeof doc>[]): Promise<void> {
    for (let i = 0; i < refs.length; i += 400) {
      const batch = writeBatch(this.db);
      for (const ref of refs.slice(i, i + 400)) batch.delete(ref);
      this.meter.deletes += Math.min(400, refs.length - i);
      this.meter.ruleReads++;
      await batch.commit();
    }
  }
}
