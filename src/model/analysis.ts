// Analiz katmanının devreyle birlikte kaydedilen kısmı (docs/tasarim-v3 → "Analiz katmanı"): grafik
// izleri (A1) ve ölçüm tablosu (A2). Belgenin yapısına (structureKey) ve geri alma geçmişine girmez;
// otomatik kayıtta ve indirilen dosyada devrenin yanında "analysis" alanında durur.

import type { Point } from './types';

/** İz rengi: tema belirteçleri --color-tr-1 … --color-tr-6. */
export const TRACE_COLORS = 6;

/** Transistörün büyüklükleri (analiz v2, büyüklük seçici): BJT'de V_BE, V_CE, I_C, I_B; FET'te V_GS, V_DS, I_D. */
export const TERMINAL_QUANTITIES = ['vbe', 'vce', 'ic', 'ib', 'vgs', 'vds', 'id'] as const;
export type TerminalQuantity = (typeof TERMINAL_QUANTITIES)[number];

/**
 * Grafikte kaydedilen bir büyüklük: parçanın akımı (pin 0'dan pin 1'e) ya da bir düğümün gerilimi
 * (toprağa göre; ref verilmişse iki düğüm arasındaki fark). Düğüm anahtarları bağlantı modelinin
 * anahtarlarıdır (pinKey, wireKey); `at` şemadaki etiketin yeri (ızgara noktası). Analiz v2'de ayrıca:
 * ölçü aletinin okuması (voltmetrede uçları arası gerilim, ampermetrede akım), osiloskop kanalı (kanal
 * ucu ile COM arası), parçanın uçları arası gerilimi (pin 0 − pin 1) ve gücü (uçları arası gerilim ×
 * akım), transistörün büyüklükleri.
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
    }
  | { readonly id: string; readonly color: number; readonly kind: 'meter'; readonly part: string }
  | { readonly id: string; readonly color: number; readonly kind: 'across'; readonly part: string }
  | { readonly id: string; readonly color: number; readonly kind: 'scope'; readonly part: string; readonly channel: 0 | 1 }
  | { readonly id: string; readonly color: number; readonly kind: 'power'; readonly part: string }
  | { readonly id: string; readonly color: number; readonly kind: 'terminal'; readonly part: string; readonly quantity: TerminalQuantity };

/** Rengi ve kimliği olmayan büyüklük (seçicide, tarama eksenlerinde). */
export type Quantity = TraceDef extends infer T ? (T extends unknown ? Omit<T, 'id' | 'color'> : never) : never;

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
  /**
   * Uydurulan x aralığı (ör. dolmanın başladığı andan sonrası); null: sınır yok. Başlangıç hiç
   * verilmemişse (undefined) x = t'de sinyalin değişmeye başladığı andır (analiz düzeltmeleri, 3).
   */
  readonly from?: number | null;
  readonly to?: number | null;
}

/**
 * Föydeki bir grafiğin kimliği (analiz v2): örnek ve föy kartındaki grafik anahtarı (i18n/foyGraphs).
 * Çipte "FÖY" ön eki ve başlığı buradan gelir.
 */
export interface FoyGraphRef {
  readonly example: string;
  readonly key: string;
}

/**
 * Bir grafik (analiz v2; üstte çip): zamana göre (kayıt; izler belgenin izlerinden kimlikle seçilir,
 * x null ise zaman, bir iz kimliğiyse X-Y), frekansa göre (ölçülen Bode) ya da parçanın karakteristiği
 * (eğri izleyici; taranan parça).
 */
export type GraphDef =
  | { readonly id: string; readonly kind: 'time'; readonly traces: readonly string[]; readonly x: string | null; readonly foy?: FoyGraphRef }
  | { readonly id: string; readonly kind: 'bode'; readonly foy?: FoyGraphRef }
  | { readonly id: string; readonly kind: 'curve'; readonly part: string | null; readonly foy?: FoyGraphRef };

export type GraphKind = GraphDef['kind'];

export interface AnalysisDoc {
  readonly traces: readonly TraceDef[];
  readonly rows: readonly TableRow[];
  readonly labColumn: boolean;
  readonly fit: FitSpec | null;
  /** Grafikler (çipler, soldan sağa). Boşsa Analiz başlangıç ekranıyla açılır. */
  readonly graphs: readonly GraphDef[];
  /** Açık grafiğin kimliği; null: başlangıç ekranı ("Ne çizmek istiyorsun?"). */
  readonly active: string | null;
}

export const EMPTY_ANALYSIS: AnalysisDoc = { traces: [], rows: [], labColumn: false, fit: null, graphs: [], active: null };

