// Shared data shapes. Everything here is plain JSON: times are milliseconds since
// 1970 (the data layer converts to and from Firestore timestamps, see data/convert.ts).

// ---------- Room state: the one small document every phone listens to ----------

/** What phones may currently answer. Checked by the security rules on every response. */
export interface OpenWindow {
  key: string; // activity id, or "<activity id>-<item number>" for choice items
  type: 'guess' | 'choice';
  opensAt: number; // server time
  durationMs: number | null; // null = open until the tutor moves on
  n?: number; // choice: number of options
  min?: number; // guess: allowed range
  max?: number;
  xmin?: boolean; // guess: true = the minimum itself is not allowed
  p1?: boolean; // guess: true = a more/less answer is required as well
}

/** Countdown shown with prompts. Running: startedAt set. Paused: startedAt null, leftMs set. */
export interface TimerState {
  startedAt: number | null;
  durationMs: number;
  leftMs: number | null;
}

/** What a phone shows. Built by the activity module; never contains unrevealed answers. */
export interface PhoneView {
  type: string;
  key?: string;
  phase?: string;
  [field: string]: unknown;
}

export interface RoomState {
  code: string;
  title: string;
  status: 'open' | 'closed';
  hostUid: string;
  sessionId: string;
  createdAt: number;
  expiresAt: number; // after this time the rules reject all student writes
  updatedAt: number;
  seq: number; // +1 on every change
  frame: number; // index into the compiled session (see session.ts)
  frameCount: number;
  view: PhoneView;
  open: OpenWindow | null;
  timer: TimerState | null;
  board: string | null; // id of the results document that holds the current leaderboard
  boardV: number; // +1 whenever that document is rewritten
  timing: Record<string, { openedAt: number; durationMs: number | null }>;
}

// ---------- Participants and responses ----------

export interface Participant {
  pid: string;
  adj: number;
  eco: number;
  joinedAt: number;
  fake: boolean;
}

export interface Resp {
  key: string;
  pid: string;
  v: number; // the guess, or the 0-based option index
  p1?: number; // guess part 1: index of the chosen option (0 = first)
  at: number; // server time
  fake: boolean;
}

// ---------- Sessions ----------

export interface Activity {
  type: string;
  id: string;
  [field: string]: any;
}

export interface Session {
  title: string;
  activities: Record<string, Activity>;
  frames: Frame[];
  steps: Step[];
  /** The parts of the session, from the "section" steps. Empty if the file has none. */
  sections: { title: string; subtitle: string | null; firstFrame: number }[];
}

/** One entry in the host's step list: an activity (or one item of it). */
export interface Step {
  index: number;
  label: string;
  firstFrame: number;
}

/** One press of the right-arrow key leads from one frame to the next. */
export interface Frame {
  index: number;
  step: number;
  type: string;
  id: string; // activity id
  item: number | null; // 0-based item number for activities with items
  phase: string;
  key: string; // response key: id, or id-<item+1>
  collect?: string; // lobby only: activity that is open for answers meanwhile
  section: number; // index into session.sections; -1 before the first section
}

// ---------- The interface every activity type implements (core part) ----------

/** Live data the stage has when it enters a frame. */
export interface LiveData {
  responses(key: string): Resp[];
  participants: Map<string, Participant>;
  timing(key: string): { openedAt: number; durationMs: number | null } | null;
}

export interface EnterContext {
  session: Session;
  activity: Activity;
  frame: Frame;
  live: LiveData;
}

/** What entering a frame changes in the room. */
export interface FramePatch {
  view: PhoneView;
  open?: Omit<OpenWindow, 'opensAt'>;
  timer?: { durationMs: number; autostart: boolean };
  /** Aggregates to publish. board = true marks the document as the current leaderboard. */
  results?: { id: string; data: Record<string, unknown>; board: boolean };
}

export interface ActivityDef {
  type: string;
  /** Check and normalise the activity as written in the session file. */
  validate(a: Activity, v: Validator): void;
  /** Number of items (0 if the activity has no items). */
  itemCount(a: Activity): number;
  /** All phases this activity can have, in order. */
  phases(a: Activity): string[];
  /** Phases used when a step does not list any. */
  defaultPhases(a: Activity): string[];
  /** Label for the "next: ..." hint. Must not give anything away. */
  phaseLabel(a: Activity, phase: string): string;
  /** Label for the host's step list. Must not give anything away. */
  stepLabel(a: Activity, item: number | null): string;
  enter(ctx: EnterContext): FramePatch;
}

/** Collects validation errors with the place they occurred. */
export class Validator {
  errors: string[] = [];
  constructor(private path: string = '') {}
  at(sub: string): Validator {
    const v = new Validator(this.path ? `${this.path}.${sub}` : sub);
    v.errors = this.errors;
    return v;
  }
  err(message: string): void {
    this.errors.push(this.path ? `${this.path}: ${message}` : message);
  }
  /** A required or optional text field with a maximum length. */
  text(obj: any, field: string, opts: { required?: boolean; max?: number } = {}): void {
    const x = obj[field];
    if (x === undefined || x === null) {
      if (opts.required) this.at(field).err('is missing');
      return;
    }
    if (typeof x !== 'string' || x.trim() === '') return this.at(field).err('must be non-empty text');
    if (x.length > (opts.max ?? 600)) this.at(field).err(`is longer than ${opts.max ?? 600} characters`);
  }
  number(obj: any, field: string, opts: { required?: boolean; min?: number; max?: number } = {}): void {
    const x = obj[field];
    if (x === undefined || x === null) {
      if (opts.required) this.at(field).err('is missing');
      return;
    }
    if (typeof x !== 'number' || !Number.isFinite(x)) return this.at(field).err('must be a number');
    if (opts.min !== undefined && x < opts.min) this.at(field).err(`must be at least ${opts.min}`);
    if (opts.max !== undefined && x > opts.max) this.at(field).err(`must be at most ${opts.max}`);
  }
  bool(obj: any, field: string): void {
    const x = obj[field];
    if (x !== undefined && typeof x !== 'boolean') this.at(field).err('must be true or false');
  }
  /** Complain about fields that are not in the list (catches typos). */
  only(obj: any, allowed: string[]): void {
    for (const k of Object.keys(obj)) {
      if (!allowed.includes(k)) this.err(`unknown field "${k}" (allowed: ${allowed.join(', ')})`);
    }
  }
}
