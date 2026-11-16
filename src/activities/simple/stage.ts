import { S } from '../../strings';
import { h } from '../../ui/dom';
import { nickname } from '../../core/nicknames';
import { joinBlock, type StageViewFn } from '../../stage/env';
import { standingsUpTo } from '../choice/def';
import { guessCollecting } from '../guess/stage';

/** Lobby: QR code, URL, room code, joined count; plus the neutral question if a guess is collected. */
export const lobbyStage: StageViewFn = (env) => {
  const collect = env.frame.collect ? env.session.activities[env.frame.collect] : null;
  const joined = env.ctl.participants.size;
  return h('div', { class: `view lobby ${collect ? 'with-question' : ''}` },
    h('div', { class: 'lobby-join' }, joinBlock(env),
      h('p', { class: 'count' }, h('span', { class: 'count-number' }, joined), ' ', S.joinedShort)),
    collect ? guessCollecting(collect, env) : null);
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
  h('div', { class: 'view centered' }, h('h1', { class: 'stage-question' }, env.activity.text ?? S.thanks));
