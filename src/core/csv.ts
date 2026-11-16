// CSV export (brief, section 4.5). Plain UTF-8 without a byte-order mark, comma
// separated, so that Stata (import delimited), R (read.csv) and pandas read it as is.

import type { Participant, Resp, Session } from './types';
import { armOf } from './identity';
import { nickname } from './nicknames';

type Cell = string | number | null;

export function toCsv(header: string[], rows: Cell[][]): string {
  const cell = (x: Cell) => {
    if (x === null) return '';
    const s = String(x);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const iso = (ms: number) => new Date(ms).toISOString();

export interface ExportInput {
  code: string;
  session: Session;
  participants: Participant[];
  responses: Resp[];
  timing(key: string): { openedAt: number; durationMs: number | null } | null;
  includeFake: boolean;
}

/** One row per answer. */
export function responsesCsv(x: ExportInput): string {
  const header = ['room', 'step', 'activity', 'item', 'participant_id', 'arm', 'answer', 'answer_label',
    'part1', 'correct', 'response_ms', 'server_time', 'simulated'];
  // Which step and activity does a response key belong to?
  const byKey = new Map<string, { step: number; id: string; item: number | null }>();
  for (const f of x.session.frames) {
    const key = f.collect ?? f.key;
    if (!byKey.has(key)) byKey.set(key, { step: f.step + 1, id: f.collect ?? f.id, item: f.collect ? null : f.item });
  }
  const rows: Cell[][] = [];
  for (const r of [...x.responses].sort((a, b) => a.at - b.at)) {
    if (r.fake && !x.includeFake) continue;
    const where = byKey.get(r.key);
    const a = where ? x.session.activities[where.id] : undefined;
    const timing = x.timing(r.key);
    let arm: Cell = null, label: Cell = null, part1: Cell = null, correct: Cell = null;
    if (a?.type === 'guess') {
      if (a.arms.length > 1) arm = a.arms[armOf(r.pid, a.id, a.arms.length)].label;
      if (r.p1 !== undefined && a.part1Options) part1 = a.part1Options[r.p1] ?? null;
    } else if (a?.type === 'choice' && where && where.item !== null) {
      const item = a.items[where.item];
      label = (item.options ?? a.options)[r.v] ?? null;
      if (item.correct !== null) correct = r.v === item.correct ? 1 : 0;
    }
    rows.push([
      x.code,
      where?.step ?? null,
      where?.id ?? r.key,
      where && where.item !== null ? where.item + 1 : null,
      r.pid,
      arm,
      a?.type === 'choice' ? r.v + 1 : r.v, // options are numbered from 1
      label,
      part1,
      correct,
      timing ? Math.max(0, Math.round(r.at - timing.openedAt)) : null,
      iso(r.at),
      r.fake ? 1 : 0,
    ]);
  }
  return toCsv(header, rows);
}

/** One row per participant, with one arm column per multi-version guess. */
export function participantsCsv(x: ExportInput): string {
  const split = Object.values(x.session.activities).filter((a) => a.type === 'guess' && a.arms.length > 1);
  const header = ['room', 'participant_id', 'nickname', ...split.map((a) => `arm_${a.id.replace(/-/g, '_')}`),
    'joined_at', 'simulated'];
  const rows: Cell[][] = [];
  for (const p of [...x.participants].sort((a, b) => a.joinedAt - b.joinedAt)) {
    if (p.fake && !x.includeFake) continue;
    rows.push([
      x.code,
      p.pid,
      nickname(p.adj, p.eco),
      ...split.map((a) => a.arms[armOf(p.pid, a.id, a.arms.length)].label),
      iso(p.joinedAt),
      p.fake ? 1 : 0,
    ]);
  }
  return toCsv(header, rows);
}
