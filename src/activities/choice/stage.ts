// Choice on the stage: question and options, then bars, the correct option and
// the explanation, then (for scored questions) the top 5.

import { S } from '../../strings';
import { h } from '../../ui/dom';
import { countOptions } from '../../core/stats';
import { nickname } from '../../core/nicknames';
import { msLeft } from '../../core/timer';
import { answerCount, stageCountdown, type StageEnv, type StageViewFn } from '../../stage/env';
import { optionBars } from '../../stage/plots';
import { modePill } from '../../ui/pill';
import { optionsOf, standingsUpTo } from './def';

export function topList(env: StageEnv, n: number): HTMLElement {
  const standings = standingsUpTo(env.session, env.frame.index, env.ctl.live).slice(0, n);
  if (standings.length === 0) return h('p', { class: 'muted' }, S.noScores);
  return h('ol', { class: 'top-list' }, standings.map((s) => {
    const p = env.ctl.participants.get(s.pid);
    return h('li', null,
      h('span', { class: 'top-rank' }, s.rank),
      h('span', { class: 'top-name' }, p ? nickname(p.adj, p.eco) : '…'),
      h('span', { class: 'top-points' }, s.points.toLocaleString('en-US')));
  }));
}

export const choiceStage: StageViewFn = (env) => {
  const a = env.activity;
  const i = env.frame.item ?? 0;
  const item = a.items[i];
  const options = optionsOf(a, i);
  const phase = env.frame.phase;
  const responses = env.ctl.responses(env.frame.key);
  const header = h('p', { class: 'kicker' }, a.question,
    a.items.length > 1 ? h('span', { class: 'muted' }, ` · ${i + 1}/${a.items.length}`) : null);

  if (phase === 'leaderboard') {
    return h('div', { class: 'view' }, h('h1', { class: 'headline' }, S.top5), topList(env, 5));
  }

  if (phase === 'reveal') {
    const counts = countOptions(responses.map((r) => r.v), options.length);
    const correct = item.correct as number | null;
    return h('div', { class: 'view' }, header,
      h('h1', { class: 'stage-question small' }, item.text),
      correct !== null ? h('div', { class: 'answer-card' },
        h('p', { class: 'answer-label' }, S.correctAnswer),
        h('p', { class: 'answer-main' }, a.letters ? `${String.fromCharCode(65 + correct)}. ` : '', options[correct]),
        item.explanation ? h('p', { class: 'answer-text' }, item.explanation) : null) : null,
      optionBars(options, counts, correct, a.letters),
      item.source ? h('p', { class: 'source muted' }, `${S.source}: ${item.source}`) : null);
  }

  // open or closed: never any counts per option, never the correct answer
  const timed = env.room.open?.durationMs != null;
  const over = phase === 'closed' || (timed && msLeft(env.room, env.ctl.now()) === 0);
  return h('div', { class: 'view' },
    timed ? stageCountdown(env) : null,
    modePill('phone'),
    header,
    h('h1', { class: 'stage-question' }, item.text),
    h('ul', { class: `option-grid ${options.length > 4 ? 'two-col' : ''}` }, options.map((o, k) =>
      h('li', null, a.letters ? h('strong', null, `${String.fromCharCode(65 + k)}. `) : null, o))),
    h('div', { class: 'count-line' }, answerCount(responses.length),
      over ? h('p', { class: 'badge' }, S.timeUpStage) : null));
};
