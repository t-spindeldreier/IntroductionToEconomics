import type { RoomState } from './types';

/**
 * The countdown that applies right now, if any: either the answer window of a
 * timed question or the prompt timer. Times are server times.
 */
export function countdownOf(room: RoomState): { endsAt: number } | { pausedLeftMs: number } | null {
  if (room.open && room.open.durationMs !== null) return { endsAt: room.open.opensAt + room.open.durationMs };
  if (room.timer) {
    if (room.timer.startedAt !== null) return { endsAt: room.timer.startedAt + room.timer.durationMs };
    return { pausedLeftMs: room.timer.leftMs ?? room.timer.durationMs };
  }
  return null;
}

/** Milliseconds left on the current countdown (never negative), or null without a countdown. */
export function msLeft(room: RoomState, now: number): number | null {
  const c = countdownOf(room);
  if (c === null) return null;
  return 'endsAt' in c ? Math.max(0, c.endsAt - now) : c.pausedLeftMs;
}

/** 95 seconds -> "1:35"; under a minute -> "35". */
export function formatSeconds(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s);
}
