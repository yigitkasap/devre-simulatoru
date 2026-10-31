// Baraj sayfasının seviye mantığı (saf fonksiyonlar): seviye renkleri ve hedefleri, suyun bulunduğu
// bant ve devre panelinin her katı için simülasyondan okunan durum (ıslaklık, transistör bölgesi, dal
// akımları). Prob, devre panelindeki kat ve lamba aynı numarayı ve rengi taşır (Seviye 1 yeşil, 2 sarı,
// 3 kırmızı).

import type { CircuitDoc } from '../model/types';
import type { DeviceStatus } from '../sim/devices';
import { TANK_PROBE_HEIGHTS } from '../sim/devices/tank';
import { numProp } from '../sim/netlist';

export type LevelNo = 1 | 2 | 3;
/** 0 = Kuru, 1–3 = Seviye 1–3. */
export type Stop = 0 | 1 | 2 | 3;

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

export interface FrameData {
  readonly statuses: ReadonlyMap<string, DeviceStatus>;
  readonly live: ReadonlyMap<string, { readonly brightness?: number }>;
  /** Parçaların uçlarına giren akımlar (pin sırasıyla, A). */
  readonly pinFlows: ReadonlyMap<string, readonly number[]>;
}

/** Devre panelinde bu akımın üstündeki dal vurgulanır (A); altı gürültü ya da sızıntı sayılır. */
export const PATH_CURRENT = 2e-6;

/** Tek ışıkta seviyenin LED'ini susturan transistör ve onu süren direnç (Q1 ← Q4, Q2 ← Q5). */
const SILENCERS: Readonly<Partial<Record<LevelNo, { readonly q: string; readonly r: string }>>> = {
  1: { q: 'Q4', r: 'RS4' },
  2: { q: 'Q5', r: 'RS5' },
};

function regionOf(status: DeviceStatus | undefined): Region | null {
  const r = status?.region;
  if (r === 'cutoff' || r === 'active' || r === 'saturation') return r;
  return r === 'ohmic' ? 'saturation' : null;
}

/** Bir katın dal akımları (A, mutlak değer). */
export interface KatAkimlari {
  /** Probdan baz direncine giren akım: su yolu ve RB. */
  readonly probe: number;
  readonly base: number;
  readonly collector: number;
  readonly emitter: number;
  /** Kondansatörün dolma ya da boşalma akımı. */
  readonly capacitor: number;
  readonly led: number;
}

export interface Susturucu {
  /** Transistör ve sürücü direncinin etiketi (Q4, RS4). */
  readonly label: string;
  readonly resistor: string;
  readonly resistance: number;
  /** Onu süren prob (bir üst seviye) ıslak mı. */
  readonly wet: boolean;
  readonly region: Region | null;
  /** Simülasyon yoksa null. */
  readonly currents: { readonly base: number; readonly collector: number; readonly emitter: number } | null;
}

/** Devre panelinin bir katı: o katın parçaları, simülasyondaki durumu ve dal akımları. */
export interface KatDevresi {
  readonly level: LevelNo;
  readonly labels: { readonly rb: string; readonly c: string; readonly rp: string; readonly q: string; readonly rc: string; readonly led: string };
  readonly values: { readonly rb: number; readonly c: number; readonly rp: number; readonly rc: number };
  readonly wet: boolean;
  /** Simülasyon yoksa null. */
  readonly region: Region | null;
  /** Baz düğümünün gerilimi (V); simülasyon yoksa null. */
  readonly baseVoltage: number | null;
  readonly brightness: number;
  readonly currents: KatAkimlari | null;
  /** Tek ışıkta bu katın LED'ini susturan transistör; çubuk göstergede ve Kat 3'te null. */
  readonly silencer: Susturucu | null;
  /** Susturucu doyumda ve kat kesimde: LED'i üst seviye söndürüyor. */
  readonly silenced: boolean;
}

/**
 * Devre panelinin katları (Kat 1, 2, 3). `wet` tankın ıslak probları (ortak, 1, 2, 3). Akımlar uçlara
 * giren akımlardan okunur: transistörde kollektör, baz, emetör; dirençte, kondansatörde ve LED'de ilk uç.
 */
