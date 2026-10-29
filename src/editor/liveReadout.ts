// Canlı ölçümlerin kararlı gösterimi (gerçek bir multimetre gibi): motor, izlenen bileşenin ölçüm
// ve durum yapraklarını her adımda tümler (sim/watch.ts); burada bu istatistikler DISPLAY_WINDOW
// saniyelik (gerçek zaman) pencerelerde toplanır.
//
//   - Sabit ya da tek yönde değişen (kondansatörün dolması gibi) değer olduğu gibi, her karede canlı
//     gösterilir.
//   - Pencere içinde salınan değer (AC, 555'in çıkışı) pencere başına bir kez güncellenir:
//     gerilim ve akım etkin değer (işareti ortalamanın işareti), güç ve öbür büyüklükler ortalama;
//     başına "≈" konur. DC kipindeki ölçü aleti ortalamayı, AC kipindeki etkin değeri gösterir.
//   - Bir durum (Yüksek/Düşük, çekili/bırakmış) pencere içinde gidip geliyorsa iki durum "⇄" ile.
//   - Sayıya çevrilemeyen değer (NaN, ∞) "hesaplanamıyor" olarak yazılır.

import { tr } from '../i18n/tr';
import type { Part } from '../model/types';
import { mergeStats, type DeviceStatus, type KeyStats, type Measurement } from '../sim';
import { meterText, partReadout, type Readout, type ReadoutRow } from './readouts';

/** Salınan değerlerin güncellenme aralığı (gerçek zaman, s): multimetrelerin ≈ 2–3 okuma/s'si. */
export const DISPLAY_WINDOW = 0.4;

/** Bir pencerenin özeti: yaprak → istatistik. */
export type LiveSummary = ReadonlyMap<string, KeyStats>;

/** Bir bileşenin pencere toplayıcısı. */
export class LiveWindow {
  private acc = new Map<string, KeyStats>();
  private real = 0;
  /** Son tamamlanan pencere; henüz yoksa null. */
  summary: LiveSummary | null = null;

  /** Bir karenin istatistiklerini ekler; pencere dolduysa özet güncellenir. */
  add(stats: ReadonlyMap<string, KeyStats> | null, dtReal: number, window = DISPLAY_WINDOW): void {
    if (!stats) return;
    for (const [key, s] of stats) {
      const previous = this.acc.get(key);
      this.acc.set(key, previous ? mergeStats(previous, s) : { ...s, values: [...s.values] });
    }
    this.real += dtReal;
    if (this.real >= window || this.summary === null) {
      this.summary = this.acc;
      this.acc = new Map();
      this.real = 0;
    }
  }
}

/** Değer pencere içinde salındı mı (sabit ya da tek yönde değişmediyse). */
export function oscillates(s: KeyStats): boolean {
  if (s.kind !== 'number') return s.changes >= 2;
  const span = s.max - s.min;
  if (!(span > 1e-6 * Math.max(Math.abs(s.max), Math.abs(s.min)) + 1e-15)) return false;
  // Tek yönde değişimde toplam değişim aralığa eşittir (dolan kondansatör canlı akar); salınımda
  // değer en az bir kez gidip döner.
  return s.variation > 1.5 * span;
}

const mean = (s: KeyStats) => (s.time > 0 ? s.sum / s.time : s.last);
const rms = (s: KeyStats) => (s.time > 0 ? Math.sqrt(Math.max(0, s.sumSquares / s.time)) : Math.abs(s.last));
/**
 * Gerilim ve akımın özeti: etkin değer. Ağırlıkla tek kutuplu değerde (doğrultulmuş, darbeli DC)
 * ortalamanın işaretini alır; simetriğe yakın AC'de işaretsizdir (ortalama sıfıra yakın olduğundan
 * işareti pencereye ve yük asimetrisine göre rastgele değişir: "≈ −3,46 V" yazmasın).
 */
function signedRms(s: KeyStats): number {
  const r = rms(s);
  return Math.abs(mean(s)) >= 0.2 * r ? Math.sign(mean(s)) * r : r;
}

type Pick = 'min' | 'max' | 'summary';

function isMeter(part: Part): boolean {
  return part.type === 'voltmeter' || part.type === 'ammeter';
}

/** Yaprağın seçilen uçtaki ya da özet değeri. */
function leafValue(part: Part, key: string, s: KeyStats, pick: Pick): number | boolean | string {
  if (s.kind === 'string') return pick === 'min' ? s.values[0]! : pick === 'max' ? s.values[s.values.length - 1]! : s.lastText;
  if (s.kind === 'boolean') return pick === 'min' ? false : pick === 'max' ? true : mean(s) >= 0.5;
  if (pick !== 'summary') return pick === 'min' ? s.min : s.max;
  if (isMeter(part)) {
    // Ölçü aleti: DC kipinde ortalama, AC kipinde etkin değer (gösterge zaten etkinse ortalaması).
    const ac = part.props.mode === 'ac';
    return ac && key !== 's.reading' ? rms(s) : mean(s);
  }
  if (key === 'm.voltage' || key === 'm.current') return signedRms(s);
  return mean(s);
}

