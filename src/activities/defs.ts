// Registry of activity types (the part without any screen code).
// To add a type: write <type>/def.ts, <type>/phone.ts and <type>/stage.ts, then add
// one line here, one in phoneViews.ts and one in stageViews.ts. The engine itself
// (session compiler, stage controller, phone client, rules) does not change, unless
// the new type needs a new kind of answer.

import type { ActivityDef, PhoneView } from '../core/types';
import { guessDef } from './guess/def';
import { choiceDef } from './choice/def';
import { promptDef } from './prompt/def';
import { lobbyDef, podiumDef, endDef, introDef, pictureDef, sectionDef } from './simple/def';
import { tableDef } from './table/def';
import { chartDef } from './chart/def';
import { lotteryDef } from './lottery/def';
import { restaurantDef } from './restaurant/def';

export const defs: Record<string, ActivityDef> = {
  lobby: lobbyDef,
  guess: guessDef,
  choice: choiceDef,
  prompt: promptDef,
  table: tableDef,
  picture: pictureDef,
  intro: introDef,
  chart: chartDef,
  lottery: lotteryDef,
  restaurant: restaurantDef,
  podium: podiumDef,
  section: sectionDef,
  end: endDef,
};

/** Views on which a phone shows points or a rank and therefore reads the leaderboard document. */
export function needsBoard(view: PhoneView): boolean {
  if (view.type === 'podium' || view.type === 'end') return true;
  return view.type === 'choice' && view.scored === true && (view.phase === 'reveal' || view.phase === 'leaderboard');
}

/** Types that may be used in steps without being declared under "activities". */
export const BUILT_IN = ['lobby', 'podium', 'end'];
