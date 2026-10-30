// Ölçüm tablosu (A2, N2): teorik değerin okunması, % hata, doğru uydurma (en küçük kareler) ve
// tablonun CSV'si. Saf işlevler (testler doğrudan çağırır).

import type { FitSpec, TableRow } from '../../model/analysis';
import { formatNumber, formatSI, parseValue, type UnitSymbol } from '../../sim/units';
import { tr } from '../../i18n/tr';
import { plainText } from '../Rich';
import { toCsv, type CsvSeparator } from './format';
import type { TraceRecorder } from './recorder';

const UNITS: ReadonlySet<string> = new Set(['Ω', 'V', 'A', 'F', 'H', 'J', 'W', 's', 'Hz', '%']);

/** Öğrencinin yazdığı teorik değer ("100 ms", "6,32 V", "3,68m"); okunamazsa null. */
export function parseTheory(text: string, unit: string): number | null {
  if (text.trim() === '') return null;
  const withUnit = UNITS.has(unit) ? parseValue(text, unit as UnitSymbol) : parseValue(text);
  if (withUnit.ok) return withUnit.value;
  const bare = parseValue(text);
  return bare.ok ? bare.value : null;
}

/** % Hata = |Ölçülen − Teorik| / |Teorik| × 100; teorik sıfır ya da yoksa null. */
export function percentError(measured: number | null, theory: number | null): number | null {
  if (measured === null || theory === null || theory === 0 || !Number.isFinite(measured)) return null;
  return (Math.abs(measured - theory) / Math.abs(theory)) * 100;
}

export const errorText = (e: number | null): string => (e === null ? '—' : formatNumber(e, e < 10 ? 2 : 1));

export interface LineFit {
  readonly slope: number;
  readonly intercept: number;
  readonly r2: number;
  readonly n: number;
}

/** En küçük kareler doğrusu y = eğim · x + kesişim ve belirlilik katsayısı R². */
export function linearFit(xs: readonly number[], ys: readonly number[]): LineFit | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!;
    sy += ys[i]!;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept: my - slope * mx, r2, n };
}

/**
 * Uydurmanın noktaları: x (zaman ya da bir iz) ve y (iz; ln dönüşümünde ln(a − y)). ln'in içi a'nın
 * %1'inin altına inen noktalar (dolmanın sonu, gürültü) atılır.
 */
export function fitPoints(rec: TraceRecorder, spec: FitSpec): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  const yv = rec.values.get(spec.y);
  const xv = spec.x === 't' ? rec.times : rec.values.get(spec.x);
  if (!yv || !xv) return { xs, ys };
  const floor = spec.lnOffset === null ? 0 : Math.abs(spec.lnOffset) * 0.01;
  const from = spec.from ?? Number.NEGATIVE_INFINITY;
  const to = spec.to ?? Number.POSITIVE_INFINITY;
  for (let i = 0; i < rec.count; i++) {
    const x = xv[i]!;
    if (x < from || x > to) continue;
    let y = yv[i]!;
    if (spec.lnOffset !== null) {
      const arg = spec.lnOffset - y;
      if (!(arg > floor)) continue;
      y = Math.log(arg);
    }
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  }
  return { xs, ys };
}

/** Uydurmadan çıkan zaman sabiti: x zaman ve y = ln(a − V) ise τ = −1 / eğim. */
export function fitTau(spec: FitSpec, fit: LineFit | null): number | null {
  if (!fit || spec.x !== 't' || spec.lnOffset === null || fit.slope >= 0) return null;
  return -1 / fit.slope;
}

/** Ölçülen değerin yazısı (birimli, 4 anlamlı basamak). */
export const measuredText = (row: TableRow): string => (row.measured === null ? '—' : formatSI(row.measured, row.unit, { digits: 4 }));

/** Tablonun CSV'si: Büyüklük, Formül, Teorik, Ölçülen, Birim, Kaynak, % Hata (ve Laboratuvar). */
export function tableCsv(rows: readonly TableRow[], labColumn: boolean, sep: CsvSeparator): string {
  const t = tr.analysis.table;
  const header = [t.name, t.formula, t.theory, t.measured, t.unit, t.source, t.error, ...(labColumn ? [t.lab] : [])];
  const body = rows.map((r) => {
    const theory = parseTheory(r.theory, r.unit);
    const e = percentError(r.measured, theory);
    return [plainText(r.name), plainText(r.formula), theory ?? r.theory, r.measured ?? '', r.unit, r.source, e ?? '', ...(labColumn ? [parseTheory(r.lab, r.unit) ?? r.lab] : [])];
  });
  return toCsv(header, body, sep);
}

/** Panoya (Excel / Word'e yapıştırmak için): sekmeyle ayrılmış, ondalık virgül. */
export function tableTsv(rows: readonly TableRow[], labColumn: boolean): string {
  const t = tr.analysis.table;
  const lines = [[t.name, t.theory, t.measured, t.error, ...(labColumn ? [t.lab] : [])].join('\t')];
  for (const r of rows) {
    const e = percentError(r.measured, parseTheory(r.theory, r.unit));
    lines.push([r.formula ? `${plainText(r.name)} (${plainText(r.formula)})` : plainText(r.name), r.theory, measuredText(r), errorText(e), ...(labColumn ? [r.lab] : [])].join('\t'));
  }
  return lines.join('\n');
}
