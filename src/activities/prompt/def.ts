// Prompt: a text on stage and phones, with an optional countdown and an optional
// hidden second text that the tutor reveals (a model answer, the real study).
//
// Session file fields:
//   text       the prompt
//   timer      seconds; leave out for no countdown
//   autostart  start the countdown as soon as the prompt appears (default true)
//   reveal     hidden text, shown in a second phase
//   label      optional short name for the host's step list
//   mode       how students work on it, shown as a label on stage and phones:
//              pair, group, discuss, paper or think
//   revealTitle  heading of the hidden text (default "Answer")

import { S } from '../../strings';
import type { ActivityDef, EnterContext, FramePatch } from '../../core/types';
import { shorten } from '../guess/def';

export const promptDef: ActivityDef = {
  type: 'prompt',

  validate(a, v) {
    v.only(a, ['type', 'id', 'text', 'timer', 'autostart', 'reveal', 'label', 'mode', 'revealTitle']);
    if (a.mode !== undefined && !(a.mode in S.mode)) v.at('mode').err(`must be one of: ${Object.keys(S.mode).join(', ')}`);
    v.text(a, 'revealTitle', { max: 60 });
    v.text(a, 'text', { required: true, max: 700 });
    v.text(a, 'reveal', { max: 900 });
    v.text(a, 'label', { max: 60 });
    v.number(a, 'timer', { min: 5, max: 3600 });
    v.bool(a, 'autostart');
    a.autostart ??= true;
  },

  itemCount: () => 0,
  phases: (a) => ['show', ...(a.reveal ? ['reveal'] : [])],
  defaultPhases(a) {
    return this.phases(a);
  },
  phaseLabel: (_a, phase) => (phase === 'reveal' ? S.phase.reveal : S.phase.show),
  stepLabel: (a) => `${S.step.prompt}: ${a.label ?? shorten(a.text, 44)}`,

  enter({ activity: a, frame }: EnterContext): FramePatch {
    if (frame.phase === 'reveal') {
      return { view: { type: 'prompt', key: a.id, phase: 'reveal', text: a.text, reveal: a.reveal,
        mode: a.mode ?? null, revealTitle: a.revealTitle ?? null } };
    }
    return {
      view: { type: 'prompt', key: a.id, phase: 'show', text: a.text, mode: a.mode ?? null },
      timer: a.timer ? { durationMs: a.timer * 1000, autostart: a.autostart } : undefined,
    };
  },
};
