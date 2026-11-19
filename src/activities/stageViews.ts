// Registry of stage views, one per activity type. Loaded only on the stage.

import type { StageViewFn } from '../stage/env';
import { guessStage } from './guess/stage';
import { choiceStage } from './choice/stage';
import { promptStage } from './prompt/stage';
import { tableStage } from './table/stage';
import { chartStage } from './chart/stage';
import { lotteryStage } from './lottery/stage';
import { restaurantStage } from './restaurant/stage';
import { endStage, lobbyStage, pictureStage, podiumStage, sectionStage } from './simple/stage';

export const stageViews: Record<string, StageViewFn> = {
  lobby: lobbyStage,
  guess: guessStage,
  choice: choiceStage,
  prompt: promptStage,
  table: tableStage,
  picture: pictureStage,
  chart: chartStage,
  lottery: lotteryStage,
  restaurant: restaurantStage,
  podium: podiumStage,
  section: sectionStage,
  end: endStage,
};
