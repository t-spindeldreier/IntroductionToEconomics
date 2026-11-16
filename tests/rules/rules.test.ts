// Security-rules tests. They run against the Firestore emulator:
//   npm run test:rules
// Each "describe" block is one guarantee from section 5.5 of the brief.

import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc,
} from 'firebase/firestore';
import { pidOf } from '../../src/core/identity';

let env: RulesTestEnvironment;
const HOST = 'host-uid';
const CODE = 'ABCD';
const ann = 'a'.repeat(32); // two students' secrets
const bob = 'b'.repeat(32);

const student = () => env.unauthenticatedContext().firestore();
const host = () => env.authenticatedContext(HOST).firestore();
const stranger = () => env.authenticatedContext('someone-else').firestore(); // signed in, not on the list

const hours = (h: number) => Timestamp.fromMillis(Date.now() + h * 3600_000);
const seconds = (s: number) => Timestamp.fromMillis(Date.now() + s * 1000);

const choiceOpen = (extra: object = {}) => ({
  key: 'quiz-1', type: 'choice', opensAt: seconds(-5), durationMs: 25000, n: 7, ...extra,
});
const guessOpen = (extra: object = {}) => ({
  key: 'anchor', type: 'guess', opensAt: seconds(-5), durationMs: null, min: 0, max: 100000, xmin: true, p1: true, ...extra,
});

/** Write the room document, bypassing the rules. */
async function setRoom(fields: object) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'rooms', CODE), {
      title: 'Test', status: 'open', hostUid: HOST, expiresAt: hours(6), frame: 0,
      view: { type: 'lobby' }, open: null, timer: null, ...fields,
    });
  });
}
async function seed(path: string, data: object) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

const participant = (secret: string, extra: object = {}) => ({
  pid: pidOf(secret), adj: 1, eco: 2, joinedAt: serverTimestamp(), ...extra,
});
const choiceAnswer = (secret: string, v: unknown = 1, extra: object = {}) => ({
  pid: pidOf(secret), v, at: serverTimestamp(), ...extra,
});
const guessAnswer = (secret: string, v: unknown = 40, extra: object = {}) => ({
  pid: pidOf(secret), v, p1: 0, at: serverTimestamp(), ...extra,
});
const pDoc = (db: any, secret: string) => doc(db, `rooms/${CODE}/participants/${secret}`);
const rDoc = (db: any, key: string, secret: string) => doc(db, `rooms/${CODE}/responses/${key}_${secret}`);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-econ-live',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('config/hosts', { uids: [HOST] });
  await setRoom({});
});

describe('students cannot read other students\' responses or the participant list', () => {
  beforeEach(async () => {
    await seed(`rooms/${CODE}/participants/${ann}`, { pid: pidOf(ann), adj: 0, eco: 0, joinedAt: new Date() });
    await seed(`rooms/${CODE}/responses/quiz-1_${ann}`, { pid: pidOf(ann), v: 1, at: new Date() });
  });
  it('cannot list participants', () => assertFails(getDocs(collection(student(), `rooms/${CODE}/participants`))));
  it('cannot list responses', () => assertFails(getDocs(collection(student(), `rooms/${CODE}/responses`))));
  it('cannot list rooms', () => assertFails(getDocs(collection(student(), 'rooms'))));
  it('can read its own participant document (it knows the secret id)', () => assertSucceeds(getDoc(pDoc(student(), ann))));
  it('a signed-in non-host cannot list either', () => assertFails(getDocs(collection(stranger(), `rooms/${CODE}/responses`))));
  it('the host can list both', async () => {
    await assertSucceeds(getDocs(collection(host(), `rooms/${CODE}/participants`)));
    await assertSucceeds(getDocs(collection(host(), `rooms/${CODE}/responses`)));
  });
});

