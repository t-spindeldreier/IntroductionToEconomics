import { h } from '../../ui/dom';
import { waiting, type PhoneViewFn } from '../../phone/env';

export const tablePhone: PhoneViewFn = (view) => waiting(h('p', { class: 'muted' }, String(view.title)));
