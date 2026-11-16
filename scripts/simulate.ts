// Drives 100 phones and one stage through a complete session against the emulator
// and prints document reads and writes by client type. Exceeding the budget of
// section 5.2 of the brief (15,000 reads, 3,000 writes) is a failure.
//
//   npm run simulate                      week-1 session if present, else the demo
//   npm run simulate -- sessions/demo.yaml 150
//
// It uses the same PhoneClient and StageController as the real app, with the real
// Firebase SDK, so the security rules are exercised as well.

import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, type Firestore } from 'firebase/firestore';
import { compileSession } from '../src/core/session';
import { needsBoard } from '../src/activities/defs';
import { Meter } from '../src/data/convert';
import { PhoneClient, type KeyValueStore } from '../src/data/phoneClient';
import { createRoom, StageController, uploadSession } from '../src/data/hostClient';
import { fakeAnswer } from '../src/data/bots';

const PROJECT = 'demo-econ-live';
const READ_BUDGET = 15000;
const WRITE_BUDGET = 3000;

const args = process.argv.slice(2);
const file = args[0] ?? (existsSync('sessions/private/week1.yaml') ? 'sessions/private/week1.yaml' : 'sessions/demo.yaml');
const N = Number(args[1] ?? 100);
const LATE = Math.round(N / 10); // join after the lobby
const RELOADERS = Math.round(N / 20); // reload their page in the middle

