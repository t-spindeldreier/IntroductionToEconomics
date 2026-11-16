import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { sha256Hex } from '../../src/core/sha256';
import { armOf, pidOf, randomRoomCode, randomSecret, ROOM_CODE_PATTERN } from '../../src/core/identity';
import { ADJECTIVES, ECONOMISTS, nickname } from '../../src/core/nicknames';
import { countOptions, logPosition, median, parseGuess } from '../../src/core/stats';
import { leaderboard, pointsFor } from '../../src/core/scoring';
import { compileSession, nextLabel } from '../../src/core/session';
import { toCsv } from '../../src/core/csv';

describe('sha256 and identity', () => {
  it('matches known SHA-256 values', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('a'.repeat(200))).toBe('c2a908d98f5df987ade41b5fce213067efbcc21ef2240212a41e54b5e7c28ae5');
  });
  it('makes secrets, pids and room codes of the right shape', () => {
    const s = randomSecret();
    expect(s).toMatch(/^[a-z0-9]{32}$/);
    expect(pidOf(s)).toMatch(/^[0-9a-f]{16}$/);
    expect(randomRoomCode()).toMatch(ROOM_CODE_PATTERN);
  });
  it('assigns arms deterministically and roughly evenly', () => {
    let a = 0;
    for (let i = 0; i < 2000; i++) {
      const pid = pidOf('secret' + i);
      const arm = armOf(pid, 'anchor', 2);
      expect(armOf(pid, 'anchor', 2)).toBe(arm);
      if (arm === 0) a++;
    }
    expect(a).toBeGreaterThan(900);
    expect(a).toBeLessThan(1100);
    expect(armOf('x', 'poll', 1)).toBe(0);
  });
});

describe('nicknames', () => {
  it('has list lengths that match the constants in firestore.rules', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    expect(rules).toContain(`function nAdj() { return ${ADJECTIVES.length}; }`);
    expect(rules).toContain(`function nEco() { return ${ECONOMISTS.length}; }`);
  });
  it('has no duplicates and builds names', () => {
    expect(new Set(ADJECTIVES).size).toBe(ADJECTIVES.length);
    expect(new Set(ECONOMISTS).size).toBe(ECONOMISTS.length);
    expect(nickname(0, 0)).toBe('Exogenous Ostrom');
  });
});