describe('students cannot read session content, correct answers or the host list', () => {
  beforeEach(async () => { await seed('sessions/s1', { title: 'Week 1', json: '{"answers":"secret"}' }); });
  it('cannot read a session', () => assertFails(getDoc(doc(student(), 'sessions/s1'))));
  it('cannot list sessions', () => assertFails(getDocs(collection(student(), 'sessions'))));
  it('a signed-in non-host cannot read a session', () => assertFails(getDoc(doc(stranger(), 'sessions/s1'))));
  it('cannot read the host list', async () => {
    await assertFails(getDoc(doc(student(), 'config/hosts')));
    await assertFails(getDoc(doc(stranger(), 'config/hosts')));
  });
  it('nobody can edit the host list from the app', () => assertFails(setDoc(doc(host(), 'config/hosts'), { uids: [HOST, 'x'] })));
  it('the host can read and write sessions', async () => {
    await assertSucceeds(getDoc(doc(host(), 'sessions/s1')));
    await assertSucceeds(setDoc(doc(host(), 'sessions/s2'), { title: 'x' }));
  });
  it('results can be fetched by id but not listed, and not written by students', async () => {
    await seed(`rooms/${CODE}/results/quiz-1`, { n: 1 });
    await assertSucceeds(getDoc(doc(student(), `rooms/${CODE}/results/quiz-1`)));
    await assertFails(getDocs(collection(student(), `rooms/${CODE}/results`)));
    await assertFails(setDoc(doc(student(), `rooms/${CODE}/results/quiz-1`), { n: 99 }));
  });
});

describe('students cannot change the room state', () => {
  it('can read the room', () => assertSucceeds(getDoc(doc(student(), 'rooms', CODE))));
  it('cannot update it', () => assertFails(updateDoc(doc(student(), 'rooms', CODE), { frame: 5 })));
  it('cannot delete it', () => assertFails(deleteDoc(doc(student(), 'rooms', CODE))));
  it('cannot create a room', () => assertFails(setDoc(doc(student(), 'rooms', 'WXYZ'), { status: 'open' })));
  it('a signed-in non-host cannot update it', () => assertFails(updateDoc(doc(stranger(), 'rooms', CODE), { frame: 5 })));
  it('the host can', () => assertSucceeds(updateDoc(doc(host(), 'rooms', CODE), { frame: 5 })));
});

describe('joining', () => {
  it('accepts a valid participant', () => assertSucceeds(setDoc(pDoc(student(), ann), participant(ann))));
  it('rejects a pid that does not belong to the secret', () =>
    assertFails(setDoc(pDoc(student(), ann), participant(ann, { pid: pidOf(bob) }))));
  it('rejects a malformed secret', () =>
    assertFails(setDoc(pDoc(student(), 'short'), participant('short'))));
  it('rejects free-text nicknames and out-of-range positions', async () => {
    await assertFails(setDoc(pDoc(student(), ann), participant(ann, { nick: 'rude words' })));
    await assertFails(setDoc(pDoc(student(), ann), participant(ann, { adj: 'rude words' })));
    await assertFails(setDoc(pDoc(student(), ann), participant(ann, { adj: 48 })));
    await assertFails(setDoc(pDoc(student(), ann), participant(ann, { eco: -1 })));
    await assertFails(setDoc(pDoc(student(), ann), participant(ann, { eco: 1.5 })));
  });
  it('rejects a phone-chosen join time and the "fake" flag', async () => {
    await assertFails(setDoc(pDoc(student(), ann), participant(ann, { joinedAt: new Date(2020, 1, 1) })));
    await assertFails(setDoc(pDoc(student(), ann), participant(ann, { fake: true })));
  });
  it('does not let a student change the nickname or anything else afterwards', async () => {
    await assertSucceeds(setDoc(pDoc(student(), ann), participant(ann)));
    await assertFails(updateDoc(pDoc(student(), ann), { adj: 5, eco: 6 }));
    await assertFails(setDoc(pDoc(student(), ann), participant(ann, { adj: 7 })));
    await assertFails(updateDoc(pDoc(student(), ann), { pid: pidOf(bob) }));
    await assertFails(updateDoc(pDoc(student(), ann), { joinedAt: serverTimestamp() }));
    await assertFails(deleteDoc(pDoc(student(), ann)));
  });
});