export function katDevreleri(doc: CircuitDoc, frame: FrameData | null, wet: readonly boolean[]): KatDevresi[] {
  const byLabel = new Map(doc.parts.map((p) => [p.label, p] as const));
  const flow = (label: string, pin: number) => {
    const part = byLabel.get(label);
    return Math.abs((part && frame?.pinFlows.get(part.id)?.[pin]) || 0);
  };
  const value = (label: string, key: string, fallback: number) => numProp(byLabel.get(label)?.props ?? {}, key, fallback);
  return ([1, 2, 3] as const).map((level) => {
    const labels = { rb: `RB${level}`, c: `C${level}`, rp: `RP${level}`, q: `Q${level}`, rc: `RC${level}`, led: `LED${level}` };
    const q = byLabel.get(labels.q);
    const led = byLabel.get(labels.led);
    const region = q && frame ? regionOf(frame.statuses.get(q.id)) : null;
    const s = SILENCERS[level];
    const sq = s ? byLabel.get(s.q) : undefined;
    const silencer: Susturucu | null =
      s && sq
        ? {
            label: s.q,
            resistor: s.r,
            resistance: value(s.r, 'resistance', 10e3),
            wet: wet[level + 1] === true,
            region: frame ? regionOf(frame.statuses.get(sq.id)) : null,
            currents: frame ? { collector: flow(s.q, 0), base: flow(s.q, 1), emitter: flow(s.q, 2) } : null,
          }
        : null;
    return {
      level,
      labels,
      values: {
        rb: value(labels.rb, 'resistance', 10e3),
        c: value(labels.c, 'capacitance', 10e-6),
        rp: value(labels.rp, 'resistance', 100e3),
        rc: value(labels.rc, 'resistance', 470),
      },
      wet: wet[level] === true,
      region,
      // Çekme direnci baz ile toprak arasında: gerilimi baz düğümünün gerilimidir (I · R).
      baseVoltage: frame ? flow(labels.rp, 0) * value(labels.rp, 'resistance', 100e3) : null,
      brightness: led && frame ? (frame.live.get(led.id)?.brightness ?? 0) : 0,
      currents: frame
        ? {
            probe: flow(labels.rb, 0),
            collector: flow(labels.q, 0),
            base: flow(labels.q, 1),
            emitter: flow(labels.q, 2),
            capacitor: flow(labels.c, 0),
            led: flow(labels.led, 0),
          }
        : null,
      silencer,
      silenced: silencer !== null && silencer.region === 'saturation' && region === 'cutoff',
    };
  });
}

/** Devre tamamlandı mı: probdan baz direncine akım geçiyor (su devreyi kapatıyor). */
export const circuitClosed = (kat: KatDevresi) => kat.currents !== null && kat.currents.probe > PATH_CURRENT;

/**
 * Kuru prob notuna girer mi: prob kuru ve devresi de tamamlanmamış. Su probun ucuna değince akım,
 * prob "ıslak" sayılmadan (ıslanma bandının yarısı) başlar; o arada kat tamamlandı yazılır, kuru yazılmaz.
 */
export const dryOpen = (kat: KatDevresi) => !kat.wet && !circuitClosed(kat);

/** Bir dal vurgulanır mı: simülasyon var ve akım eşiğin üstünde. */
export const carries = (current: number | null | undefined) => current !== null && current !== undefined && current > PATH_CURRENT;

/** Bir katın çalışan (iletimde) transistörü var mı: aktif ya da doyumda. Simülasyon yoksa null. */
export const conducting = (region: Region | null) => (region === null ? null : region !== 'cutoff');

/** Akım mA olarak: 10 mA ve üstü bir ondalık ("14,5"), altı iki ondalık ("0,43"); 5 µA'in altı 0. */
export function milliamps(current: number): { readonly value: number; readonly decimals: number } {
  const mA = Math.abs(current) * 1000;
  if (mA < 0.005) return { value: 0, decimals: 0 };
  return mA < 10 ? { value: mA, decimals: 2 } : { value: mA, decimals: 1 };
}
