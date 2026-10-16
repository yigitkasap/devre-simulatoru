// Baraj sayfasının seviye mantığı (saf fonksiyonlar): seviye renkleri ve hedefleri, suyun bulunduğu
// bant, Durum tablosunun satırları ve şemadaki seviye bantlarının sınırları. Prob, şemadaki kat, tablo
// satırı ve lamba aynı numarayı ve rengi taşır (Seviye 1 yeşil, 2 sarı, 3 kırmızı).

import type { Box } from '../model/catalog';
import { partBounds, unionBox } from '../model/geometry';
import type { CircuitDoc, Part } from '../model/types';
import type { DeviceStatus, Measurement } from '../sim/devices';
import { TANK_PROBE_HEIGHTS } from '../sim/devices/tank';

export type LevelNo = 1 | 2 | 3;
/** 0 = Kuru, 1–3 = Seviye 1–3. */
export type Stop = 0 | 1 | 2 | 3;

/** Tablo ve şemada yukarıdan aşağı sıra. */
export const LEVELS_TOP_DOWN: readonly LevelNo[] = [3, 2, 1];

export const LEVEL_COLORS: Readonly<
  Record<LevelNo, { readonly badge: string; readonly badgeInk: string; readonly text: string; readonly soft: string; readonly lamp: string }>
> = {
  1: { badge: '#1b7d44', badgeInk: '#ffffff', text: '#1b7d44', soft: '#e8f5ed', lamp: '#34c759' },
  2: { badge: '#ffc107', badgeInk: '#1d2733', text: '#8a5a00', soft: '#fff4d1', lamp: '#ffc107' },
  3: { badge: '#d92d20', badgeInk: '#ffffff', text: '#c4271b', soft: '#fdecea', lamp: '#ff3b30' },
};

/** Kuru, Seviye 1, 2, 3 düğmelerinin hedefi (%): her aralığın ortası (en üstte %95). */
export const STOP_TARGETS: Readonly<Record<Stop, number>> = { 0: 25, 1: 50, 2: 75, 3: 95 };

/** Başa al ve açılıştaki seviye (%). */
export const START_LEVEL = 20;

/** Suyun bulunduğu bant: ıslanan seviye probu sayısı (prob yüksekliği geçildiyse ıslak). */
export function bandOf(level: number): Stop {
  let band = 0;
  for (let k = 1; k <= 3; k++) if (level >= TANK_PROBE_HEIGHTS[k]!) band = k;
  return band as Stop;
}

/** Sunum kumandası "ileri": bir üst seviye (en üstteyse yok). */
export function stopAbove(level: number): Stop | null {
  const band = bandOf(level);
  return band < 3 ? ((band + 1) as Stop) : null;
}

/** Sunum kumandası "geri": bir alt seviye (kurudaysa yok). */
export function stopBelow(level: number): Stop | null {
  const band = bandOf(level);
  return band > 0 ? ((band - 1) as Stop) : null;
}

/** Hedefe giden akış; hedefteyse (yarım yüzde içinde) durur. */
export function flowToward(level: number, target: number): 'fill' | 'drain' | 'stop' {
  if (level < target - 0.5) return 'fill';
  if (level > target + 0.5) return 'drain';
  return 'stop';
}

/** Hedef geçildi mi (doldururken üstüne çıktı, boşaltırken altına indi). */
export function targetReached(level: number, target: number, mode: 'fill' | 'drain' | 'stop'): boolean {
  if (mode === 'fill') return level >= target;
  if (mode === 'drain') return level <= target;
  return true;
}

export type Region = 'cutoff' | 'active' | 'saturation';
export type LedState = 'on' | 'off' | 'dim' | 'fading';

/** LED'in durumu: 0,3'ün üstü yanıyor (uyarı eşiğiyle aynı); 0,02–0,3 arası azalıyorsa sönüyor, değilse çok zayıf. */
export function ledState(brightness: number, falling: boolean): LedState {
  if (brightness > 0.3) return 'on';
  if (brightness > 0.02) return falling ? 'fading' : 'dim';
  return 'off';
}