describe('responses: only for the open step, only while it is open', () => {
  it('accepts an answer to the open choice question', async () => {
    await setRoom({ open: choiceOpen() });
    await assertSucceeds(setDoc(rDoc(student(), 'quiz-1', ann), choiceAnswer(ann)));
  });
  it('rejects when nothing is open', () =>
    assertFails(setDoc(rDoc(student(), 'quiz-1', ann), choiceAnswer(ann))));
  it('rejects an answer to a different step than the open one', async () => {
    await setRoom({ open: choiceOpen() });
    await assertFails(setDoc(rDoc(student(), 'quiz-2', ann), choiceAnswer(ann)));
    await assertFails(setDoc(rDoc(student(), 'quiz-12', ann), choiceAnswer(ann)));
  });
  it('rejects after the closing time (server time against opensAt + duration)', async () => {
    await setRoom({ open: choiceOpen({ opensAt: seconds(-30), durationMs: 25000 }) });
    await assertFails(setDoc(rDoc(student(), 'quiz-1', ann), choiceAnswer(ann)));
  });
  it('accepts shortly before the closing time', async () => {
    await setRoom({ open: choiceOpen({ opensAt: seconds(-20), durationMs: 25000 }) });
    await assertSucceeds(setDoc(rDoc(student(), 'quiz-1', ann), choiceAnswer(ann)));
  });
  it('rejects a phone-chosen timestamp', async () => {
    await setRoom({ open: choiceOpen() });
    await assertFails(setDoc(rDoc(student(), 'quiz-1', ann), choiceAnswer(ann, 1, { at: new Date() })));
  });
  it('rejects answering under another student\'s pid', async () => {
    await setRoom({ open: choiceOpen() });
    await assertFails(setDoc(rDoc(student(), 'quiz-1', ann), choiceAnswer(ann, 1, { pid: pidOf(bob) })));
  });
});

describe('responses: valid types, ranges and lengths', () => {
  it('choice: integer option within range, no extra fields', async () => {
    await setRoom({ open: choiceOpen() });
    const bad: [unknown, object?][] = [[7], [-1], [1.5], ['1'], [null], [1, { extra: 'x' }], [1, { fake: true }], [1, { p1: 0 }]];
    for (const [v, extra] of bad) {
      await assertFails(setDoc(rDoc(student(), 'quiz-1', ann), choiceAnswer(ann, v, extra)));
    }
    await assertSucceeds(setDoc(rDoc(student(), 'quiz-1', ann), choiceAnswer(ann, 6)));
  });
  it('guess: number within range, with the more/less answer', async () => {
    await setRoom({ open: guessOpen() });
    const bad: [unknown, object?][] = [[0], [-5], [100000.5], ['40'], [NaN], [Infinity], [40, { p1: 2 }], [40, { p1: 'more' }],
      [40, { note: 'x'.repeat(50) }]];
    for (const [v, extra] of bad) {
      await assertFails(setDoc(rDoc(student(), 'anchor', ann), guessAnswer(ann, v, extra)));
    }
    await assertSucceeds(setDoc(rDoc(student(), 'anchor', ann), guessAnswer(ann, 0.5)));
    await assertSucceeds(setDoc(rDoc(student(), 'anchor', bob), guessAnswer(bob, 100000, { p1: 1 })));
  });
  it('guess: the more/less answer is required when the question has one', async () => {
    await setRoom({ open: guessOpen() });
    await assertFails(setDoc(rDoc(student(), 'anchor', ann), { pid: pidOf(ann), v: 40, at: serverTimestamp() }));
  });
  it('guess without part 1: inclusive minimum, no p1 allowed', async () => {
    await setRoom({ open: guessOpen({ xmin: false, p1: false }) });
    await assertFails(setDoc(rDoc(student(), 'anchor', ann), guessAnswer(ann, 40)));
    await assertSucceeds(setDoc(rDoc(student(), 'anchor', ann), { pid: pidOf(ann), v: 0, at: serverTimestamp() }));
  });
  it('rejects malformed document ids', async () => {
    await setRoom({ open: choiceOpen() });
    const db = student();
    await assertFails(setDoc(doc(db, `rooms/${CODE}/responses/quiz-1_${'A'.repeat(32)}`), choiceAnswer(ann)));
    await assertFails(setDoc(doc(db, `rooms/${CODE}/responses/quiz-1_${ann}x`), choiceAnswer(ann)));
    await assertFails(setDoc(doc(db, `rooms/${CODE}/responses/quiz-1${ann}`), choiceAnswer(ann)));
  });
});