describe('stats', () => {
  it('computes medians', () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('is not wrecked by one student typing a million', () => {
    expect(median([10, 20, 30, 40, 1_000_000])).toBe(30);
  });
  it('places values on a log axis and pins outliers to the edge', () => {
    expect(logPosition(1, 1, 10000)).toBe(0);
    expect(logPosition(100, 1, 10000)).toBeCloseTo(0.5);
    expect(logPosition(10000, 1, 10000)).toBe(1);
    expect(logPosition(0.2, 1, 10000)).toBe(0);
    expect(logPosition(5e6, 1, 10000)).toBe(1);
  });
  it('counts options and ignores invalid answers', () => {
    expect(countOptions([0, 1, 1, 2, 7, -1, 1.5], 3)).toEqual([1, 2, 1]);
  });
  it('parses guesses with a point or a comma', () => {
    expect(parseGuess('40')).toBe(40);
    expect(parseGuess('40.5')).toBe(40.5);
    expect(parseGuess('40,5')).toBe(40.5);
    expect(parseGuess(' 1 000 ')).toBe(1000);
    expect(parseGuess('.5')).toBe(0.5);
    expect(parseGuess('')).toBeNull();
    expect(parseGuess('abc')).toBeNull();
    expect(parseGuess('1e9')).toBeNull();
    expect(parseGuess('-3')).toBeNull();
    expect(parseGuess('1,2,3')).toBeNull();
  });
});

describe('scoring', () => {
  it('gives 500 plus up to 500 for speed, 0 for wrong', () => {
    expect(pointsFor(true, 0, 25000)).toBe(1000);
    expect(pointsFor(true, 25000, 25000)).toBe(500);
    expect(pointsFor(true, 12500, 25000)).toBe(750);
    expect(pointsFor(true, 99999, 25000)).toBe(500);
    expect(pointsFor(false, 100, 25000)).toBe(0);
    expect(pointsFor(true, 3000, null)).toBe(500);
  });
  it('ranks by points and breaks ties by lower total response time', () => {
    const item = (key: string, answers: [string, number, number][]) => ({
      key, correct: 1, durationMs: 20000,
      answers: new Map(answers.map(([pid, value, ms]) => [pid, { value, ms }])),
    });
    const board = leaderboard([
      item('q1', [['ann', 1, 10000], ['bob', 1, 10000], ['cat', 0, 1000]]),
      item('q2', [['ann', 0, 5000], ['bob', 0, 2000], ['dan', 1, 0]]),
    ]);
    expect(board.map((s) => s.pid)).toEqual(['dan', 'bob', 'ann', 'cat']);
    expect(board[0]).toMatchObject({ points: 1000, rank: 1, gain: 1000 });
    expect(board[1]).toMatchObject({ points: 750, rank: 2, gain: 0, totalMs: 12000 });
    expect(board[2]).toMatchObject({ points: 750, rank: 3, totalMs: 15000 });
    // cat skipped q2: counts as the full duration for the tie-breaker
    expect(board[3]).toMatchObject({ points: 0, rank: 4, totalMs: 21000 });
  });
});

describe('session files', () => {
  const load = (path: string) => compileSession(parse(readFileSync(path, 'utf8')));

  it('compiles the demo session', () => {
    const r = load('sessions/demo.yaml');
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.session.frames[0]).toMatchObject({ type: 'lobby', collect: 'un-members' });
    expect(r.session.frames.at(-1)!.type).toBe('end');
  });

  it.runIf(existsSync('sessions/private/week1.yaml'))('compiles the week-1 session as in Appendix A', () => {
    const r = load('sessions/private/week1.yaml');
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    const { session } = r;
    // 1 lobby + 1 close + 6x2 + 1 + 3 reveals + 4 + 1 + 2 + 8x3 + podium + 2 + end
    expect(session.frames.length).toBe(1 + 1 + 12 + 1 + 3 + 4 + 1 + 2 + 24 + 1 + 2 + 1);
    expect(session.activities.quiz.items.map((i: any) => i.correct)).toEqual([1, 2, 3, 4, 5, 0, 6, 6]);
    expect(session.activities.rf.items.map((i: any) => i.correct)).toEqual([0, 1, 0, 0, 1, 0]);
    // the hint before the first reveal must not say "versions"
    const firstReveal = session.frames.findIndex((f) => f.phase === 'versions');
    expect(nextLabel(session, firstReveal - 1)).toBe('reveal (1 of 3)');
    expect(nextLabel(session, session.frames.length - 1)).toBeNull();
    // step labels are on the projector too: they must not leak the word "anchor"
    expect(session.steps.some((s) => /anchor/i.test(s.label))).toBe(false);
  });

  it('reports clear errors', () => {
    const r = compileSession({
      title: 'x',
      activities: {
        Bad_Id: { type: 'prompt', text: 'hi' },
        q: { type: 'choice', question: 'Q', options: ['a', 'b'], scored: true, items: [{ text: 't' }, { text: 'u', correct: 'z' }] },
        g: { type: 'guess', part2: 'p', colour: 'red' },
        w: { type: 'wheel' },
      },
      steps: ['q'],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const all = r.errors.join('\n');
    expect(all).toContain('activities.Bad_Id: the id may only contain');
    expect(all).toContain('activities.q.items[1]: needs "correct"');
    expect(all).toContain('activities.q.items[2].correct: "z" is not one of the options');
    expect(all).toContain('activities.g: unknown field "colour"');
    expect(all).toContain('activities.g.stageText: is missing');
    expect(all).toContain('activities.w: unknown type "wheel"');
  });

  it('checks steps', () => {
    const activities = { p: { type: 'prompt', text: 'hi' } };
    const errors = (steps: unknown[]) => {
      const r = compileSession({ title: 'x', activities, steps });
      return r.ok ? '' : r.errors.join('\n');
    };
    expect(errors(['nope'])).toContain('steps[1]: there is no activity "nope"');
    expect(errors([{ activity: 'p', phases: ['reveal'] }])).toContain('"reveal" is not a phase');
    expect(errors([{ activity: 'p', collect: 'p' }])).toContain('only allowed on the lobby step');
    expect(errors(['lobby', 'p', 'end'])).toBe('');
  });
});

describe('csv', () => {
  it('quotes where needed and writes empty cells for null', () => {
    const csv = toCsv(['a', 'b', 'c'], [[1, 'plain', null], [2.5, 'has, comma', 'say "hi"']]);
    expect(csv).toBe('a,b,c\r\n1,plain,\r\n2.5,"has, comma","say ""hi"""\r\n');
  });
});
