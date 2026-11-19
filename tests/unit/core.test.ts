import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { sha256Hex } from '../../src/core/sha256';
import { armOf, pidOf, randomRoomCode, randomSecret, ROOM_CODE_PATTERN } from '../../src/core/identity';
import { ADJECTIVES, ECONOMISTS, nickname } from '../../src/core/nicknames';
import { countOptions, logPosition, median, parseGuess } from '../../src/core/stats';
import { leaderboard, pointsFor } from '../../src/core/scoring';
import { compileSession, nextLabel } from '../../src/core/session';
import { scatterSvg, summariseBar } from '../../src/core/scatter';
import { toCsv } from '../../src/core/csv';
import { examBankHtml, studySlidesHtml } from '../../src/core/handout';
import { summariseChange, summariseGuess } from '../../src/activities/guess/def';

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
    expect(session.sections.length).toBe(4);
    expect(session.frames[0].type).toBe('picture');
    expect(session.frames.at(-1)!.section).toBe(3);
    expect(session.exam.length).toBeGreaterThanOrEqual(8);
    expect(session.activities.quiz.items.map((i: any) => i.correct)).toEqual([2, 0, 1, 3, 2]);
    expect(session.frames.filter((f) => f.id === 'burger').map((f) => f.phase)).toEqual(['assign', 'news', 'open', 'closed', 'class', 'real', 'best']);
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

describe('groups of a guess', () => {
  const r = compileSession({
    title: 't',
    activities: {
      plan: { type: 'choice', question: 'Q', options: ['Yes', 'No'], compareBy: 'exp', items: [{ text: 'Plan?' }] },
      exp: { type: 'guess', stageText: 's', part2: 'p', arms: [{ label: 'A' }, { label: 'B' }] },
      pay: { type: 'guess', stageText: 's', part2: 'p', splitBy: 'plan' },
    },
    steps: ['plan', { activity: 'plan', phases: ['split'] }, 'exp', 'pay'],
    exam: [{ question: 'Why?', answer: 'Because.', points: 4 }],
  });
  if (!r.ok) throw new Error(r.errors.join());
  const resp = (key: string, pid: string, v: number) => ({ key, pid, v, at: 0, fake: false });
  const data: Record<string, any[]> = {
    'plan-1': [resp('plan-1', 'a', 0), resp('plan-1', 'b', 0), resp('plan-1', 'c', 1)],
    pay: [resp('pay', 'a', 60), resp('pay', 'b', 80), resp('pay', 'c', 40), resp('pay', 'd', 999)],
  };
  const live = { responses: (key: string) => data[key] ?? [], participants: new Map(), timing: () => null };

  it('splits a guess by the answers to a choice question', () => {
    const groups = summariseGuess(r.session.activities.pay, live);
    expect(groups.map((g) => [g.title, g.n, g.median])).toEqual([['Yes', 2, 70], ['No', 1, 40]]); // d never answered "plan"
  });
  it('builds the exam bank with model answers and class numbers', () => {
    const html = examBankHtml(r.session, live, 'ABCD');
    expect(html).toContain('For the tutor only');
    expect(html).toContain('Because.');
    expect(html).toContain('<td>70</td>');
  });
  it('keeps exam questions out of the study slides', () => {
    expect(studySlidesHtml(r.session, live, 'ABCD')).not.toContain('Because.');
  });
  it('rejects broken references', () => {
    const bad = compileSession({ title: 't', activities: { pay: { type: 'guess', stageText: 's', part2: 'p', splitBy: 'nope' } }, steps: ['pay'] });
    expect(bad.ok ? '' : bad.errors.join()).toContain('activities.pay.splitBy: "nope" must be a choice activity');
  });
});

