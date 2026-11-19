import { S } from '../../strings';
import { h, rich } from '../../ui/dom';
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

/** Picture: one figure as large as the screen allows, or several with captions, a title and a text. */
export const pictureStage: StageViewFn = (env) => {
  const a = env.activity;
  const ok = (src: unknown): src is string => typeof src === 'string' && src.startsWith('data:image/');
  if (a.images || a.title || a.text) {
    const figures: { file: string; caption?: string }[] = a.images ?? [{ file: a.image }];
    return h('div', { class: 'view gallery-view' },
      a.title ? h('h1', { class: 'headline' }, a.title) : null,
      h('div', { class: 'gallery' }, figures.map((f) => {
        const src = env.session.images[f.file];
        return h('figure', null, ok(src) ? h('img', { src, alt: f.caption ?? '' }) : null,
          f.caption ? h('figcaption', null, rich(f.caption)) : null);
      })),
      a.text ? h('div', { class: 'answer-card compact' }, h('p', { class: 'answer-text' }, rich(a.text))) : null,
      a.credit ? h('p', { class: 'credit muted' }, a.credit) : null);
  }
  const src = env.session.images[env.activity.image];
  return h('div', { class: 'view picture-view' },
    src && src.startsWith('data:image/') ? h('img', { src, alt: env.activity.label ?? '' }) : null);
};

/** Intro: the course on the left, the tutor on a card on the right. */
export const introStage: StageViewFn = (env) => {
  const a = env.activity;
  const p = a.person;
  const initials = p ? String(p.name).split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() : '';
  return h('div', { class: 'view intro-view' },
    h('div', { class: 'intro-main' },
      a.kicker ? h('p', { class: 'section-part' }, a.kicker) : null,
      h('h1', { class: 'section-title' }, a.title),
      a.subtitle ? h('p', { class: 'section-subtitle' }, a.subtitle) : null,
      a.bullets ? h('ul', { class: 'intro-bullets' }, (a.bullets as string[]).map((b) => h('li', null, rich(b)))) : null),
    p ? h('div', { class: 'intro-side' }, h('div', { class: 'person-card' },
      h('div', { class: 'avatar', 'aria-hidden': 'true' }, initials),
      h('p', { class: 'person-name' }, p.name),
      p.role ? h('p', { class: 'person-role' }, p.role) : null,
      p.bullets ? h('ul', { class: 'person-bullets' }, (p.bullets as string[]).map((b) => h('li', null, rich(b)))) : null,
      p.contact ? h('p', { class: 'person-contact' }, p.contact) : null)) : null);
};

export const endStage: StageViewFn = (env) =>
  h('div', { class: 'view centered end-view' }, h('h1', { class: 'section-title' }, env.activity.text ?? S.thanks));
