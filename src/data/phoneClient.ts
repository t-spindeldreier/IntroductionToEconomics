// Everything a phone does with the database. No screen code in here, so the
// simulation script can run a hundred of these in Node.
//
// Read budget (brief, section 5.2): a phone listens to ONE document (the room),
// reads the leaderboard document once per reveal, and never queries a collection.

import {
  doc, getDoc, onSnapshot, serverTimestamp, setDoc, type Firestore, type Unsubscribe,
} from 'firebase/firestore';
import type { PhoneView, RoomState } from '../core/types';
import { pidOf, randomSecret } from '../core/identity';
import { randomNick } from '../core/nicknames';
import { fromFs, Meter, ServerClock } from './convert';

/** localStorage, or a plain object when storage is blocked (private mode, in-app browsers). */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function browserStore(): KeyValueStore {
  const memory = new Map<string, string>();
  return {
    get(key) {
      try {
        return localStorage.getItem(key) ?? memory.get(key) ?? null;
      } catch {
        return memory.get(key) ?? null;
      }
    },
    set(key, value) {
      memory.set(key, value);
      try {
        localStorage.setItem(key, value);
      } catch {
        /* storage blocked: the identity lives until the tab is closed */
      }
    },
  };
}

export interface Identity {
  secret: string;
  pid: string;
  adj: number;
  eco: number;
  joined: boolean; // the server has confirmed the participant document
  roomCreatedAt: number; // guards against an old identity for a reused room code
}

export interface Answer {
  v: number;
  p1?: number;
  state: 'pending' | 'ok' | 'late';
}

/** The leaderboard document: pid -> [points, rank, gain]. */
export interface Board {
  id: string;
  n: number;
  scores: Record<string, [number, number, number]>;
}

export type PhoneStatus = 'loading' | 'missing' | 'ready';

export class PhoneClient {
  status: PhoneStatus = 'loading';
  room: RoomState | null = null;
  me: Identity | null = null;
  answers: Record<string, Answer> = {};
  board: Board | null = null;
  online = true;
  readonly clock = new ServerClock();

  private listeners = new Set<() => void>();
  private unsubscribe: Unsubscribe | null = null;
  private lastSeq: number | null = null;
  private boardTag = '';
  private joining = false;
  private recovered = false;

  constructor(
    private db: Firestore,
    readonly code: string,
    private store: KeyValueStore,
    /** Tells the client which views need the leaderboard document. */
    private needsBoard: (view: PhoneView) => boolean,
    private meter: Meter = new Meter(),
  ) {}

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit(): void {
    for (const l of this.listeners) l();
  }

