// Guess: a numeric guess. Three uses:
//   - with two or more hidden versions ("arms"): the randomized experiment;
//   - with "splitBy": the answers are shown split by what students answered to a
//     choice question (groups they chose themselves, for comparison with the experiment);
//   - with neither: a plain numeric poll.
//
// Session file fields:
//   stageText       question shown on the stage while collecting (neutral, no anchor)
//   stageHint       optional second line (default: "Answer on your phone. Keep ...")
//   part1           optional yes/no style first question; "{anchor}" is replaced per arm
//   part1Options    two button labels for part 1 (default: More, Less)
//   part2           the guess prompt; "___" marks where the input field goes
//   arms            list of { label, anchor }; default: one arm
//   splitBy         id of a choice activity (its first item): one row per option
//   min, max        allowed range; exclusiveMin: true means "greater than min"
//   axis            { min, max, scale } of the dot plot; scale is log (default) or linear
//   revealHeadline  headline for the "versions" reveal
//   truth           optional { value, label }
//   takeaway        one or two sentences shown with the last reveal and in the study slides
//
// A before-and-after comparison (difference-in-differences) needs two guesses and
// one choice question with exactly two options. On the second guess:
//   splitBy         the choice question that defines the two groups
//   before          id of the first guess. Adds the phases "change" (first guess,
//                   second guess and change per group) and "did" (the change of
//                   one group minus the change of the other, with the takeaway)
//   hint            text that only one group sees on the phone, above the question
//   hintFor         which group: the option's exact text or its number (1 = first)

import { S } from '../../strings';
import type { Activity, ActivityDef, EnterContext, FramePatch, LiveData } from '../../core/types';
import { armOf } from '../../core/identity';
import { median } from '../../core/stats';

export interface GuessGroup {
  label: string; // "A", or the option text
  title: string; // "Version A", "Yes", "All answers"
  n: number;
  median: number | null;
  values: number[];
}

/**
 * The answers in groups: by arm (recomputed from the pid, never taken from the
 * phone), by the answer to another question (splitBy), or all in one group.
 */
export function summariseGuess(a: Activity, live: Pick<LiveData, 'responses'>): GuessGroup[] {
  const responses = live.responses(a.id);
  let groups: GuessGroup[];
  if (a.splitBy) {
    const options: string[] = a.splitOptions;
    const chosen = new Map(live.responses(`${a.splitBy}-1`).map((r) => [r.pid, r.v]));
    groups = options.map((o) => ({ label: o, title: o, n: 0, median: null, values: [] }));
    for (const r of responses) {
      const option = chosen.get(r.pid);
      if (option !== undefined && groups[option]) groups[option].values.push(r.v);
    }
  } else {
    groups = a.arms.map((arm: any) => ({
      label: arm.label,
      title: a.arms.length > 1 ? `${S.version} ${arm.label}` : S.allAnswers,
      n: 0, median: null, values: [],
    }));
    for (const r of responses) groups[armOf(r.pid, a.id, groups.length)].values.push(r.v);
  }
  for (const g of groups) {
    g.n = g.values.length;
    g.median = median(g.values);
  }
  return groups;
}

export interface GuessChange {
  title: string;
  hinted: boolean;
  n: number; // students of this group who answered both rounds
  before: number | null;
  after: number | null;
  change: number | null;
}

/**
 * Before and after, per group of the splitBy question, for students who answered
 * both rounds. "did" is the change of the hinted group minus the change of the other.
 */
export function summariseChange(a: Activity, live: Pick<LiveData, 'responses'>): { rows: GuessChange[]; did: number | null } {
  const options: string[] = a.splitOptions;
  const chosen = new Map(live.responses(`${a.splitBy}-1`).map((r) => [r.pid, r.v]));
  const first = new Map(live.responses(a.before).map((r) => [r.pid, r.v]));
  const pairs: { before: number[]; after: number[] }[] = options.map(() => ({ before: [], after: [] }));
  for (const r of live.responses(a.id)) {
    const option = chosen.get(r.pid);
    const b = first.get(r.pid);
    if (option === undefined || b === undefined || !pairs[option]) continue;
    pairs[option].before.push(b);
    pairs[option].after.push(r.v);
  }
  const rows = options.map((title, i) => {
    const before = median(pairs[i].before), after = median(pairs[i].after);
    return { title, hinted: i === a.hintOption, n: pairs[i].before.length, before, after,
      change: before === null || after === null ? null : after - before };
  });
  const treated = rows.find((r) => r.hinted), control = rows.find((r) => !r.hinted);
  const did = treated && control && treated.change !== null && control.change !== null ? treated.change - control.change : null;
  return { rows, did };
}

