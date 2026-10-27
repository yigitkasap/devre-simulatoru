// İzlenen bileşenlerin ölçüm istatistikleri: arayüzün gösterdiği bileşen (İnceleme paneli) ve ölçü
// aletleri için ölçüm (gerilim, akım, güç) ile durumun bütün sayısal yaprakları her kabul edilen
// adımda, adım süresiyle ağırlıklandırılarak tümlenir. Böylece karede bir örneklemenin
// yakalayamayacağı hızlı değişimlerin (AC, 555'in kare dalgası) ortalaması, etkin değeri ve
// uçları kesin olarak bilinir; arayüz salınan değerleri titretmeden gösterebilir.

/** Bir yaprağın türü: sayı, açık/kapalı (0/1 olarak tümlenir) ya da metin (ör. op-amp kipi). */
export type WatchKind = 'number' | 'boolean' | 'string';

export interface KeyStats {
  kind: WatchKind;
  /** Tümlenen süre (s). */
  time: number;
  /** ∫x dt ve ∫x² dt (açık/kapalıda 1/0). */
  sum: number;
  sumSquares: number;
  min: number;
  max: number;
  first: number;
  last: number;
  /** Metin yaprağının görülen değerleri (sırayla, tekrarsız). */
  values: string[];
  firstText: string;
  lastText: string;
  /** Açık/kapalı ve metinde durum değişimi sayısı. */
  changes: number;
  /** Toplam değişim Σ|Δx|: tek yönde değişimde aralığa eşit, salınımda katları. */
  variation: number;
}

/** Ölçüm ve durumun yaprakları: "m.voltage", "s.timer.high", "s.outputs.0.current". */
export function flatten(prefix: string, value: unknown, visit: (key: string, leaf: number | boolean | string) => void): void {
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    visit(prefix, value);
  } else if (Array.isArray(value)) {
    value.forEach((item, k) => flatten(`${prefix}.${k}`, item, visit));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, item] of Object.entries(value)) flatten(`${prefix}.${k}`, item, visit);
  }
}

export function emptyStats(kind: WatchKind): KeyStats {
  return {
    kind,
    time: 0,
    sum: 0,
    sumSquares: 0,
    min: Number.POSITIVE_INFINITY,
    max: Number.NEGATIVE_INFINITY,
    first: Number.NaN,
    last: Number.NaN,
    values: [],
    firstText: '',
    lastText: '',
    changes: 0,
    variation: 0,
  };
}

/** Bir yaprağın `dt` süresince geçerli değerini ekler. */
export function addLeaf(stats: Map<string, KeyStats>, key: string, leaf: number | boolean | string, dt: number): void {
  const kind: WatchKind = typeof leaf === 'number' ? 'number' : typeof leaf === 'boolean' ? 'boolean' : 'string';
  let s = stats.get(key);
  if (!s || s.kind !== kind) stats.set(key, (s = emptyStats(kind)));
  if (kind === 'string') {
    const text = leaf as string;
    if (s.time === 0 && s.values.length === 0) s.firstText = text;
    else if (text !== s.lastText) s.changes++;
    if (!s.values.includes(text)) s.values.push(text);
    s.lastText = text;
    s.time += dt;
    return;
  }
  const x = kind === 'boolean' ? (leaf ? 1 : 0) : (leaf as number);
  if (Number.isNaN(s.first)) s.first = x;
  else {
    if (kind === 'boolean' && x !== s.last) s.changes++;
    s.variation += Math.abs(x - s.last);
  }
  s.last = x;
  s.min = Math.min(s.min, x);
  s.max = Math.max(s.max, x);
  s.sum += x * dt;
  s.sumSquares += x * x * dt;
  s.time += dt;
}

/** İki istatistiği birleştirir (b, a'dan sonra gelen aralık). */
export function mergeStats(a: KeyStats, b: KeyStats): KeyStats {
  if (a.kind !== b.kind) return { ...b, values: [...b.values] };
  const empty = a.time === 0 && Number.isNaN(a.first) && a.values.length === 0;
  if (empty) return { ...b, values: [...b.values] };
  const values = [...a.values];
  for (const v of b.values) if (!values.includes(v)) values.push(v);
  const boundary = a.kind === 'string' ? (b.values.length > 0 && b.firstText !== a.lastText ? 1 : 0) : !Number.isNaN(b.first) && b.first !== a.last && a.kind === 'boolean' ? 1 : 0;
  return {
    kind: a.kind,
    time: a.time + b.time,
    sum: a.sum + b.sum,
    sumSquares: a.sumSquares + b.sumSquares,
    min: Math.min(a.min, b.min),
    max: Math.max(a.max, b.max),
    first: a.first,
    last: Number.isNaN(b.last) ? a.last : b.last,
    values,
    firstText: a.firstText,
    lastText: b.values.length > 0 ? b.lastText : a.lastText,
    changes: a.changes + b.changes + boundary,
    variation: a.variation + b.variation + (a.kind === 'string' || Number.isNaN(b.first) || Number.isNaN(a.last) ? 0 : Math.abs(b.first - a.last)),
  };
}
