// Lottery: every student enters a birthday (day and month) and the phone shows the
// number that birthday drew in the US draft lottery of 1 December 1969. The birthday
// and the number stay on the phone; only "called up" or "not called" is sent, as an
// ordinary answer to a question with two options.
//
// Session file fields:
//   text       shown on the projector while students look up their number
//   cutoff     numbers up to this one were called up (default 195, as in 1970)
//   takeaway   one or two sentences shown with the result

import { S } from '../../strings';
import type { ActivityDef } from '../../core/types';
import { countOptions } from '../../core/stats';

export const lotteryDef: ActivityDef = {
  type: 'lottery',

  validate(a, v) {
    v.only(a, ['type', 'id', 'text', 'cutoff', 'takeaway']);
    v.text(a, 'text', { required: true, max: 300 });
    v.text(a, 'takeaway', { max: 500 });
    v.number(a, 'cutoff', { min: 1, max: 365 });
    a.cutoff ??= 195;
  },

  itemCount: () => 0,
  phases: () => ['open', 'closed', 'reveal'],
  defaultPhases: () => ['open', 'reveal'],
  phaseLabel: (_a, phase) => ({ open: S.phase.open, closed: S.phase.closed, reveal: S.phase.reveal }[phase] ?? phase),
  stepLabel: () => S.step.lottery,

  enter({ activity: a, frame, live }) {
    const view = { type: 'lottery', key: a.id, phase: frame.phase, cutoff: a.cutoff };
    if (frame.phase === 'open') return { view, open: { key: a.id, type: 'choice', durationMs: null, n: 2 } };
    if (frame.phase === 'closed') return { view };
    return { view: { ...view, counts: countOptions(live.responses(a.id).map((r) => r.v), 2) } };
  },
};
