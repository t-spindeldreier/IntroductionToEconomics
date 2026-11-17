import { h, rich } from '../../ui/dom';
import type { StageViewFn } from '../../stage/env';

/** The table; in stepwise mode the rows appear one by one, the newest one highlighted. */
export const tableStage: StageViewFn = (env) => {
  const a = env.activity;
  const rows: string[][] = a.rows;
  const shown = env.frame.phase === 'show' ? rows.length : Number(env.frame.phase.slice(3));
  return h('div', { class: 'view' },
    h('h1', { class: 'headline' }, a.title),
    h('table', { class: 'compare-table' },
      h('thead', null, h('tr', null, (a.columns as string[]).map((c) => h('th', null, c)))),
      h('tbody', null, rows.map((row, i) =>
        h('tr', { class: i >= shown ? 'hidden-row' : a.stepwise && i === shown - 1 && shown < rows.length ? 'new-row' : '' },
          row.map((cell, k) => h(k === 0 ? 'th' : 'td', null, rich(cell))))))),
    a.note && shown === rows.length ? h('p', { class: 'plot-note muted' }, rich(a.note)) : null);
};