/** Yaprağı yoldan (s.timer.high) nesnenin kopyasına yazar. */
function setPath(target: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let node: Record<string, unknown> = target;
  for (let i = 0; i < path.length - 1; i++) {
    const next = node[path[i]!];
    if (next === null || typeof next !== 'object') return;
    node = next as Record<string, unknown>;
  }
  node[path[path.length - 1]!] = value;
}

/** Salınan yaprakları seçilen değerle değiştirilmiş ölçüm ve durum. */
function variant(part: Part, m: Measurement, status: DeviceStatus, summary: LiveSummary, keys: readonly string[], pick: Pick) {
  const root = { m: { ...m }, s: structuredClone(status) as Record<string, unknown> };
  for (const key of keys) setPath(root as unknown as Record<string, unknown>, key.split('.'), leafValue(part, key, summary.get(key)!, pick));
  return { m: root.m as Measurement, status: root.s as DeviceStatus };
}

/** Sayı ve SI öneki (0,000 W ile 100,0 mW aynı iskelet). */
const NUMBER_UNIT = /[−-]?\d[\d.,]*\s?[pnµumkMG]?/g;
/** formatSI'nin NaN ("— V") ve sonsuz ("∞ A") çıktısı. */
const UNCOMPUTABLE = /(^|[\s·(])(—|−?∞)(?=\s|$)/u;

export interface StableReadout extends Readout {
  /** Bir ya da daha çok satır pencere özetiyle gösteriliyor. */
  readonly varying: boolean;
}

/** Hesaplanamayan (NaN, ∞) değerli satırlar "hesaplanamıyor" olur. */
function guard(rows: readonly ReadoutRow[]): ReadoutRow[] {
  return rows.map((row) => (UNCOMPUTABLE.test(row.value) ? { ...row, value: tr.inspector.uncomputable } : row));
}

/** Bilgi kutusu: salınan satırlar pencere özetiyle, öbürleri canlı. */
export function stableReadout(part: Part, m: Measurement, status: DeviceStatus, summary: LiveSummary | null): StableReadout | null {
  const base = partReadout(part, m, status);
  if (!base) return null;
  const keys = summary ? [...summary].filter(([, s]) => oscillates(s)).map(([key]) => key) : [];
  if (!summary || keys.length === 0) return { ...base, rows: guard(base.rows), varying: false };
  const [low, high, avg] = (['min', 'max', 'summary'] as const).map((pick) => {
    const v = variant(part, m, status, summary, keys, pick);
    return partReadout(part, v.m, v.status);
  });
  let varying = false;
  const rows = base.rows.map((row): ReadoutRow => {
    const find = (r: Readout | null) => r?.rows.find((x) => x.label === row.label)?.value;
    const texts = [find(low), find(high), find(avg)].filter((t): t is string => t !== undefined);
    if (new Set(texts).size <= 1) return row;
    varying = true;
    const skeletons = new Set(texts.map((t) => t.replace(NUMBER_UNIT, '#')));
    const summaryText = find(avg);
    // Durum gidip geliyor (Yüksek ⇄ Düşük): uçlardaki iki durum.
    if (skeletons.size > 1 || !summaryText || !/\d/.test(summaryText)) {
      const ends = [find(low), find(high)].filter((t): t is string => t !== undefined);
      return { label: row.label, value: [...new Set(ends)].join(' ⇄ ') };
    }
    return { label: row.label, value: `≈ ${summaryText}` };
  });
  const note = avg?.note !== undefined && base.note !== avg.note ? avg.note : base.note;
  return { title: base.title, rows: guard(rows), ...(note !== undefined ? { note } : {}), varying };
}

/**
 * Tek bir gerilim ya da akım yaprağının kararlı değeri (fonksiyon üretecinin çıkış satırı gibi):
 * pencerede salınıyorsa etkin değeri (signedRms; `approx`, başına "≈" konur), yoksa canlı değer.
 */
export function stableValue(live: number, s: KeyStats | undefined): { value: number; approx: boolean } {
  if (!s || s.kind !== 'number' || !oscillates(s)) return { value: live, approx: false };
  return { value: signedRms(s), approx: true };
}

/** Ölçü aletinin göstergesi: salınıyorsa pencere özeti (DC ortalama, AC etkin), yoksa canlı. */
export function stableMeterText(part: Part, m: Measurement, status: DeviceStatus, summary: LiveSummary | null): string | null {
  const keys = summary ? [...summary].filter(([, s]) => oscillates(s)).map(([key]) => key) : [];
  if (!summary || keys.length === 0) return meterText(part, m, status);
  const v = variant(part, m, status, summary, keys, 'summary');
  return meterText(part, v.m, v.status);
}
