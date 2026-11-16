// Registry of stage views, one per activity type. Loaded only on the stage.

import type { StageViewFn } from '../stage/env';
import { guessStage } from './guess/stage';
import { choiceStage } from './choice/stage';
import { promptStage } from './prompt/stage';
import { endStage, lobbyStage, podiumStage } from './simple/stage';

export const stageViews: Record<string, StageViewFn> = {
  lobby: lobbyStage,
  guess: guessStage,
  choice: choiceStage,
  prompt: promptStage,
  podium: podiumStage,
  end: endStage,
};
