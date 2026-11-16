// The three built-in single-screen activities: lobby, podium and end.
// A session may use them in "steps" without declaring them under "activities".

import { S } from '../../strings';
import type { ActivityDef, EnterContext, FramePatch } from '../../core/types';
import { boardResults } from '../choice/def';
import { defs } from '../defs';

/** Lobby: QR code, URL, room code, joined count. Can collect answers for another activity meanwhile. */
export const lobbyDef: ActivityDef = {
  type: 'lobby',
  validate: (a, v) => v.only(a, ['type', 'id']),
  itemCount: () => 0,
  phases: () => ['show'],
  defaultPhases: () => ['show'],
  phaseLabel: () => S.phase.lobby,
  stepLabel: () => S.step.lobby,
  enter(ctx: EnterContext): FramePatch {
    const collect = ctx.frame.collect;
    if (!collect) return { view: { type: 'lobby' } };
    // Students who join go straight to the collected activity: reuse its "open" frame.
    const activity = ctx.session.activities[collect];
    return defs[activity.type].enter({
      ...ctx,
      activity,
      frame: { ...ctx.frame, type: activity.type, id: collect, key: collect, phase: 'open' },
    });
  },
};

/** Section: a title slide that starts a new part of the session. Written as { section: "Title" } in steps. */
export const sectionDef: ActivityDef = {
  type: 'section',
  validate: () => {},
  itemCount: () => 0,
  phases: () => ['show'],
  defaultPhases: () => ['show'],
  phaseLabel: () => S.phase.section,
  stepLabel: (a) => `${S.step.section} ${a.number}: ${a.title}`,
  enter: ({ session, activity }) => ({
    view: { type: 'section', title: activity.title, number: activity.number, of: session.sections.length },
  }),
};

/** Podium: top 3 on stage, own final rank on the phone. */
export const podiumDef: ActivityDef = {
  type: 'podium',
  validate: (a, v) => v.only(a, ['type', 'id']),
  itemCount: () => 0,
  phases: () => ['show'],
  defaultPhases: () => ['show'],
  phaseLabel: () => S.phase.podium,
  stepLabel: () => S.step.podium,
  enter: ({ session, frame, live }) => ({
    view: { type: 'podium' },
    results: boardResults(session, frame.index, live),
  }),
};

/** End: thank-you screen; phones show the final rank. */
export const endDef: ActivityDef = {
  type: 'end',
  validate(a, v) {
    v.only(a, ['type', 'id', 'text']);
    v.text(a, 'text', { max: 200 });
  },
  itemCount: () => 0,
  phases: () => ['show'],
  defaultPhases: () => ['show'],
  phaseLabel: () => S.phase.end,
  stepLabel: () => S.step.end,
  enter: ({ session, activity, frame, live }) => ({
    view: { type: 'end', text: activity.text ?? S.thanks },
    results: boardResults(session, frame.index, live),
  }),
};
