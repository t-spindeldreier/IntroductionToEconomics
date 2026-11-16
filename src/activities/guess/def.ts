// Guess: a numeric guess with one or more hidden versions ("arms").
// With a single arm it is a plain numeric poll.
//
// Session file fields:
//   stageText       question shown on the stage while collecting (neutral, no anchor)
//   stageHint       optional second line (default: "Answer on your phone. Keep ...")
//   part1           optional yes/no style first question; "{anchor}" is replaced per arm
//   part1Options    two button labels for part 1 (default: More, Less)
//   part2           the guess prompt; "___" marks where the input field goes
//   arms            list of { label, anchor }; default: one arm
//   min, max        allowed range; exclusiveMin: true means "greater than min"
//   axis            { min, max } of the log-scale dot plot (default 1 to 10000)
//   revealHeadline  headline for the "versions" reveal
//   truth           optional { value, label }

import { S } from '../../strings';
import type { Activity, ActivityDef, EnterContext, FramePatch, Resp } from '../../core/types';
import { armOf } from '../../core/identity';
import { median } from '../../core/stats';

export interface GuessArmSummary {
  label: string;
  n: number;
  median: number | null;
  values: number[];
}

/** Split the answers by arm. The arm is recomputed from the pid, never taken from the phone. */
export function summariseGuess(a: Activity, responses: Resp[]): GuessArmSummary[] {
  const arms: GuessArmSummary[] = a.arms.map((arm: any) => ({ label: arm.label, n: 0, median: null, values: [] }));
  for (const r of responses) arms[armOf(r.pid, a.id, arms.length)].values.push(r.v);
  for (const arm of arms) {
    arm.n = arm.values.length;
    arm.median = median(arm.values);
  }
  return arms;
}

export function part1Text(a: Record<string, any>, anchor: unknown): string {
  return String(a.part1 ?? '').replace('{anchor}', String(anchor ?? ''));
}

export const guessDef: ActivityDef = {
  type: 'guess',

  validate(a, v) {
    v.only(a, ['type', 'id', 'stageText', 'stageHint', 'part1', 'part1Options', 'part2', 'arms',
      'min', 'max', 'exclusiveMin', 'axis', 'revealHeadline', 'truth']);
    v.text(a, 'stageText', { required: true });
    v.text(a, 'stageHint');
    v.text(a, 'part1');
    v.text(a, 'part2', { required: true });
    v.text(a, 'revealHeadline');
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
      ax.number(a.axis, 'min', { required: true, min: 1e-9 });
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

  itemCount: () => 0,

  phases(a) {
    return ['open', 'closed', ...(a.arms.length > 1 ? ['versions'] : []), 'results', ...(a.truth ? ['truth'] : [])];
  },
  defaultPhases(a) {
    return this.phases(a);
  },

  // "reveal (1 of 3)" rather than "reveal versions": the hint is on the projector.
  phaseLabel(a, phase) {
    if (phase === 'open') return S.phase.open;
    if (phase === 'closed') return S.phase.closed;
    const reveals = this.phases(a).filter((p) => p !== 'open' && p !== 'closed');
    return S.phase.revealStep(reveals.indexOf(phase) + 1, reveals.length);
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
        },
        open: { key: a.id, type: 'guess', durationMs: null, min: a.min, max: a.max, xmin: a.exclusiveMin, p1: !!a.part1 },
      };
    }
    if (frame.phase === 'closed') return { view: base };

    // versions / results / truth: phones learn which version they had.
    const view = { ...base, part1: a.part1 ?? null, arms: armsPublic };
    if (frame.phase === 'versions') return { view };
    const arms = summariseGuess(a, live.responses(a.id));
    return {
      view,
      results: {
        id: a.id,
        board: false,
        data: { type: 'guess', arms: arms.map(({ label, n, median }) => ({ label, n, median })) },
      },
    };
  },
};

export function shorten(text: string, max = 48): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…';
}
