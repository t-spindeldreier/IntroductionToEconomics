// Choice: a question with 2 to 8 options. One activity holds a list of items that
// share a headline and (usually) the options.
//
// Session file fields:
//   question   line shown with every item ("Which method fits this research question?")
//   options    2 to 8 option texts, shared by all items (an item may bring its own)
//   timed      seconds per item; leave out for untimed
//   scored     true = points and leaderboard (needs "correct" on every item)
//   letters    show "A.", "B." in front of the options (default: more than two options)
//   compareBy  id of a guess activity with several arms. Adds the phase "split":
//              the answers per arm side by side (the balance check of an experiment)
//   items      list of { text, correct, explanation, source, options }
//              correct: option number (1 = first), letter ("B") or the exact option text
//
// Phases per item: open, closed (optional), reveal, leaderboard (scored only),
// split (only with compareBy; never a default).

import { S } from '../../strings';
import type { Activity, ActivityDef, EnterContext, FramePatch, LiveData, Session } from '../../core/types';
import { countOptions } from '../../core/stats';
import { leaderboard, type ScoredItem, type Standing } from '../../core/scoring';
import { shorten } from '../guess/def';

export function optionsOf(a: Activity, item: number): string[] {
  return a.items[item].options ?? a.options;
}

/**
 * The cumulative standings over all scored items revealed up to and including
 * frame `upTo`. Used for the results document and for the stage views.
 */
export function standingsUpTo(session: Session, upTo: number, live: LiveData): Standing[] {
  const items: ScoredItem[] = [];
  const seen = new Set<string>();
  for (const f of session.frames) {
    if (f.index > upTo) break;
    const a = session.activities[f.id];
    if (f.type !== 'choice' || !a.scored || f.item === null || seen.has(f.key)) continue;
    if (f.phase !== 'reveal' && f.phase !== 'leaderboard') continue;
    seen.add(f.key);
    const timing = live.timing(f.key);
    const answers = new Map<string, { value: number; ms: number }>();
    for (const r of live.responses(f.key)) {
      answers.set(r.pid, { value: r.v, ms: timing ? Math.max(0, r.at - timing.openedAt) : 0 });
    }
    items.push({
      key: f.key,
      correct: a.items[f.item].correct,
      durationMs: timing ? timing.durationMs : a.timed ? a.timed * 1000 : null,
      answers,
    });
  }
  return leaderboard(items);
}

/** The leaderboard document that phones read: pid -> [points, rank, gain]. */
export function boardDocument(standings: Standing[], live: LiveData): Record<string, unknown> {
  const scores: Record<string, [number, number, number]> = {};
  for (const s of standings) scores[s.pid] = [s.points, s.rank, s.gain];
  const top = standings.slice(0, 5).map((s) => {
    const p = live.participants.get(s.pid);
    return { pid: s.pid, adj: p?.adj ?? -1, eco: p?.eco ?? -1, points: s.points };
  });
  return { type: 'board', n: standings.length, scores, top };
}

/** Results to publish for the latest leaderboard, or nothing if nothing is scored yet. */
export function boardResults(session: Session, upTo: number, live: LiveData): FramePatch['results'] {
  let lastKey: string | null = null;
  for (const f of session.frames) {
    if (f.index > upTo) break;
    if (f.type === 'choice' && session.activities[f.id].scored && (f.phase === 'reveal' || f.phase === 'leaderboard')) {
      lastKey = f.key;
    }
  }
  if (lastKey === null) return undefined;
  return { id: lastKey, board: true, data: boardDocument(standingsUpTo(session, upTo, live), live) };
}

function resolveCorrect(raw: unknown, options: string[]): number | null {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= options.length) return raw - 1;
  if (typeof raw === 'string') {
    const byText = options.findIndex((o) => o.toLowerCase() === raw.trim().toLowerCase());
    if (byText >= 0) return byText;
    if (/^[A-Ha-h]$/.test(raw.trim())) {
      const i = raw.trim().toUpperCase().charCodeAt(0) - 65;
      if (i < options.length) return i;
    }
  }
  return null;
}

function validOptions(x: unknown): x is string[] {
  return Array.isArray(x) && x.length >= 2 && x.length <= 8 &&
    x.every((o) => typeof o === 'string' && o.trim() !== '' && o.length <= 120);
}