describe('before and after, and the table', () => {
  const r = compileSession({
    title: 't',
    activities: {
      side: { type: 'choice', question: 'Q', options: ['Front', 'Back'], items: [{ text: 'Where?' }] },
      g1: { type: 'guess', stageText: 's', part2: 'p' },
      g2: { type: 'guess', stageText: 's', part2: 'p', splitBy: 'side', before: 'g1', hint: 'Below 500', hintFor: 'Front', takeaway: 'Subtract.' },
      t: { type: 'table', title: 'Designs', stepwise: true, columns: ['Design', 'Who'], rows: [['Lab', 'Coin'], ['RD', 'A **rule**']] },
    },
    steps: ['side', { activity: 'g1', phases: ['open', 'closed'] }, 'g2', 't'],
  });
  if (!r.ok) throw new Error(r.errors.join());
  const resp = (key: string, pid: string, v: number) => ({ key, pid, v, at: 0, fake: false });
  const data: Record<string, any[]> = {
    'side-1': [resp('side-1', 'a', 0), resp('side-1', 'b', 0), resp('side-1', 'c', 1), resp('side-1', 'd', 1)],
    g1: [resp('g1', 'a', 900), resp('g1', 'b', 700), resp('g1', 'c', 1000), resp('g1', 'd', 600)],
    g2: [resp('g2', 'a', 450), resp('g2', 'b', 350), resp('g2', 'c', 900), resp('g2', 'e', 5)], // d did not answer again
  };
  const live = { responses: (key: string) => data[key] ?? [], participants: new Map(), timing: () => null };

  it('computes the difference in differences from students who answered both rounds', () => {
    const { rows, did } = summariseChange(r.session.activities.g2, live);
    expect(rows.map((x) => [x.title, x.hinted, x.n, x.before, x.after, x.change])).toEqual([
      ['Front', true, 2, 800, 400, -400], ['Back', false, 1, 1000, 900, -100]]);
    expect(did).toBe(-300);
  });
  it('sends the hint only in the open view and orders the phases', () => {
    const g2 = r.session.frames.filter((f) => f.id === 'g2').map((f) => f.phase);
    expect(g2).toEqual(['open', 'closed', 'change', 'did', 'results']);
    expect(r.session.frames.filter((f) => f.id === 't').map((f) => f.phase)).toEqual(['row1', 'row2']);
  });
  it('puts the change table and the design table into the handouts', () => {
    const slides = studySlidesHtml(r.session, live, 'ABCD');
    expect(slides).toContain('Difference in differences');
    expect(slides).toContain('−300');
    expect(slides).toContain('A <strong>rule</strong>');
    expect(examBankHtml(r.session, live, 'ABCD')).toContain('−300');
  });
  it('rejects a before-and-after guess without two groups or a hint', () => {
    const bad = compileSession({ title: 't', activities: {
      g1: { type: 'guess', stageText: 's', part2: 'p' },
      g2: { type: 'guess', stageText: 's', part2: 'p', before: 'g1' } }, steps: ['g1', 'g2'] });
    expect(bad.ok ? '' : bad.errors.join()).toContain('before: needs "splitBy"');
  });
});

describe('the restaurant game', () => {
  it('deals out real restaurants without duplicates and compares the class with the study', async () => {
    const { assignStores, storeAt, summariseRestaurant, realRows, didOf, classTakeawayOf } = await import('../../src/activities/restaurant/def');
    const { STORES } = await import('../../src/activities/restaurant/stores');
    expect(STORES.map((s) => s.length)).toEqual([100, 70]);
    expect(didOf(realRows())).toBe(2.7); // Table 3 of Card and Krueger (1994): 2.76 unrounded
    const participants = new Map(Array.from({ length: 81 }, (_, i) =>
      [pidOf('s' + i), { adj: 0, eco: 0, joinedAt: 1000 + i, fake: false }] as [string, any]));
    const stores = assignStores(participants);
    const codes = Object.values(stores);
    expect(new Set(codes).size).toBe(81); // nobody shares a restaurant
    expect(codes.filter((c) => c < 1000).length).toBe(41); // equally large groups, by order of joining
    // a student who joins later does not change anybody else's restaurant
    const later = new Map(participants).set('late', { adj: 0, eco: 0, joinedAt: 9999, fake: false } as any);
    expect(assignStores(later)).toMatchObject(stores);
    // everyone keeps their staff, except New Jersey managers who cut two jobs
    const responses = [...participants.keys()].map((pid, i) => {
      const { state, store } = storeAt(stores[pid]);
      return { key: 'burger', pid, v: store[2] - (state === 0 ? 2 : 0), at: i, fake: false };
    });
    const a = { type: 'restaurant', id: 'burger', classTakeaway: 'cut', classTakeawayNoCut: 'kept' };
    const s = summariseRestaurant(a, { responses: () => responses, participants });
    expect(s.rows.map((r) => r.change)).toEqual([-2, 0]);
    expect(s.did).toBe(-2);
    expect(classTakeawayOf(a, s.cut)).toBe('cut');
    expect(classTakeawayOf(a, false)).toBe('kept');
    expect(s.closest[0].off).toBeLessThanOrEqual(s.closest[1].off);
  });
});

describe('lottery and chart', () => {
  it('has a number for each of the 366 birthdays', async () => {
    const { DRAFT_1969 } = await import('../../src/activities/lottery/draft1969');
    expect(DRAFT_1969.map((m) => m.length)).toEqual([31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
    expect(DRAFT_1969.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 366 }, (_, i) => i + 1));
    expect(DRAFT_1969[8][13]).toBe(1); // 14 September was drawn first
  });
  it('draws only the bars that are shown, with negative values and a marker', async () => {
    const { barChartSvg } = await import('../../src/core/chart');
    const c = { labels: ['a', 'b', 'c'], values: [1, -200, 30], prefix: '$', marker: { after: 'a', text: 'then' } };
    expect(barChartSvg(c).match(/<rect/g)!.length).toBe(3);
    expect(barChartSvg(c, 1).match(/<rect/g)!.length).toBe(1);
    expect(barChartSvg(c)).toContain('−$200');
    expect(barChartSvg(c)).toContain('then');
  });
});

