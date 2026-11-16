// Student identity without accounts (brief, section 5.3).
//
//   secret  32 random characters, generated on the phone, never shown, never exported.
//           It is part of the document ids the phone writes, which is what proves ownership.
//   pid     "public id": the first 16 hex characters of sha256(secret). Used on the
//           leaderboard and in exports. The security rules recompute it from the document
//           id, so a phone cannot answer under somebody else's pid.
//   arm     which version of a multi-version question a phone gets. It is derived from
//           the pid and the activity id by hashing, so it is as good as a coin flip, it is
//           independent across activities, and nobody (not even the phone) can change it.

import { sha256Hex } from './sha256';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export const SECRET_LENGTH = 32;

export function randomSecret(): string {
  const bytes = new Uint8Array(SECRET_LENGTH);
  crypto.getRandomValues(bytes);
  // 256 % 36 != 0 gives a tiny bias, which is irrelevant for a 32-character secret.
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function pidOf(secret: string): string {
  return sha256Hex(secret).slice(0, 16);
}

/** Arm index (0-based) of participant `pid` in activity `activityId` with `nArms` versions. */
export function armOf(pid: string, activityId: string, nArms: number): number {
  if (nArms <= 1) return 0;
  return parseInt(sha256Hex(pid + ':' + activityId).slice(0, 8), 16) % nArms;
}

/** Room codes: four letters without the look-alikes I, L and O. */
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export function randomRoomCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_LETTERS[b % CODE_LETTERS.length]).join('');
}
export const ROOM_CODE_PATTERN = /^[A-Z]{4}$/;
