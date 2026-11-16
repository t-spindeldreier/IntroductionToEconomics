import { S } from '../strings';
import { h } from './dom';

// Small line drawings, so the label works without colour and without emoji fonts.
const ICONS: Record<string, string> = {
  pair: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 19c0-3 2.7-5 6-5s6 2 6 5M14.5 14.2c.5-.1 1-.2 1.5-.2 3.300 0 6 2 6 5',
  group: 'M12 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM5 12a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5Zm14 0a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5ZM6 20c0-3.300 2.700-6 6-6s6 2.700 6 6M1 19c0-2.500 1.800-4.500 4-4.500M23 19c0-2.500-1.800-4.500-4-4.500',
  discuss: 'M4 5h16v10H9l-5 4V5Z',
  paper: 'M4 20l1-4L16 5l3 3L8 19l-4 1ZM14 7l3 3',
  think: 'M12 3a6 6 0 0 0-3.500 10.900V16h7v-2.100A6 6 0 0 0 12 3ZM9.500 19h5M10.500 21.500h3',
  phone: 'M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm3 17h2',
};

function icon(name: string): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('class', 'pill-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name] ?? ICONS.think);
  el.append(path);
  return el;
}

/** The label that says how students work on the current step: "With your neighbour", "On your phone", … */
export function modePill(mode: string | null | undefined): HTMLElement | null {
  if (!mode) return null;
  const label = mode === 'phone' ? S.onYourPhone : S.mode[mode];
  if (!label) return null;
  return h('p', { class: `pill pill-${mode}` }, icon(mode), label);
}
