// Table: a comparison table on the projector, for a summary ("which design is which?").
// Phones only show the title; the table itself is in the study slides.
//
// Session file fields:
//   title      heading above the table
//   columns    2 to 5 column headings
//   rows       2 to 8 rows, each a list with one text per column; the first is the row's name
//   stepwise   true = one key press per row (default: the whole table at once)
//   note       optional sentence below the complete table

import { S } from '../../strings';
import type { ActivityDef } from '../../core/types';
import { shorten } from '../guess/def';

const texts = (x: unknown, min: number, max: number, length: number): x is string[] =>
  Array.isArray(x) && x.length >= min && x.length <= max && x.every((t) => typeof t === 'string' && t.length <= length);

export const tableDef: ActivityDef = {
  type: 'table',

  validate(a, v) {
    v.only(a, ['type', 'id', 'title', 'columns', 'rows', 'stepwise', 'note']);
    v.text(a, 'title', { required: true, max: 120 });
    v.text(a, 'note', { max: 300 });
    v.bool(a, 'stepwise');
    a.stepwise ??= false;
    if (!texts(a.columns, 2, 5, 60)) {
      v.at('columns').err('must be a list of 2 to 5 short texts');
      a.columns = ['', ''];
    }
    if (!Array.isArray(a.rows) || a.rows.length < 2 || a.rows.length > 8) {
      v.at('rows').err('must be a list of 2 to 8 rows');
      a.rows = [];
    }
    a.rows.forEach((row: unknown, i: number) => {
      if (!texts(row, a.columns.length, a.columns.length, 160)) {
        v.at(`rows[${i + 1}]`).err(`must be a list of ${a.columns.length} texts, one per column`);
      }
    });
  },

  itemCount: () => 0,
  phases: (a) => (a.stepwise ? a.rows.map((_: unknown, i: number) => `row${i + 1}`) : ['show']),
  defaultPhases(a) {
    return this.phases(a);
  },
  phaseLabel: (_a, phase) => (phase === 'show' || phase === 'row1' ? S.phase.show : S.phase.nextRow),
  stepLabel: (a) => `${S.step.table}: ${shorten(a.title, 44)}`,

  // Phones get the title only.
  enter: ({ activity: a }) => ({ view: { type: 'table', title: a.title } }),
};
