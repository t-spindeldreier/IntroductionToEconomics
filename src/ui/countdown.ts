import { h } from './dom';
import { formatSeconds } from '../core/timer';

/**
 * A countdown that updates itself. `msLeft` is asked a few times per second (it
 * derives the time from the server's closing time, not from a local timer, so a
 * sleeping phone shows the right value when it wakes). `onZero` fires once.
 */
export function countdown(msLeft: () => number | null, opts: { class?: string; onZero?: () => void } = {}): HTMLElement {
  const el = h('div', { class: `countdown ${opts.class ?? ''}`, role: 'timer' });
  let fired = false;
  let attached = false;
  const tick = () => {
    if (el.isConnected) attached = true;
    else if (attached) return clearInterval(id); // removed from the page: stop
    const ms = msLeft();
    if (ms === null) return void (el.textContent = '');
    el.textContent = formatSeconds(ms);
    el.classList.toggle('low', ms <= 5000);
    el.classList.toggle('zero', ms <= 0);
    if (ms <= 0 && !fired) {
      fired = true;
      opts.onZero?.();
    }
  };
  const id = setInterval(tick, 200);
  tick();
  return el;
}