  start(): void {
    this.answers = JSON.parse(this.store.get(this.key('answers')) ?? '{}');
    this.unsubscribe = onSnapshot(
      doc(this.db, 'rooms', this.code),
      { includeMetadataChanges: true },
      (snap) => {
        this.online = !snap.metadata.fromCache;
        if (!snap.exists()) {
          // A missing room that only comes from the offline cache is not conclusive.
          if (!snap.metadata.fromCache) this.status = 'missing';
          return this.emit();
        }
        const room = { ...fromFs(snap.data({ serverTimestamps: 'estimate' })), code: this.code } as RoomState;
        if (!snap.metadata.fromCache && room.seq !== this.lastSeq) {
          this.meter.reads++;
          // A live update that directly follows the previous one carries a fresh server time.
          if (this.lastSeq !== null && room.seq === this.lastSeq + 1) this.clock.sample(room.updatedAt);
          this.lastSeq = room.seq;
        }
        this.room = room;
        this.status = 'ready';
        this.emit();
        void this.afterRoomUpdate();
      },
      () => {
        this.online = false;
        this.emit();
      },
    );
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  now(): number {
    return this.clock.now();
  }

  private key(name: string): string {
    return `econlive:${this.code}:${name}`;
  }
  private save(): void {
    this.store.set(this.key('id'), JSON.stringify(this.me));
    this.store.set(this.key('answers'), JSON.stringify(this.answers));
  }

  private async afterRoomUpdate(): Promise<void> {
    const room = this.room!;
    this.loadIdentity(room);
    if (room.status === 'open') {
      await this.join();
      if (!this.recovered) {
        this.recovered = true;
        await this.recoverPending();
      }
    }
    await this.loadBoard();
  }

  // ---------- identity and joining ----------

  private loadIdentity(room: RoomState): void {
    if (this.me) return;
    const saved = this.store.get(this.key('id'));
    const identity: Identity | null = saved ? JSON.parse(saved) : null;
    if (identity && identity.roomCreatedAt === room.createdAt) {
      this.me = identity;
    } else {
      // First visit (or the room code was reused for a new room): new identity.
      const secret = randomSecret();
      this.me = { secret, pid: pidOf(secret), ...randomNick(), joined: false, roomCreatedAt: room.createdAt };
      this.answers = {};
      this.save();
    }
    this.emit();
  }

  private participantRef() {
    return doc(this.db, 'rooms', this.code, 'participants', this.me!.secret);
  }

  private async join(): Promise<void> {
    const me = this.me!;
    if (me.joined || this.joining) return;
    this.joining = true;
    try {
      this.meter.writes++;
      this.meter.ruleReads++; // the rule reads the room document
      await setDoc(this.participantRef(), { pid: me.pid, adj: me.adj, eco: me.eco, joinedAt: serverTimestamp() });
      me.joined = true;
    } catch {
      // Refused: either the document already exists (an earlier attempt arrived
      // but its confirmation was lost), or the room is not accepting writes.
      try {
        this.meter.reads++;
        if ((await getDoc(this.participantRef())).exists()) me.joined = true;
      } catch {
        /* offline: the next room update tries again */
      }
    }
    this.joining = false;
    this.save();
    this.emit();
  }

  // ---------- answers ----------

  private responseRef(key: string) {
    return doc(this.db, 'rooms', this.code, 'responses', `${key}_${this.me!.secret}`);
  }

  /**
   * Send an answer. It locks at once (a second tap does nothing), shows as
   * "pending" until the server confirms, and then as "ok". If the phone is
   * offline, the SDK keeps trying; the promise settles when the server answers.
   */
  async submit(key: string, v: number, p1?: number): Promise<void> {
    if (!this.me || this.answers[key]) return;
    this.answers[key] = { v, ...(p1 === undefined ? {} : { p1 }), state: 'pending' };
    this.save();
    this.emit();
    await this.send(key);
  }

  private async send(key: string): Promise<void> {
    const answer = this.answers[key];
    try {
      this.meter.writes++;
      this.meter.ruleReads++;
      await setDoc(this.responseRef(key), {
        pid: this.me!.pid,
        v: answer.v,
        ...(answer.p1 === undefined ? {} : { p1: answer.p1 }),
        at: serverTimestamp(),
      });
      answer.state = 'ok';
    } catch {
      // Refused. If the document exists, an earlier attempt did arrive.
      answer.state = (await this.arrived(key)) ? 'ok' : 'late';
    }
    this.save();
    this.emit();
  }

  private async arrived(key: string): Promise<boolean> {
    try {
      this.meter.reads++;
      return (await getDoc(this.responseRef(key))).exists();
    } catch {
      return false;
    }
  }

  /** After a reload: settle answers that were still "pending" when the page went away. */
  private async recoverPending(): Promise<void> {
    for (const [key, answer] of Object.entries(this.answers)) {
      if (answer.state !== 'pending') continue;
      if (await this.arrived(key)) {
        answer.state = 'ok';
        this.save();
        this.emit();
      } else if (this.room?.open?.key === key) {
        await this.send(key);
      } else {
        answer.state = 'late';
        this.save();
        this.emit();
      }
    }
  }

  // ---------- leaderboard ----------

  private async loadBoard(): Promise<void> {
    const room = this.room;
    if (!room || !room.board || !this.needsBoard(room.view)) return;
    const tag = `${room.board}:${room.boardV}`;
    if (tag === this.boardTag) return;
    this.boardTag = tag;
    try {
      this.meter.reads++;
      const snap = await getDoc(doc(this.db, 'rooms', this.code, 'results', room.board));
      if (snap.exists() && this.boardTag === tag) {
        const data = snap.data();
        this.board = { id: room.board, n: data.n, scores: data.scores };
        this.emit();
      }
    } catch {
      this.boardTag = ''; // try again with the next room update
    }
  }
}