export interface DurumRow {
  readonly level: LevelNo;
  readonly wet: boolean;
  /** Transistörün etiketi (Q1…Q3). */
  readonly transistor: string;
  /** Simülasyon yoksa null. */
  readonly region: Region | null;
  /** Kat çalışıyor mu (transistör aktif ya da doyumda): satır ve şema bandı renklenir. */
  readonly working: boolean;
  readonly led: LedState;
  readonly brightness: number;
  /** LED akımı (A); simülasyon yoksa null. */
  readonly current: number | null;
  /** Ek not: susturma transistörü ya da boşalan kondansatör. */
  readonly note: { readonly kind: 'silenced'; readonly by: string } | { readonly kind: 'discharging'; readonly capacitor: string } | null;
}

export interface FrameData {
  readonly statuses: ReadonlyMap<string, DeviceStatus>;
  readonly live: ReadonlyMap<string, { readonly brightness?: number }>;
  readonly measurements: ReadonlyMap<string, Measurement>;
}

/** Tek ışıkta seviyenin LED'ini susturan transistör (Q1 → Q4, Q2 → Q5). */
const SILENCER: Readonly<Partial<Record<LevelNo, string>>> = { 1: 'Q4', 2: 'Q5' };

function regionOf(status: DeviceStatus | undefined): Region | null {
  const r = status?.region;
  if (r === 'cutoff' || r === 'active' || r === 'saturation') return r;
  return r === 'ohmic' ? 'saturation' : null;
}

/**
 * Durum tablosunun satırları (Seviye 3, 2, 1). `wet` tankın ıslak probları (ortak, 1, 2, 3);
 * `falling` LED parlaklığı azalıyor mu.
 */
export function durumRows(
  doc: CircuitDoc,
  frame: FrameData | null,
  wet: readonly boolean[],
  falling: (ledId: string) => boolean,
): DurumRow[] {
  const byLabel = new Map(doc.parts.map((p) => [p.label, p] as const));
  return LEVELS_TOP_DOWN.map((level) => {
    const q = byLabel.get(`Q${level}`);
    const led = byLabel.get(`LED${level}`);
    const region = q && frame ? regionOf(frame.statuses.get(q.id)) : null;
    const brightness = led && frame ? (frame.live.get(led.id)?.brightness ?? 0) : 0;
    const current = led && frame ? (frame.measurements.get(led.id)?.current ?? 0) : null;
    const isWet = wet[level] === true;
    let note: DurumRow['note'] = null;
    const silencerLabel = SILENCER[level];
    const silencer = silencerLabel ? byLabel.get(silencerLabel) : undefined;
    if (silencer && frame && region === 'cutoff' && regionOf(frame.statuses.get(silencer.id)) === 'saturation') {
      note = { kind: 'silenced', by: silencer.label };
    } else if (!isWet && region !== null && region !== 'cutoff') {
      note = { kind: 'discharging', capacitor: `C${level}` };
    }
    return {
      level,
      wet: isWet,
      transistor: q?.label ?? `Q${level}`,
      region,
      working: region === 'active' || region === 'saturation',
      led: ledState(brightness, led ? falling(led.id) : false),
      brightness,
      current,
      note,
    };
  });
}

/** Şemadaki seviye bandı: o katın parçalarının (RBn, Cn, RPn, Qn, LEDn, RCn) sınır kutusu, ızgara biriminde. */
export function levelBands(doc: CircuitDoc, pad = 1.5): ReadonlyArray<{ readonly level: LevelNo; readonly box: Box }> {
  const byLabel = new Map<string, Part>(doc.parts.map((p) => [p.label, p] as const));
  const bands: Array<{ level: LevelNo; box: Box }> = [];
  for (const level of LEVELS_TOP_DOWN) {
    let box: Box | null = null;
    for (const prefix of ['RB', 'C', 'RP', 'Q', 'LED', 'RC']) {
      const part = byLabel.get(`${prefix}${level}`);
      if (part) box = unionBox(box, partBounds(part));
    }
    if (box) bands.push({ level, box: { x: box.x - pad, y: box.y - pad, w: box.w + 2 * pad, h: box.h + 2 * pad } });
  }
  return bands;
}

/** LED akımı mA olarak: 10 mA ve üstü tam sayı, 0,1–10 mA bir ondalık, daha küçüğü iki ondalık. */
export function milliamps(current: number): { readonly value: number; readonly decimals: number } {
  const mA = Math.abs(current) * 1000;
  if (mA < 0.005) return { value: 0, decimals: 0 };
  if (mA < 0.1) return { value: mA, decimals: 2 };
  return mA < 10 ? { value: mA, decimals: 1 } : { value: mA, decimals: 0 };
}