describe('students cannot change an answer already given', () => {
  beforeEach(async () => {
    await setRoom({ open: choiceOpen() });
    await assertSucceeds(setDoc(rDoc(student(), 'quiz-1', ann), choiceAnswer(ann, 1)));
  });
  it('cannot overwrite', () => assertFails(setDoc(rDoc(student(), 'quiz-1', ann), choiceAnswer(ann, 2))));
  it('cannot update', () => assertFails(updateDoc(rDoc(student(), 'quiz-1', ann), { v: 2 })));
  it('cannot delete', () => assertFails(deleteDoc(rDoc(student(), 'quiz-1', ann))));
  it('can check that its own answer arrived', () => assertSucceeds(getDoc(rDoc(student(), 'quiz-1', ann))));
});

describe('nothing can be written to a room that is not open', () => {
  const tryAll = async () => {
    await assertFails(setDoc(pDoc(student(), bob), participant(bob)));
    await assertFails(setDoc(rDoc(student(), 'quiz-1', bob), choiceAnswer(bob)));
    await assertFails(updateDoc(pDoc(student(), ann), { adj: 3 }));
  };
  beforeEach(async () => {
    await seed(`rooms/${CODE}/participants/${ann}`, { pid: pidOf(ann), adj: 0, eco: 0, joinedAt: new Date() });
  });
  it('closed room', async () => {
    await setRoom({ status: 'closed', open: choiceOpen() });
    await tryAll();
  });
  it('expired room, even if the host forgot to close it', async () => {
    await setRoom({ expiresAt: hours(-1), open: choiceOpen() });
    await tryAll();
  });
  it('room that does not exist', async () => {
    const db = student();
    await assertFails(setDoc(doc(db, `rooms/NOPE/participants/${ann}`), participant(ann)));
    await assertFails(setDoc(doc(db, `rooms/NOPE/responses/quiz-1_${ann}`), choiceAnswer(ann)));
  });
});

describe('hosts can do everything in their rooms', () => {
  it('create, update and delete rooms, results, participants and responses', async () => {
    const db = host();
    await assertSucceeds(setDoc(doc(db, 'rooms/WXYZ'), { status: 'open' }));
    await assertSucceeds(setDoc(doc(db, 'rooms/WXYZ/results/quiz-1'), { n: 3 }));
    await assertSucceeds(setDoc(doc(db, `rooms/WXYZ/participants/${ann}`), { pid: pidOf(ann), adj: 0, eco: 0, fake: true }));
    await assertSucceeds(setDoc(doc(db, `rooms/WXYZ/responses/quiz-1_${ann}`), { pid: pidOf(ann), v: 1, fake: true }));
    await assertSucceeds(deleteDoc(doc(db, `rooms/WXYZ/responses/quiz-1_${ann}`)));
    await assertSucceeds(deleteDoc(doc(db, `rooms/WXYZ/participants/${ann}`)));
    await assertSucceeds(deleteDoc(doc(db, 'rooms/WXYZ/results/quiz-1')));
    await assertSucceeds(deleteDoc(doc(db, 'rooms/WXYZ')));
  });
  it('a signed-in account that is not on the list cannot', async () => {
    const db = stranger();
    await assertFails(setDoc(doc(db, 'rooms/WXYZ'), { status: 'open' }));
    await assertFails(setDoc(doc(db, `rooms/${CODE}/results/quiz-1`), { n: 3 }));
    await assertFails(setDoc(doc(db, `rooms/${CODE}/responses/quiz-1_${ann}`), { pid: pidOf(ann), v: 1, fake: true }));
  });
});
