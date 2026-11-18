// Chart: a bar chart on the projector, drawn from numbers in the session file
// (for example the results of a published study). Phones only show the title.
//
// Session file fields:
//   title        heading above the chart
//   labels       one text per bar ("1966", "Jan")
//   values       one number per bar; may be negative
//   prefix, suffix  written with every value ("$", "%")
//   marker       { after: label, text }: a dashed line after that bar
//   highlight    labels of the bars whose value is written out (default: all, up to 12 bars)
//   revealFrom   label of the first bar that stays hidden at first. Gives two phases:
//                "part" (bars before it) and "all". Ask for a prediction in between.
//   partTitle    heading during the phase "part" (default: title)
//   takeaway     one or two sentences shown with the complete chart
//   source       where the numbers come from

import { S } from '../../strings';
import type { ActivityDef } from '../../core/types';
import { shorten } from '../guess/def';

export const chartDef: ActivityDef = {
  type: 'chart',

  validate(a, v) {
    v.only(a, ['type', 'id', 'title', 'labels', 'values', 'prefix', 'suffix', 'marker', 'highlight', 'revealFrom', 'partTitle', 'takeaway', 'source']);
    v.text(a, 'title', { required: true, max: 140 });
    v.text(a, 'partTitle', { max: 140 });
    v.text(a, 'prefix', { max: 4 });
    v.text(a, 'suffix', { max: 12 });
    v.text(a, 'takeaway', { max: 500 });
    v.text(a, 'source', { max: 200 });
    const labels = Array.isArray(a.labels) && a.labels.length >= 2 && a.labels.length <= 40 ? a.labels.map(String) : null;
    if (!labels) v.at('labels').err('must be a list of 2 to 40 texts');
    a.labels = labels ?? ['', ''];
    if (!Array.isArray(a.values) || a.values.length !== a.labels.length || a.values.some((x: unknown) => typeof x !== 'number' || !Number.isFinite(x))) {
      v.at('values').err('must be a list of numbers, one per label');
      a.values = a.labels.map(() => 0);
    }
    if (a.highlight !== undefined) {
      a.highlight = Array.isArray(a.highlight) ? a.highlight.map(String) : [];
      for (const l of a.highlight) if (!a.labels.includes(l)) v.at('highlight').err(`"${l}" is not one of the labels`);
    }
    if (a.revealFrom !== undefined) {
      a.revealFrom = String(a.revealFrom);
      if (a.labels.indexOf(a.revealFrom) < 1) v.at('revealFrom').err('must be one of the labels, and not the first');
    }
    if (a.marker !== undefined) {
      const mv = v.at('marker');
      if (typeof a.marker !== 'object' || a.marker === null) mv.err('must have "after" and "text"');
      else {
        mv.only(a.marker, ['after', 'text']);
        a.marker.after = String(a.marker.after);
        if (!a.labels.includes(a.marker.after)) mv.at('after').err('must be one of the labels');
        mv.text(a.marker, 'text', { required: true, max: 40 });
      }
    }
  },

  itemCount: () => 0,
  phases: (a) => (a.revealFrom ? ['part', 'all'] : ['all']),
  defaultPhases(a) {
    return this.phases(a);
  },
  phaseLabel: (a, phase) => (phase === 'all' && a.revealFrom ? S.phase.reveal : S.phase.show),
  stepLabel: (a) => `${S.step.chart}: ${shorten(a.title, 44)}`,

  // Phones get a title only (shown like a table's); in the first phase the neutral one.
  enter: ({ activity: a, frame }) => ({ view: { type: 'table', title: frame.phase === 'part' ? a.partTitle ?? a.title : a.title } }),
};