const ANSWER_SPREAD_MS = 5000; // phones answer within this time after a question opens

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const failures: string[] = [];
const check = (ok: boolean, message: string) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`);
  if (!ok) failures.push(message);
};

function firestore(name: string): Firestore {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo' }, name);
  const db = initializeFirestore(app, {});
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return db;
}

function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
}

async function main() {
  const raw = parse(readFileSync(file, 'utf8'));
  const compiled = compileSession(raw);
  if (!compiled.ok) throw new Error(compiled.errors.join('\n'));
  const session = compiled.session;
  console.log(`Session "${session.title}" (${file}): ${session.frames.length} frames, ${N} phones\n`);

  // ----- host: sign in on the auth emulator, get onto the host list -----
  const hostApp = initializeApp({ projectId: PROJECT, apiKey: 'demo' }, 'host');
  const auth = getAuth(hostApp);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const cred = await signInWithCredential(auth, GoogleAuthProvider.credential(
    JSON.stringify({ sub: 'sim-host', email: 'host@example.com', email_verified: true })));
  const uid = cred.user.uid;
  // "Bearer owner" bypasses the rules on the emulator, like the Firebase console does in production.
  const seeded = await fetch(
    `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/config/hosts`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { uids: { arrayValue: { values: [{ stringValue: uid }] } } } }),
    });
  if (!seeded.ok) throw new Error('Could not write config/hosts: ' + (await seeded.text()));

  const hostDb = initializeFirestore(hostApp, {});
  connectFirestoreEmulator(hostDb, '127.0.0.1', 8080);
  const stageMeter = new Meter();
  const sessionId = await uploadSession(hostDb, uid, session.title, raw);
  const code = await createRoom(hostDb, uid, sessionId, session);
  stageMeter.writes += 2;
  stageMeter.ruleReads += 2;
  stageMeter.reads += 2; // code-collision check, session load
  const stage = new StageController(hostDb, code, session, stageMeter);
  stage.start();

  // ----- phones -----
  interface Phone { client: PhoneClient; store: KeyValueStore; db: Firestore; meter: Meter; seen: Set<string> }
  const phones: Phone[] = [];
  let lateAnswers = 0;

  function attach(phone: Phone) {
    const client = new PhoneClient(phone.db, code, phone.store, needsBoard, phone.meter);
    phone.client = client;
    client.onChange(() => {
      const room = client.room;
      const me = client.me;
      if (!room || !me) return;
      phone.seen.add(`${room.frame}`);
      const open = room.open;
      if (!open || client.answers[open.key] || !me.joined) return;
      // Answer like a simulated student would, a little faster so the run stays short.
      const frame = session.frames[room.frame];
      const activity = session.activities[frame.collect ?? frame.id];
      const answer = fakeAnswer(activity, frame, open, me.pid);
      const delay = 150 + Math.random() * ANSWER_SPREAD_MS;
      setTimeout(() => {
        if (client.room?.open?.key === open.key) void client.submit(open.key, answer.v, answer.p1);
      }, delay);
    });
    client.start();
  }

  function addPhone(i: number) {
    const phone: Phone = { client: null as any, store: memoryStore(), db: firestore(`phone-${i}`), meter: new Meter(), seen: new Set() };
    phones.push(phone);
    attach(phone);
  }

  for (let i = 0; i < N - LATE; i++) addPhone(i);
  await sleep(4000); // lobby: everybody joins and guesses

  // ----- the tutor presses the right-arrow key until the end -----
  const total = session.frames.length;
  let timerOps = 0;
  while (stage.room!.frame < total - 1) {
    await stage.next();
    const frame = stage.frame!;
    const room = stage.room!;
    if (frame.index === 3) for (let i = N - LATE; i < N; i++) addPhone(i); // latecomers
    if (frame.index === Math.floor(total / 2)) {
      // Some students reload the page: same storage, new connection.
      for (const phone of phones.slice(0, RELOADERS)) {
        phone.client.stop();
        attach(phone);
      }
    }
    if (room.open) {
      // Give the students time to answer, then wait until the stage has received
      // what the phones have had confirmed (the local emulator delivers with a lag
      // when a hundred answers arrive within seconds; a real class is far slower).
      const key = room.open.key;
      await sleep(ANSWER_SPREAD_MS + 800);
      const confirmedHere = () => phones.filter((p) => p.client.answers[key]?.state === 'ok').length;
      for (let waited = 0; waited < 60000 && stage.responses(key).length < confirmedHere(); waited += 250) await sleep(250);
    }
    else if (room.timer && timerOps < 9) {
      // The tutor pauses, resumes and extends three of the countdowns.
      await sleep(150);
      await stage.toggleTimer();
      await stage.toggleTimer();
      await stage.addTime();
      timerOps += 3;
      await sleep(150);
    } else await sleep(250);
  }
  await sleep(2500); // let the last updates and the late correction arrive

  // ----- checks -----
  console.log('\nChecks');
  const room = stage.room!;
  check(room.frame === total - 1, `the stage reached the last frame (${room.frame + 1} of ${total})`);
  check(stage.participants.size === N, `${stage.participants.size} of ${N} phones joined`);
  check(phones.every((p) => p.client.room?.seq === room.seq), 'every phone has the final room state');
  check(phones.slice(0, RELOADERS).every((p) => p.client.me!.joined), 'reloaded phones kept their identity');

  const pending = phones.reduce((n, p) => n + Object.values(p.client.answers).filter((a) => a.state === 'pending').length, 0);
  lateAnswers = phones.reduce((n, p) => n + Object.values(p.client.answers).filter((a) => a.state === 'late').length, 0);
  const confirmed = phones.reduce((n, p) => n + Object.values(p.client.answers).filter((a) => a.state === 'ok').length, 0);
  const stored = [...new Set(session.frames.map((f) => f.collect ?? f.key))].reduce((n, key) => n + stage.responses(key).length, 0);
  if (confirmed !== stored) {
    for (const key of new Set(session.frames.map((f) => f.collect ?? f.key))) {
      const onPhones = phones.filter((p) => p.client.answers[key]?.state === 'ok').length;
      if (onPhones !== stage.responses(key).length) console.log(`      ${key}: phones ${onPhones}, stage ${stage.responses(key).length}`);
    }
  }
  check(pending === 0, 'no answer is still pending');
  check(confirmed === stored, `answers confirmed on phones (${confirmed}) = answers stored (${stored}); ${lateAnswers} arrived too late and were refused`);

  const scoredFrames = session.frames.filter((f) => f.type === 'choice' && session.activities[f.id].scored);
  if (scoredFrames.length > 0) {
    const withRank = phones.filter((p) => p.client.board && p.client.board.scores[p.client.me!.pid]);
    const ranks = new Set(withRank.map((p) => p.client.board!.scores[p.client.me!.pid][1]));
    check(withRank.length > N * 0.9, `${withRank.length} phones know their final rank`);
    check(ranks.size === withRank.length, 'all ranks are different');
    check(phones.every((p) => !p.client.board || p.client.board.id === room.board), 'every phone has the latest leaderboard');
  }

  const csv = stage.exportCsv(false);
  check(csv.responses.trim().split('\r\n').length === stored + 1, 'responses.csv has one row per answer');
  check(csv.participants.trim().split('\r\n').length === N + 1, 'participants.csv has one row per student');

  // ----- the budget -----
  const sum = (f: (m: Meter) => number) => phones.reduce((n, p) => n + f(p.meter), 0);
  const rows = [
    ['phones (all)', sum((m) => m.reads), sum((m) => m.ruleReads), sum((m) => m.writes)],
    ['stage', stageMeter.reads, stageMeter.ruleReads, stageMeter.writes],
  ] as [string, number, number, number][];
  const reads = rows.reduce((n, r) => n + r[1] + r[2], 0);
  const writes = rows.reduce((n, r) => n + r[3], 0);
  console.log('\nBillable operations');
  console.log('  client          reads   rule reads   writes');
  for (const [name, r, rr, w] of rows) {
    console.log(`  ${name.padEnd(13)} ${String(r).padStart(7)} ${String(rr).padStart(12)} ${String(w).padStart(8)}`);
  }
  console.log(`  per phone     ${String(Math.round((rows[0][1] + rows[0][2]) / N)).padStart(7)} reads incl. rule reads, ${(rows[0][3] / N).toFixed(1)} writes`);
  console.log(`  TOTAL         ${reads} reads (budget ${READ_BUDGET}), ${writes} writes (budget ${WRITE_BUDGET})\n`);
  // The budget is defined for 100 students; scale it for other class sizes.
  const scale = Math.max(1, N / 100);
  check(reads <= READ_BUDGET * scale, `reads within budget (${reads} <= ${READ_BUDGET * scale})`);
  check(writes <= WRITE_BUDGET * scale, `writes within budget (${writes} <= ${WRITE_BUDGET * scale})`);

  // ----- deletion -----
  await stage.deleteRoom();
  const left = await fetch(
    `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/rooms/${code}/responses?pageSize=1`,
    { headers: { Authorization: 'Bearer owner' } });
  const body = (await left.json()) as { documents?: unknown[] };
  check(!body.documents || body.documents.length === 0, 'deleting the room removed its data');

  for (const p of phones) p.client.stop();
  console.log(failures.length === 0 ? '\nSimulation passed.' : `\nSimulation FAILED (${failures.length}).`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