/** "+120", "−350", "0": a change with its sign. */
export function signed(x: number | null, format: (x: number) => string): string {
  if (x === null) return '–';
  return x === 0 ? '0' : (x > 0 ? '+' : '−') + format(Math.abs(x));
}

export function part1Text(a: Record<string, any>, anchor: unknown): string {
  return String(a.part1 ?? '').replace('{anchor}', String(anchor ?? ''));
}

export const guessDef: ActivityDef = {
  type: 'guess',

  validate(a, v) {
    v.only(a, ['type', 'id', 'stageText', 'stageHint', 'part1', 'part1Options', 'part2', 'arms', 'splitBy',
      'min', 'max', 'exclusiveMin', 'axis', 'revealHeadline', 'truth', 'takeaway', 'before', 'hint', 'hintFor']);
    v.text(a, 'before', { max: 30 });
    v.text(a, 'hint', { max: 200 });
    if (a.before && !a.splitBy) v.at('before').err('needs "splitBy" as well');
    if (a.hint && !a.splitBy) v.at('hint').err('needs "splitBy" as well');
    if (!!a.hint !== (a.hintFor !== undefined)) v.at('hint').err('"hint" and "hintFor" belong together');
    v.text(a, 'stageText', { required: true });
    v.text(a, 'stageHint');
    v.text(a, 'part1');
    v.text(a, 'part2', { required: true });
    v.text(a, 'revealHeadline');
    v.text(a, 'takeaway', { max: 400 });
    v.text(a, 'splitBy', { max: 30 });
    v.number(a, 'min');
    v.number(a, 'max');
    v.bool(a, 'exclusiveMin');
    a.min ??= 0;
    a.max ??= 1_000_000;
    a.exclusiveMin ??= false;
    if (typeof a.min === 'number' && typeof a.max === 'number' && a.min >= a.max) v.err('min must be below max');

    a.arms ??= [{ label: 'A' }];
    if (!Array.isArray(a.arms) || a.arms.length < 1 || a.arms.length > 4) {
      v.at('arms').err('must be a list of 1 to 4 arms');
      a.arms = [{ label: 'A' }];
    }
    if (a.splitBy && a.arms.length > 1) v.at('splitBy').err('cannot be combined with several arms');
    a.arms.forEach((arm: any, i: number) => {
      const av = v.at(`arms[${i + 1}]`);
      if (typeof arm !== 'object' || arm === null) return av.err('must have a label');
      av.only(arm, ['label', 'anchor']);
      av.text(arm, 'label', { required: true, max: 12 });
      if (a.part1 && String(a.part1).includes('{anchor}') && arm.anchor === undefined) av.err('needs an anchor');
      if (arm.anchor !== undefined && typeof arm.anchor !== 'number' && typeof arm.anchor !== 'string') {
        av.at('anchor').err('must be a number or text');
      }
    });

    if (a.part1) {
      a.part1Options ??= ['More', 'Less'];
      const ok = Array.isArray(a.part1Options) && a.part1Options.length === 2 &&
        a.part1Options.every((o: unknown) => typeof o === 'string' && o.length > 0 && o.length <= 30);
      if (!ok) v.at('part1Options').err('must be exactly two short texts');
    } else if (a.part1Options) {
      v.at('part1Options').err('is only allowed together with part1');
    }

    a.axis ??= { min: 1, max: 10000 };
    const ax = v.at('axis');
    if (typeof a.axis !== 'object' || a.axis === null) ax.err('must have min and max');
    else {
      ax.only(a.axis, ['min', 'max', 'scale']);
      a.axis.scale ??= 'log';
      if (a.axis.scale !== 'log' && a.axis.scale !== 'linear') ax.at('scale').err('must be log or linear');
      ax.number(a.axis, 'min', { required: true, min: a.axis.scale === 'log' ? 1e-9 : undefined });
      ax.number(a.axis, 'max', { required: true });
      if (a.axis.min >= a.axis.max) ax.err('min must be below max');
    }

    if (a.truth !== undefined) {
      const tv = v.at('truth');
      if (typeof a.truth !== 'object' || a.truth === null) tv.err('must have value and label');
      else {
        tv.only(a.truth, ['value', 'label']);
        tv.number(a.truth, 'value', { required: true });
        tv.text(a.truth, 'label', { required: true, max: 80 });
      }
    }
  },

  // splitBy must name a choice activity; remember its options for the group labels.
  link(a, activities, v) {
    if (!a.splitBy) return;
    const other = activities[a.splitBy];
    if (!other || other.type !== 'choice') return v.at('splitBy').err(`"${a.splitBy}" must be a choice activity`);
    a.splitOptions = other.items[0].options ?? other.options;
    if (a.hintFor !== undefined) {
      const i = typeof a.hintFor === 'number' ? a.hintFor - 1
        : a.splitOptions.findIndex((o: string) => o.toLowerCase() === String(a.hintFor).trim().toLowerCase());
      if (!Number.isInteger(i) || i < 0 || i >= a.splitOptions.length) {
        return v.at('hintFor').err(`"${a.hintFor}" is not an option of "${a.splitBy}" (use the exact text or the number)`);
      }
      a.hintOption = i;
    }
    if (a.before) {
      const first = activities[a.before];
      if (!first || first.type !== 'guess' || first.id === a.id) return v.at('before').err(`"${a.before}" must be another guess activity`);
      if (a.splitOptions.length !== 2) v.at('before').err(`needs a "splitBy" question with exactly two options`);
      if (a.hintFor === undefined) v.at('before').err('needs "hint" and "hintFor" as well');
    }
  },

  itemCount: () => 0,

  phases(a) {
    return ['open', 'closed', ...(a.arms.length > 1 ? ['versions'] : []), 'results',
      ...(a.before ? ['change', 'did'] : []), ...(a.truth ? ['truth'] : [])];
  },
  // A before-and-after guess shows the change first and the plot with the true value last.
  defaultPhases(a) {
    if (a.before) return ['open', 'closed', 'change', 'did', ...(a.truth ? ['truth'] : ['results'])];
    return this.phases(a);
  },

  // "reveal (1 of 3)" rather than "reveal versions": the hint is on the projector.
  phaseLabel(a, phase) {
    if (phase === 'open') return S.phase.open;
    if (phase === 'closed') return S.phase.closed;
    const reveals = this.phases(a).filter((p) => p !== 'open' && p !== 'closed');
    return reveals.length === 1 ? S.phase.reveal : S.phase.revealStep(reveals.indexOf(phase) + 1, reveals.length);
  },
  stepLabel: (a) => `${S.step.guess}: ${shorten(a.stageText)}`,

  enter({ activity: a, frame, live }: EnterContext): FramePatch {
    const base = { type: 'guess', key: a.id, phase: frame.phase };
    const armsPublic = a.arms.map((arm: any) => ({ label: arm.label, anchor: arm.anchor ?? null }));

    if (frame.phase === 'open') {
      return {
        view: {
          ...base,
          part1: a.part1 ?? null,
          p1opts: a.part1 ? a.part1Options : null,
          part2: a.part2,
          arms: armsPublic,
          min: a.min,
          max: a.max,
          xmin: a.exclusiveMin,
          // Only phones that gave this answer to the splitBy question show the hint.
          ...(a.hint ? { hint: a.hint, hintKey: `${a.splitBy}-1`, hintOpt: a.hintOption } : {}),
          ...(a.before ? { beforeKey: a.before } : {}),
        },
        open: { key: a.id, type: 'guess', durationMs: null, min: a.min, max: a.max, xmin: a.exclusiveMin, p1: !!a.part1 },
      };
    }
    if (frame.phase === 'closed') return { view: base };

    // versions / results / truth: phones learn which version they had.
    const view = { ...base, part1: a.part1 ?? null, arms: armsPublic };
    if (frame.phase === 'versions') return { view };
    // After the change is on the projector, phones may say whether they had the hint.
    if (frame.phase === 'change' || frame.phase === 'did') {
      return { view: { ...base, hint: a.hint, hintKey: `${a.splitBy}-1`, hintOpt: a.hintOption } };
    }
    return {
      view,
      results: {
        id: a.id,
        board: false,
        data: { type: 'guess', groups: summariseGuess(a, live).map(({ label, n, median }) => ({ label, n, median })) },
      },
    };
  },
};

export function shorten(text: string, max = 48): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…';
}
