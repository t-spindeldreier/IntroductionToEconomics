// Small statistics helpers. Pure functions, unit-tested.

/** Median of a list of numbers; null for an empty list. */
export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Position (0..1) of a value on a log axis from lo to hi.
 * Values outside the axis are pinned to the edge.
 */
export function logPosition(value: number, lo: number, hi: number): number {
  if (!(value > lo)) return 0;
  if (value >= hi) return 1;
  return (Math.log10(value) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
}

/** Number of answers per option, for options 0..n-1. */
export function countOptions(answers: number[], n: number): number[] {
  const counts = new Array<number>(n).fill(0);
  for (const a of answers) if (Number.isInteger(a) && a >= 0 && a < n) counts[a]++;
  return counts;
}

/**
 * Parse what a student typed into the guess field. Accepts "40", "40.5" and the
 * German "40,5". Spaces are ignored. Returns null if it is not a plain number.
 * Thousands separators are not supported; the phone echoes the parsed value so
 * the student sees how the input was understood before submitting.
 */
export function parseGuess(text: string): number | null {
  const t = text.replace(/\s+/g, '').replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
}

/** "1234.5" -> "1,234.5"; at most three significant decimals for small numbers. */
export function formatNumber(x: number): string {
  const digits = Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 10 ? 1 : 2;
  return x.toLocaleString('en-US', { maximumFractionDigits: digits });
}