const MAX_TRACES = 12;
const MAX_ROWS = 200;
const MAX_TEXT = 120;
const MAX_GRAPHS = 12;

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
  if (typeof raw.part !== 'string') return null;
  if (raw.kind === 'meter' || raw.kind === 'power' || raw.kind === 'across') return { id: raw.id, color, kind: raw.kind, part: raw.part };
  if (raw.kind === 'scope' && (raw.channel === 0 || raw.channel === 1)) return { id: raw.id, color, kind: 'scope', part: raw.part, channel: raw.channel };
  if (raw.kind === 'terminal' && TERMINAL_QUANTITIES.includes(raw.quantity as TerminalQuantity)) return { id: raw.id, color, kind: 'terminal', part: raw.part, quantity: raw.quantity as TerminalQuantity };
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

function parseFoyRef(raw: unknown): FoyGraphRef | undefined {
  return isRecord(raw) && typeof raw.example === 'string' && typeof raw.key === 'string' ? { example: raw.example.slice(0, 40), key: raw.key.slice(0, 40) } : undefined;
}

function parseGraph(raw: unknown, traceIds: ReadonlySet<string>): GraphDef | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '') return null;
  const foy = parseFoyRef(raw.foy);
  const base = { id: raw.id.slice(0, 40), ...(foy ? { foy } : {}) };
  if (raw.kind === 'time') {
    const traces = Array.isArray(raw.traces) ? raw.traces.filter((t): t is string => typeof t === 'string' && traceIds.has(t)) : [];
    const x = typeof raw.x === 'string' && traceIds.has(raw.x) ? raw.x : null;
    return { ...base, kind: 'time', traces, x };
  }
  if (raw.kind === 'bode') return { ...base, kind: 'bode' };
  if (raw.kind === 'curve') return { ...base, kind: 'curve', part: typeof raw.part === 'string' ? raw.part : null };
  return null;
}

/** Kayıttan okunan analiz bölümü; bozuksa boş analiz. */
export function parseAnalysis(value: unknown): AnalysisDoc {
  if (!isRecord(value)) return EMPTY_ANALYSIS;
  const traces = Array.isArray(value.traces) ? value.traces.slice(0, MAX_TRACES).map(parseTrace).filter((t): t is TraceDef => t !== null) : [];
  const rows = Array.isArray(value.rows) ? value.rows.slice(0, MAX_ROWS).map(parseRow).filter((r): r is TableRow => r !== null) : [];
  let fit: FitSpec | null = null;
  if (isRecord(value.fit) && typeof value.fit.x === 'string' && typeof value.fit.y === 'string') {
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    // Başlangıcı yazılmamış uydurma kendiliğinden başlangıcı korur (undefined), null ise sınır yok.
    fit = { x: value.fit.x, y: value.fit.y, lnOffset: num(value.fit.lnOffset), ...('from' in value.fit ? { from: num(value.fit.from) } : {}), to: num(value.fit.to) };
  }
  const ids = new Set(traces.map((t) => t.id));
  let graphs = Array.isArray(value.graphs) ? value.graphs.slice(0, MAX_GRAPHS).map((g) => parseGraph(g, ids)).filter((g): g is GraphDef => g !== null) : [];
  // Analiz v2'den önceki kayıt: izler tek bir zaman grafiğinde.
  if (!Array.isArray(value.graphs) && traces.length > 0) graphs = [{ id: 'g0', kind: 'time', traces: traces.map((t) => t.id), x: null }];
  const active = typeof value.active === 'string' && graphs.some((g) => g.id === value.active) ? value.active : (graphs[0]?.id ?? null);
  return { traces, rows, labColumn: value.labColumn === true, fit, graphs, active };
}

/** JSON'a yazılacak biçim (noktalar [x, y]); boş analiz yazılmaz (undefined). */
export function serializeAnalysis(a: AnalysisDoc): Record<string, unknown> | undefined {
  if (a.traces.length === 0 && a.rows.length === 0 && !a.labColumn && a.fit === null && a.graphs.length === 0) return undefined;
  return {
    traces: a.traces.map((t) => (t.kind === 'voltage' ? { ...t, at: [t.at.x, t.at.y], refAt: t.refAt ? [t.refAt.x, t.refAt.y] : null } : { ...t })),
    rows: a.rows.map((r) => ({ ...r })),
    labColumn: a.labColumn,
    fit: a.fit,
    graphs: a.graphs.map((g) => ({ ...g })),
    active: a.active,
  };
}

/** Hiçbir zaman grafiğinde kullanılmayan izler atılır (grafik ya da iz kapatılınca). */
export function pruneTraces(a: AnalysisDoc): AnalysisDoc {
  const used = new Set(a.graphs.flatMap((g) => (g.kind === 'time' ? [...g.traces, ...(g.x ? [g.x] : [])] : [])));
  const traces = a.traces.filter((t) => used.has(t.id));
  return traces.length === a.traces.length ? a : { ...a, traces };
}

/** Kullanılmayan ilk iz rengi. */
export function nextTraceColor(traces: readonly TraceDef[]): number {
  for (let c = 0; c < TRACE_COLORS; c++) if (!traces.some((t) => t.color === c)) return c;
  return traces.length % TRACE_COLORS;
}
