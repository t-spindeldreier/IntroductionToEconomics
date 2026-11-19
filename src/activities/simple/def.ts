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

/**
 * Picture: figures on the projector; phones show nothing of them.
 *   image    one file name: the figure fills the screen (an opening slide, a cartoon)
 *   images   or a list of { file, caption }: shown side by side, each with its caption
 *   title    heading
 *   text     one or two sentences under the figures
 *   credit   where the figures come from (photographers, licences)
 * A picture with a title is also part of the study slides.
 */
export const pictureDef: ActivityDef = {
  type: 'picture',
  validate(a, v) {
    v.only(a, ['type', 'id', 'image', 'images', 'title', 'text', 'credit', 'label']);
    v.text(a, 'image', { max: 120 });
    v.text(a, 'title', { max: 120 });
    v.text(a, 'text', { max: 500 });
    v.text(a, 'credit', { max: 300 });
    v.text(a, 'label', { max: 60 });
    if (a.images !== undefined) {
      if (!Array.isArray(a.images) || a.images.length < 1 || a.images.length > 4) v.at('images').err('must be a list of 1 to 4 figures');
      else a.images.forEach((im: any, i: number) => {
        const iv = v.at(`images[${i + 1}]`);
        if (typeof im !== 'object' || im === null) return iv.err('must have a "file"');
        iv.only(im, ['file', 'caption']);
        iv.text(im, 'file', { required: true, max: 120 });
        iv.text(im, 'caption', { max: 200 });
      });
    }
    if (!a.image === !a.images) v.err('needs either "image" or "images"');
  },
  itemCount: () => 0,
  phases: () => ['show'],
  defaultPhases: () => ['show'],
  phaseLabel: () => S.phase.show,
  stepLabel: (a) => `${S.step.picture}: ${a.label ?? a.title ?? a.image}`,
  enter: () => ({ view: { type: 'picture' } }),
};

/**
 * Intro: what this course is and who is standing in front, before anything starts.
 *   kicker, title, subtitle   the course
 *   bullets                   a few short points about the sessions
 *   person                    { name, role, bullets, contact }: shown on a card
 */
export const introDef: ActivityDef = {
  type: 'intro',
  validate(a, v) {
    v.only(a, ['type', 'id', 'kicker', 'title', 'subtitle', 'bullets', 'person']);
    v.text(a, 'kicker', { max: 80 });
    v.text(a, 'title', { required: true, max: 80 });
    v.text(a, 'subtitle', { max: 120 });
    const list = (x: unknown) => Array.isArray(x) && x.length <= 6 && x.every((t) => typeof t === 'string' && t.length <= 140);
    if (a.bullets !== undefined && !list(a.bullets)) v.at('bullets').err('must be a list of up to 6 short texts');
    if (a.person !== undefined) {
      const pv = v.at('person');
      if (typeof a.person !== 'object' || a.person === null) pv.err('must have a name');
      else {
        pv.only(a.person, ['name', 'role', 'bullets', 'contact']);
        pv.text(a.person, 'name', { required: true, max: 60 });
        pv.text(a.person, 'role', { max: 80 });
        pv.text(a.person, 'contact', { max: 80 });
        if (a.person.bullets !== undefined && !list(a.person.bullets)) pv.at('bullets').err('must be a list of up to 6 short texts');
      }
    }
  },
  itemCount: () => 0,
  phases: () => ['show'],
  defaultPhases: () => ['show'],
  phaseLabel: () => S.phase.show,
  stepLabel: (a) => `${S.step.intro}: ${a.title}`,
  enter: () => ({ view: { type: 'picture' } }), // phones: just "look at the screen"
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
