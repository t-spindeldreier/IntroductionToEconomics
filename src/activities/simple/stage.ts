import { S } from '../../strings';
import { h } from '../../ui/dom';
import { nickname } from '../../core/nicknames';
import { joinBlock, type StageViewFn } from '../../stage/env';
import { modePill } from '../../ui/pill';
import { standingsUpTo } from '../choice/def';
import { guessCollecting } from '../guess/stage';

/**
 * Lobby: a join panel (QR code, address, room code, joined count) and, if a guess
 * is collected meanwhile, its neutral question next to it.
 */
export const lobbyStage: StageViewFn = (env) => {
  const collect = env.frame.collect ? env.session.activities[env.frame.collect] : null;
  const joined = env.ctl.participants.size;
  return h('div', { class: 'view lobby' },
    h('div', { class: 'lobby-panel' },
      h('p', { class: 'lobby-title' }, env.session.title),
      h('h1', { class: 'lobby-heading' }, S.joinHeading),
      joinBlock(env),
      h('p', { class: 'lobby-count' }, h('span', { class: 'count-number' }, joined), ' ', S.joinedShort)),
    h('div', { class: 'lobby-main' },
      collect
        ? [modePill('phone'), guessCollecting(collect, env)]
        : [h('h1', { class: 'stage-question' }, S.joinSteps[0]), h('p', { class: 'hint' }, S.joinSteps[1])]));
};

/** Section: the title slide of a new part, with the outline of the whole session. */
export const sectionStage: StageViewFn = (env) => {
  const current = env.frame.section;
  const a = env.activity;
  return h('div', { class: 'view section-view' },
    h('div', { class: 'section-main' },
      h('p', { class: 'section-part' }, S.part(a.number, env.session.sections.length)),
      h('h1', { class: 'section-title' }, a.title),
      a.subtitle ? h('p', { class: 'section-subtitle' }, a.subtitle) : null),
    h('ol', { class: 'outline' }, env.session.sections.map((s, i) =>
      h('li', { class: i < current ? 'done' : i === current ? 'now' : '' },
        h('span', { class: 'outline-mark' }, i < current ? '✓' : i + 1), s.title))));
};

/** Podium: second, first and third place, in that order, like a real podium. */
export const podiumStage: StageViewFn = (env) => {
  const top = standingsUpTo(env.session, env.frame.index, env.ctl.live).slice(0, 3);
  if (top.length === 0) return h('div', { class: 'view centered' }, h('h1', { class: 'headline' }, S.noScores));
  const place = (rank: number) => {
    const s = top[rank - 1];
    if (!s) return h('div', { class: 'place empty' });
    const p = env.ctl.participants.get(s.pid);
    return h('div', { class: `place place-${rank}` },
      h('p', { class: 'place-name' }, p ? nickname(p.adj, p.eco) : '…'),
      h('p', { class: 'place-points' }, s.points.toLocaleString('en-US')),
      h('div', { class: 'place-block' }, rank));
  };
  return h('div', { class: 'view' }, h('h1', { class: 'headline' }, S.podium),
    h('div', { class: 'podium' }, place(2), place(1), place(3)));
};

export const endStage: StageViewFn = (env) =>
  h('div', { class: 'view centered end-view' }, h('h1', { class: 'section-title' }, env.activity.text ?? S.thanks));
