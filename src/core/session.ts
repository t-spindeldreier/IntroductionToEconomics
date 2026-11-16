// Turns a session file (already parsed from YAML or JSON) into a validated Session:
// the activities plus a flat list of frames. One press of the right-arrow key moves
// from one frame to the next. See README, "How to write a session file".

import { Validator, type Activity, type Frame, type Session, type Step } from './types';
import { defs, BUILT_IN } from '../activities/defs';

export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,29}$/;

export type CompileResult = { ok: true; session: Session } | { ok: false; errors: string[] };

export function compileSession(raw: unknown): CompileResult {
  const v = new Validator();
  const fail = (): CompileResult => ({ ok: false, errors: v.errors });

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    v.err('The file must contain "title", "activities" and "steps".');
    return fail();
  }
  const file = structuredClone(raw) as Record<string, any>;
  v.only(file, ['title', 'activities', 'steps']);
  v.text(file, 'title', { required: true, max: 100 });

  // ----- activities -----
  const activities: Record<string, Activity> = {};
  const rawActivities = file.activities ?? {};
  if (typeof rawActivities !== 'object' || Array.isArray(rawActivities)) {
    v.at('activities').err('must be a map from id to activity');
    return fail();
  }
  for (const [id, a] of Object.entries<any>(rawActivities)) {
    const av = v.at(`activities.${id}`);
    if (id.startsWith('section-')) av.err('ids starting with "section-" are reserved');
    if (!ID_PATTERN.test(id)) av.err('the id may only contain lowercase letters, digits and hyphens (at most 30 characters)');
    if (typeof a !== 'object' || a === null) { av.err('must have a type'); continue; }
    const def = defs[a.type];
    if (!def) { av.err(`unknown type "${a.type}" (known: ${Object.keys(defs).join(', ')})`); continue; }
    a.id = id;
    def.validate(a, av);
    activities[id] = a;
  }
  // Built-in activities need no declaration.
  for (const type of BUILT_IN) activities[type] ??= { type, id: type };

  // ----- steps -----
  const frames: Frame[] = [];
  const steps: Step[] = [];
  const sections: Session['sections'] = [];
  if (!Array.isArray(file.steps) || file.steps.length === 0) {
    v.at('steps').err('must be a list with at least one step');
    return fail();
  }
  if (v.errors.length > 0) return fail(); // steps cannot be checked against broken activities

  file.steps.forEach((rawStep: any, n: number) => {
    const sv = v.at(`steps[${n + 1}]`);
    const step = typeof rawStep === 'string' ? { activity: rawStep } : rawStep;
    if (typeof step !== 'object' || step === null) return sv.err('must be an activity id or { activity: id, ... }');

    // { section: "Title" } starts a new part of the session with a title slide.
    if (step.section !== undefined) {
      sv.only(step, ['section', 'subtitle']);
      sv.text(step, 'section', { required: true, max: 80 });
      sv.text(step, 'subtitle', { max: 160 });
      if (typeof step.section !== 'string') return;
      const id = `section-${sections.length + 1}`;
      activities[id] = { type: 'section', id, title: step.section, subtitle: step.subtitle ?? null, number: sections.length + 1 };
      sections.push({ title: step.section, subtitle: step.subtitle ?? null, firstFrame: frames.length });
      steps.push({ index: steps.length, label: defs.section.stepLabel(activities[id], null), firstFrame: frames.length });
      frames.push({ index: frames.length, step: steps.length - 1, type: 'section', id, item: null, phase: 'show', key: id, section: sections.length - 1 });
      return;
    }
    sv.only(step, ['activity', 'phases', 'items', 'collect']);
    const a = activities[step.activity];
    if (!a) return sv.err(`there is no activity "${step.activity}"`);
    const def = defs[a.type];

    // phases
    const allowed = def.phases(a);
    const phases: string[] = step.phases ?? def.defaultPhases(a);
    if (!Array.isArray(phases) || phases.length === 0) return sv.at('phases').err('must be a list of phases');
    for (const p of phases) {
      if (!allowed.includes(p)) return sv.at('phases').err(`"${p}" is not a phase of this activity (allowed: ${allowed.join(', ')})`);
    }

    // collect (lobby only)
    if (step.collect !== undefined) {
      const target = activities[step.collect];
      if (a.type !== 'lobby') return sv.at('collect').err('is only allowed on the lobby step');
      if (!target || target.type !== 'guess') return sv.at('collect').err(`"${step.collect}" must be a guess activity`);
    }

    // items
    const count = def.itemCount(a);
    let items: (number | null)[] = [null];
    if (count > 0) {
      const wanted: number[] = step.items ?? Array.from({ length: count }, (_, i) => i + 1);
      if (!Array.isArray(wanted) || wanted.some((i) => !Number.isInteger(i) || i < 1 || i > count)) {
        return sv.at('items').err(`must be a list of item numbers between 1 and ${count}`);
      }
      items = wanted.map((i) => i - 1);
    } else if (step.items !== undefined) {
      return sv.at('items').err('this activity has no items');
    }

    for (const item of items) {
      steps.push({ index: steps.length, label: def.stepLabel(a, item), firstFrame: frames.length });
      for (const phase of phases) {
        frames.push({
          index: frames.length,
          step: steps.length - 1,
          type: a.type,
          id: a.id,
          item,
          phase,
          key: item === null ? a.id : `${a.id}-${item + 1}`,
          ...(step.collect ? { collect: step.collect } : {}),
          section: sections.length - 1,
        });
      }
    }
  });

  if (frames.length > 400) v.err('The session has more than 400 key presses. Split it.');
  if (v.errors.length > 0) return fail();
  return { ok: true, session: { title: file.title, activities, frames, steps, sections } };
}

/** The hint in the corner of the stage: what the next press of the right arrow does. */
export function nextLabel(session: Session, frameIndex: number): string | null {
  const next = session.frames[frameIndex + 1];
  if (!next) return null;
  const a = session.activities[next.id];
  return defs[a.type].phaseLabel(a, next.phase);
}
