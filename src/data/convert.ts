// The rest of the app works with plain JSON and times in milliseconds. Firestore
// wants Timestamp objects (the rules compare them with request.time). The rule here:
// a field named "at" or ending in "At" is a time. The text SERVER_TIME as a value
// means "the server's clock at the moment of writing".

import { serverTimestamp, Timestamp } from 'firebase/firestore';

export const SERVER_TIME = '__server_time__';

const isTimeField = (key: string) => key === 'at' || key.endsWith('At');

/** Firestore data -> plain JSON (Timestamp -> milliseconds). */
export function fromFs(x: any): any {
  if (x instanceof Timestamp) return x.toMillis();
  if (Array.isArray(x)) return x.map(fromFs);
  if (x !== null && typeof x === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(x)) out[k] = fromFs(v);
    return out;
  }
  return x;
}

/** Plain JSON -> Firestore data (milliseconds in time fields -> Timestamp). */
export function toFs(x: any, key = ''): any {
  if (x === SERVER_TIME) return serverTimestamp();
  if (typeof x === 'number' && isTimeField(key)) return Timestamp.fromMillis(x);
  if (Array.isArray(x)) return x.map((v) => toFs(v));
  if (x !== null && typeof x === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(x)) if (v !== undefined) out[k] = toFs(v, k);
    return out;
  }
  return x;
}

/**
 * Counts billable operations, for the simulation script (brief, section 5.2).
 * ruleReads are the get() calls that the security rules make; they are billed as reads.
 */
export class Meter {
  reads = 0;
  ruleReads = 0;
  writes = 0;
  deletes = 0;
  get totalReads(): number {
    return this.reads + this.ruleReads;
  }
}

/**
 * Estimates the difference between the server's clock and this device's clock
 * from the server timestamps on live room updates. A sample can only be too low
 * (by the network delay), so the largest sample is the best one.
 */
export class ServerClock {
  private offset: number | null = null;
  sample(serverMs: number): void {
    const sample = serverMs - Date.now();
    if (this.offset === null || sample > this.offset) this.offset = sample;
  }
  now(): number {
    return Date.now() + (this.offset ?? 0);
  }
}
