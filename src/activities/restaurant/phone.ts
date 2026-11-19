// The restaurant game on the phone: your restaurant, the news, your decision,
// and at the end what your real restaurant did.

import { S } from '../../strings';
import { h } from '../../ui/dom';
import { answerStatus, waiting, type PhoneViewFn } from '../../phone/env';
import { NEW_MINIMUM, OLD_MINIMUM, STATES, storeAt } from './def';
import { CHAINS, REGIONS } from './stores';

const dollars = (x: number) => `$${x.toFixed(2)}`;

export const restaurantPhone: PhoneViewFn = (view, env) => {
  const key = view.key!;
  // The stage deals out the restaurants. A phone that joined a moment ago is on the next list.
  const code = (view.stores as Record<string, number> | undefined)?.[env.me.pid];
  if (code === undefined) return waiting(h('p', { class: 'muted' }, S.restaurantSoon));
  const { state, store } = storeAt(code);
  const [chain, region, before, after, wage] = store;
  const answer = env.client.answers[key];
  const inNJ = state === 0;

  const badge = h('div', { class: `store-card state-${state}` },
    h('p', { class: 'store-role' }, S.youManage),
    h('h1', { class: 'store-name' }, CHAINS[chain]),
    h('p', { class: 'store-place' }, `${S.inPlace} ${REGIONS[region]}`),
    h('div', { class: 'store-facts' },
      h('div', null, h('strong', null, String(before)), h('span', null, S.employeesNow)),
      h('div', null, h('strong', null, dollars(wage)), h('span', null, S.startingWage))));

  if (view.phase === 'assign') return h('div', { class: 'card' }, badge, h('p', { class: 'muted' }, S.february1992));

  // What the news means for this restaurant.
  const raise = Math.round((100 * (NEW_MINIMUM - wage)) / wage);
  const news = h('div', { class: `news-box ${inNJ ? 'hit' : ''}` },
    h('p', { class: 'answer-label' }, S.newsFlash),
    h('p', { class: 'news-headline' }, String(view.news ?? '')),
    h('p', null, !inNJ ? S.newsPA(dollars(OLD_MINIMUM))
      : raise > 0 ? S.newsNJ(dollars(wage), dollars(NEW_MINIMUM), raise) : S.newsNJAbove(dollars(wage))),
    inNJ && raise > 0 ? h('p', { class: 'news-think' }, S.newsThink) : null);

  if (view.phase === 'news') return h('div', { class: 'card' }, badge, news);

  if (view.phase === 'open' && !answer) {
    const input = h('input', { class: 'guess-input', type: 'text', inputMode: 'numeric', autocomplete: 'off', enterKeyHint: 'send',
      'aria-label': S.employeesNovember, value: (env.draft[key] ??= {}).text ?? '' }) as HTMLInputElement;
    const error = h('p', { class: 'error', role: 'alert' });
    const send = h('button', { class: 'btn primary', type: 'submit' }, S.decide) as HTMLButtonElement;
    input.addEventListener('input', () => { env.draft[key].text = input.value; error.textContent = ''; });
    const submit = (e: Event) => {
      e.preventDefault();
      const x = /^\d{1,3}$/.test(input.value.trim()) ? Number(input.value.trim()) : NaN;
      if (!(x >= 0 && x <= 200)) {
        error.textContent = S.employeesInvalid;
        return;
      }
      send.disabled = true;
      void env.client.submit(key, x);
    };
    return h('form', { class: 'card', onsubmit: submit, novalidate: true },
      news,
      h('p', { class: 'muted' }, `${CHAINS[chain]}, ${STATES[state]} · ${S.nowYouHave(before)}`),
      h('label', { class: 'question' }, S.inNovember, input, S.employeesWord),
      error, send);
  }

  // After the decision: what you said, and once it is on the projector, what really happened.
  const showReal = view.phase === 'real' || view.phase === 'best';
  return h('div', { class: 'card center' },
    answer && view.phase === 'open' ? answerStatus(answer) : null,
    h('p', { class: 'muted' }, `${CHAINS[chain]}, ${STATES[state]}`),
    answer ? h('p', { class: 'big-value' }, `${before} → ${answer.v}`) : h('p', { class: 'muted' }, S.noDecision),
    answer ? h('p', { class: 'muted' }, S.yourPlan) : null,
    showReal ? h('div', { class: 'news-box' },
      h('p', { class: 'answer-label' }, S.yourRealStore),
      h('p', { class: 'news-headline' }, `${before} → ${after}`),
      answer ? h('p', null, answer.v === after ? S.spotOn : S.offBy(Math.abs(answer.v - after))) : null) : null,
    h('p', { class: 'muted' }, S.lookAtScreen));
};
