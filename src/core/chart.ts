// A bar chart as a plain SVG string, so the stage and the study slides draw the
// same picture. One series, one colour; bars can go below zero. With "shown" only
// the first bars are drawn (the axis already has its final range), which lets the
// tutor ask for a prediction before the rest appears.

const BLUE = '#0072b2', INK = '#16181d', GRID = '#d9dbe0', MUTED = '#5a6270';
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export interface BarChart {
  labels: string[];
  values: number[];
  prefix?: string; // "$"
  suffix?: string; // "%"
  /** Dashed vertical line after the bar with this label, with a text. */
  marker?: { after: string; text: string };
  /** Labels of bars that get their value written out (default: all, if 12 bars or fewer). */
  highlight?: string[];
}

/** 1, 2 or 5 times a power of ten, so that about four steps cover the range. */
function niceStep(range: number): number {
  const raw = range / 4, pow = 10 ** Math.floor(Math.log10(raw)), m = raw / pow;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * pow;
}

export function formatValue(c: BarChart, v: number): string {
  const n = Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 });
  return `${v < 0 ? '−' : ''}${c.prefix ?? ''}${n}${c.suffix ?? ''}`;
}

export function barChartSvg(c: BarChart, shown = c.values.length): string {
  const W = 1600, H = 640, left = 150, right = 30, top = 70, bottom = 70;
  const pw = W - left - right, ph = H - top - bottom;
  const lo = Math.min(0, ...c.values), hi = Math.max(0, ...c.values);
  const step = niceStep(hi - lo || 1);
  const yMin = Math.floor(lo / step) * step, yMax = Math.ceil(hi / step) * step;
  const y = (v: number) => top + ((yMax - v) / (yMax - yMin)) * ph;
  const slot = pw / c.values.length, bw = Math.min(slot * 0.72, 110);
  const cx = (i: number) => left + slot * (i + 0.5);
  const few = c.values.length <= 12;
  const out: string[] = [`<svg viewBox="0 0 ${W} ${H}" class="barchart" role="img" aria-label="bar chart">`];
  for (let t = yMin; t <= yMax + step / 2; t += step) {
    out.push(`<line x1="${left}" x2="${W - right}" y1="${y(t)}" y2="${y(t)}" stroke="${GRID}" stroke-width="2"/>`,
      `<text x="${left - 16}" y="${y(t) + 10}" text-anchor="end" font-size="28" fill="${INK}">${esc(formatValue(c, t))}</text>`);
  }
  // Bars below zero keep their labels above the zero line, out of the way.
  const labelY = lo < 0 && hi <= 0 ? top - 14 : H - 22;
  c.values.forEach((v, i) => {
    if (few || i % 2 === 0) out.push(`<text x="${cx(i)}" y="${labelY}" text-anchor="middle" font-size="28" fill="${INK}">${esc(c.labels[i])}</text>`);
    if (i >= shown) return;
    const h = Math.max(3, Math.abs(y(v) - y(0)));
    out.push(`<rect x="${cx(i) - bw / 2}" y="${v >= 0 ? y(0) - h : y(0)}" width="${bw}" height="${h}" rx="4" fill="${BLUE}"><title>${esc(c.labels[i])}: ${esc(formatValue(c, v))}</title></rect>`);
    if (c.highlight ? c.highlight.includes(c.labels[i]) : few) {
      out.push(`<text x="${cx(i)}" y="${v >= 0 ? y(0) - h - 12 : y(0) + h + 32}" text-anchor="middle" font-size="28" font-weight="800" fill="${INK}">${esc(formatValue(c, v))}</text>`);
    }
  });
  out.push(`<line x1="${left}" x2="${W - right}" y1="${y(0)}" y2="${y(0)}" stroke="${INK}" stroke-width="3"/>`);
  const m = c.marker ? c.labels.indexOf(c.marker.after) : -1;
  if (c.marker && m >= 0) {
    const x = left + slot * (m + 1);
    out.push(`<line x1="${x}" x2="${x}" y1="${top}" y2="${top + ph}" stroke="${MUTED}" stroke-width="3" stroke-dasharray="10 8"/>`,
      `<text x="${x + 14}" y="${top + ph - 14}" font-size="28" font-weight="700" fill="${INK}">${esc(c.marker.text)}</text>`);
  }
  out.push('</svg>');
  return out.join('');
}