export const choiceDef: ActivityDef = {
  type: 'choice',

  validate(a, v) {
    v.only(a, ['type', 'id', 'question', 'options', 'timed', 'scored', 'letters', 'items', 'compareBy', 'splitHeadline', 'takeaway']);
    v.text(a, 'compareBy', { max: 30 });
    v.text(a, 'splitHeadline', { max: 120 });
    v.text(a, 'takeaway', { max: 400 });
    v.text(a, 'question', { required: true, max: 200 });
    v.number(a, 'timed', { min: 5, max: 600 });
    v.bool(a, 'scored');
    v.bool(a, 'letters');
    a.scored ??= false;
    a.timed ??= null;
    if (a.options !== undefined && !validOptions(a.options)) v.at('options').err('must be a list of 2 to 8 short texts');
    if (!Array.isArray(a.items) || a.items.length === 0) {
      v.at('items').err('must be a list with at least one item');
      a.items = [];
      return;
    }
    if (a.items.length > 60) v.at('items').err('has more than 60 items');
    a.items.forEach((item: any, i: number) => {
      const iv = v.at(`items[${i + 1}]`);
      if (typeof item !== 'object' || item === null) return iv.err('must have a text');
      iv.only(item, ['text', 'correct', 'explanation', 'source', 'options']);
      iv.text(item, 'text', { required: true, max: 300 });
      iv.text(item, 'explanation', { max: 200 });
      iv.text(item, 'source', { max: 200 });
      if (item.options !== undefined && !validOptions(item.options)) iv.at('options').err('must be a list of 2 to 8 short texts');
      const options = validOptions(item.options) ? item.options : validOptions(a.options) ? a.options : null;
      if (!options) return iv.err('has no options (give "options" for the activity or for the item)');
      if (item.correct === undefined || item.correct === null) {
        item.correct = null;
        if (a.scored) iv.err('needs "correct" because the activity is scored');
      } else {
        const index = resolveCorrect(item.correct, options);
        if (index === null) iv.at('correct').err(`"${item.correct}" is not one of the options (use the number, letter or exact text)`);
        item.correct = index;
      }
    });
    a.letters ??= a.items.some((_: unknown, i: number) => (a.items[i].options ?? a.options ?? []).length > 2);
  },

  link(a, activities, v) {
    if (!a.compareBy) return;
    const other = activities[a.compareBy];
    if (!other || other.type !== 'guess' || other.arms.length < 2) {
      v.at('compareBy').err(`"${a.compareBy}" must be a guess activity with two or more arms`);
    }
  },

  itemCount: (a) => a.items.length,
  phases: (a) => ['open', 'closed', 'reveal', ...(a.scored ? ['leaderboard'] : []), ...(a.compareBy ? ['split'] : [])],
  defaultPhases: (a) => ['open', 'reveal', ...(a.scored ? ['leaderboard'] : [])],

  phaseLabel(_a, phase) {
    return { open: S.phase.open, closed: S.phase.closed, reveal: S.phase.reveal, leaderboard: S.phase.leaderboard,
      split: S.phase.reveal }[phase] ?? phase;
  },
  stepLabel: (a, item) => `${S.step.question} ${(item ?? 0) + 1}/${a.items.length}: ${shorten(a.items[item ?? 0].text, 40)}`,

  enter({ session, activity: a, frame, live }: EnterContext): FramePatch {
    const i = frame.item ?? 0;
    const item = a.items[i];
    const options = optionsOf(a, i);
    const view = {
      type: 'choice',
      key: frame.key,
      phase: frame.phase,
      q: a.question,
      text: item.text,
      options,
      letters: a.letters,
      scored: a.scored,
    };

    if (frame.phase === 'open') {
      return {
        view,
        open: { key: frame.key, type: 'choice', durationMs: a.timed ? a.timed * 1000 : null, n: options.length },
      };
    }
    if (frame.phase === 'closed') return { view };
    if (frame.phase === 'split') return { view: { type: 'choice', key: frame.key, phase: 'split' } };

    // reveal and leaderboard: only now do counts, the correct option and the
    // explanation enter a document that phones can read.
    const counts = countOptions(live.responses(frame.key).map((r) => r.v), options.length);
    return {
      view: {
        ...view,
        reveal: { counts, correct: item.correct, explain: item.explanation ?? null, source: item.source ?? null },
      },
      results: a.scored ? boardResults(session, frame.index, live) : undefined,
    };
  },
};