describe('the bar game', () => {
  const r = compileSession({
    title: 't',
    activities: {
      g1: { type: 'guess', stageText: 's', part2: 'p' },
      g2: { type: 'guess', stageText: 's', part2: 'p', before: 'g1', bar: 'median', hint: 'Upper <half>', takeaway: 'Jump.' },
    },
    steps: [{ activity: 'g1', phases: ['open', 'closed'] }, 'g2'],
  });
  if (!r.ok) throw new Error(r.errors.join());
  const resp = (key: string, pid: string, v: number) => ({ key, pid, v, at: 0, fake: false });
  const firsts = [10, 20, 30, 40, 50, 60, 70, 80]; // median 45
  const seconds = [11, 19, 31, 42, 35, 45, 60, 70]; // above the bar: lower than the first guess
  const data: Record<string, any[]> = {
    g1: [...firsts.map((v, i) => resp('g1', 'p' + i, v)), resp('g1', 'gone', 45.5)],
    g2: [...seconds.map((v, i) => resp('g2', 'p' + i, v)), resp('g2', 'new', 5)],
  };
  const live = { responses: (key: string) => data[key] ?? [], participants: new Map(), timing: () => null };

  it('uses the class median as the bar and compares the students next to it', () => {
    const s = summariseBar(r.session.activities.g2, live);
    expect(s.bar).toBe(45.5);
    expect(s.points.length).toBe(8); // only students who answered both rounds
    expect([s.below.n, s.below.median, s.above.n, s.above.median]).toEqual([4, 25, 4, 52.5]);
    expect([s.nearBelow.n, s.nearBelow.median, s.nearAbove.n, s.nearAbove.median]).toEqual([3, 31, 3, 45]);
    expect(s.jump).toBe(14);
    expect(s.points.filter((p) => p.near).map((p) => p.x).sort()).toEqual([20, 30, 40, 50, 60, 70]);
  });
  it('has its own phases and marks the first guess as paired', () => {
    expect(r.session.frames.filter((f) => f.id === 'g2').map((f) => f.phase)).toEqual(['open', 'closed', 'scatter', 'band']);
    expect(r.session.activities.g1.paired).toBe(true);
  });
  it('draws one dot per student and puts plot and numbers into the handouts', () => {
    const s = summariseBar(r.session.activities.g2, live);
    expect(scatterSvg(s, { min: 1, max: 1000 }, true).match(/<circle/g)!.length).toBe(8);
    const slides = studySlidesHtml(r.session, live, 'ABCD');
    expect(slides).toContain('<svg');
    expect(slides).toContain('Upper &lt;half&gt;');
    expect(examBankHtml(r.session, live, 'ABCD')).toContain('Jump at the bar (45.5)');
  });
  it('rejects a bar without a first guess or a message', () => {
    const bad = compileSession({ title: 't', activities: { g2: { type: 'guess', stageText: 's', part2: 'p', bar: 'median' } }, steps: ['g2'] });
    expect(bad.ok ? '' : bad.errors.join()).toContain('bar: needs "before" and "hint"');
  });
});

describe('study slides', () => {
  it('contains questions, correct answers and class results, and escapes markup', () => {
    const r = compileSession({
      title: 'Demo <b>',
      activities: {
        q: { type: 'choice', question: 'Pick', options: ['Yes', 'No <i>'], items: [{ text: 'Is it?', correct: 2, explanation: 'Because.' }] },
        p: { type: 'prompt', text: 'Discuss **this**', mode: 'pair', reveal: 'Model' },
      },
      steps: [{ section: 'Part one' }, 'q', 'p'],
    });
    if (!r.ok) throw new Error(r.errors.join());
    const live = {
      responses: (key: string) => (key === 'q-1' ? [0, 1, 1, 1].map((v, i) => ({ key, pid: 'p' + i, v, at: 0, fake: false })) : []),
      participants: new Map(), timing: () => null,
    };
    const html = studySlidesHtml(r.session, live, 'ABCD');
    expect(html).toContain('Demo &lt;b&gt;');
    expect(html).toContain('Part 1 of 1');
    expect(html).toContain('✓ No &lt;i&gt;');
    expect(html).toContain('75%');
    expect(html).toContain('Because.');
    expect(html).toContain('Discuss <strong>this</strong>');
    expect(html).toContain('With your neighbour');
    expect(html).not.toContain('<i>');
  });
});

describe('csv', () => {
  it('quotes where needed and writes empty cells for null', () => {
    const csv = toCsv(['a', 'b', 'c'], [[1, 'plain', null], [2.5, 'has, comma', 'say "hi"']]);
    expect(csv).toBe('a,b,c\r\n1,plain,\r\n2.5,"has, comma","say ""hi"""\r\n');
  });
});
