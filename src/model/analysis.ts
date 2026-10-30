// Analiz katmanının devreyle birlikte kaydedilen kısmı (docs/tasarim-v3 → "Analiz katmanı"): grafik
// izleri (A1) ve ölçüm tablosu (A2). Belgenin yapısına (structureKey) ve geri alma geçmişine girmez;
// otomatik kayıtta ve indirilen dosyada devrenin yanında "analysis" alanında durur.

import type { Point } from './types';

/** İz rengi: tema belirteçleri --color-tr-1 … --color-tr-6. */
export const TRACE_COLORS = 6;

/**
 * Grafikte kaydedilen bir büyüklük: parçanın akımı (pin 0'dan pin 1'e) ya da bir düğümün gerilimi
 * (toprağa göre; ref verilmişse iki düğüm arasındaki fark). Düğüm anahtarları bağlantı modelinin
 * anahtarlarıdır (pinKey, wireKey); `at` şemadaki etiketin yeri (ızgara noktası).
 */
export type TraceDef =
  | { readonly id: string; readonly color: number; readonly kind: 'current'; readonly part: string }
  | {
      readonly id: string;
      readonly color: number;
      readonly kind: 'voltage';
      readonly node: string;
      readonly at: Point;
      readonly ref: string | null;
      readonly refAt: Point | null;
    };

/** Ölçüm tablosunun bir satırı (N2). Teorik ve laboratuvar değerleri öğrencinin yazdığı metin. */
export interface TableRow {
  readonly id: string;
  /** Büyüklük ("τ", "V_C(τ)"). */
  readonly name: string;
  /** Büyüklüğün altındaki formül ("R·C"). */
  readonly formula: string;
  readonly theory: string;
  /** Simülasyonun ölçtüğü değer (SI birimi); yoksa null. */
  readonly measured: number | null;
  readonly unit: string;
  /** Ölçülenin kaynağı ("imleç 100 ms", "%63,2 anı"). */
  readonly source: string;
  readonly lab: string;
}

/** Doğru uydurma: y ve x sütunları (iz kimliği ya da "t"), y'ye isteğe bağlı ln(a − y) dönüşümü. */
export interface FitSpec {
  readonly x: string;
  readonly y: string;
  /** ln(offset − y) dönüşümü: dolan kondansatörde ln(V − V_C(t)); null ise dönüşüm yok. */
  readonly lnOffset: number | null;
  /** Uydurulan x aralığı (ör. dolmanın başladığı andan sonrası); null: sınır yok. */
  readonly from?: number | null;
  readonly to?: number | null;
}

export interface AnalysisDoc {
  readonly traces: readonly TraceDef[];
  readonly rows: readonly TableRow[];
  readonly labColumn: boolean;
  readonly fit: FitSpec | null;
}

export const EMPTY_ANALYSIS: AnalysisDoc = { traces: [], rows: [], labColumn: false, fit: null };

const MAX_TRACES = 12;
const MAX_ROWS = 200;
const MAX_TEXT = 120;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const text = (v: unknown, max = MAX_TEXT): string => (typeof v === 'string' ? v.slice(0, max) : '');

function point(v: unknown): Point | null {
  if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return { x: v[0] as number, y: v[1] as number };
}

function parseTrace(raw: unknown): TraceDef | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '') return null;
  const color = typeof raw.color === 'number' && Number.isInteger(raw.color) ? Math.abs(raw.color) % TRACE_COLORS : 0;
  if (raw.kind === 'current' && typeof raw.part === 'string') return { id: raw.id, color, kind: 'current', part: raw.part };
  if (raw.kind === 'voltage' && typeof raw.node === 'string') {
    const at = point(raw.at);
    if (!at) return null;
    const ref = typeof raw.ref === 'string' ? raw.ref : null;
    return { id: raw.id, color, kind: 'voltage', node: raw.node, at, ref, refAt: ref ? point(raw.refAt) : null };
  }
  return null;
}

function parseRow(raw: unknown): TableRow | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null;
  const measured = typeof raw.measured === 'number' && Number.isFinite(raw.measured) ? raw.measured : null;
  return {
    id: raw.id,
    name: text(raw.name),
    formula: text(raw.formula),
    theory: text(raw.theory, 40),
    measured,
    unit: text(raw.unit, 8),
    source: text(raw.source),
    lab: text(raw.lab, 40),
  };
}

/** Kayıttan okunan analiz bölümü; bozuksa boş analiz. */
export function parseAnalysis(value: unknown): AnalysisDoc {
  if (!isRecord(value)) return EMPTY_ANALYSIS;
  const traces = Array.isArray(value.traces) ? value.traces.slice(0, MAX_TRACES).map(parseTrace).filter((t): t is TraceDef => t !== null) : [];
  const rows = Array.isArray(value.rows) ? value.rows.slice(0, MAX_ROWS).map(parseRow).filter((r): r is TableRow => r !== null) : [];
  let fit: FitSpec | null = null;
  if (isRecord(value.fit) && typeof value.fit.x === 'string' && typeof value.fit.y === 'string') {
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    fit = { x: value.fit.x, y: value.fit.y, lnOffset: num(value.fit.lnOffset), from: num(value.fit.from), to: num(value.fit.to) };
  }
  return { traces, rows, labColumn: value.labColumn === true, fit };
}

/** JSON'a yazılacak biçim (noktalar [x, y]); boş analiz yazılmaz (undefined). */
export function serializeAnalysis(a: AnalysisDoc): Record<string, unknown> | undefined {
  if (a.traces.length === 0 && a.rows.length === 0 && !a.labColumn && a.fit === null) return undefined;
  return {
    traces: a.traces.map((t) =>
      t.kind === 'current'
        ? { ...t }
        : { ...t, at: [t.at.x, t.at.y], refAt: t.refAt ? [t.refAt.x, t.refAt.y] : null },
    ),
    rows: a.rows.map((r) => ({ ...r })),
    labColumn: a.labColumn,
    fit: a.fit,
  };
}

/** Kullanılmayan ilk iz rengi. */
export function nextTraceColor(traces: readonly TraceDef[]): number {
  for (let c = 0; c < TRACE_COLORS; c++) if (!traces.some((t) => t.color === c)) return c;
  return traces.length % TRACE_COLORS;
}
