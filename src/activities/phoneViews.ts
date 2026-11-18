// Registry of phone views, one per activity type. Part of the small phone bundle.

import type { PhoneViewFn } from '../phone/env';
import { guessPhone } from './guess/phone';
import { choicePhone } from './choice/phone';
import { promptPhone } from './prompt/phone';
import { tablePhone } from './table/phone';
import { lotteryPhone } from './lottery/phone';
import { endPhone, lobbyPhone, picturePhone, podiumPhone, sectionPhone } from './simple/phone';

export const phoneViews: Record<string, PhoneViewFn> = {
  lobby: lobbyPhone,
  guess: guessPhone,
  choice: choicePhone,
  prompt: promptPhone,
  table: tablePhone,
  picture: picturePhone,
  lottery: lotteryPhone,
  podium: podiumPhone,
  section: sectionPhone,
  end: endPhone,
};
