// Arıza bulmanın multimetresi (B2, R1): devreye parça olarak eklenmez, tezgâhın sol altında panel.
// Kırmızı ve siyah uç şemada parça bacağına ya da kabloya konur; bacak ile bağlı olduğu düğüm ayrı
// okunur (kopuk bacakta iki okuma farklı çıkar). V ⎓ ve V ∿ (etkin değer) kiplerinde multimetre
// devredeki voltmetreyle aynı modeldir (iç direnç 10 MΩ): simülasyona görünmez bir voltmetre parçası
// olarak girer, konumu sabit olduğu için uç taşımak devrenin yapısını değiştirmez (simülasyon durmaz).
// Ω yalnızca simülasyon durmuşken ölçer: güç kapalı (kaynaklar devreden çıkar), uçlar arasına küçük
// bir test gerilimi uygulanır.

import { tr } from '../../i18n/tr';
import { spotKey } from '../../model/connectivity';
import type { Spot } from '../../model/faults';
import { pinPositions } from '../../model/geometry';
import type { CircuitDoc, Part, Point } from '../../model/types';
import { CircuitSimulator } from '../../sim';
import type { DeviceType, Netlist } from '../../sim/netlist';
import { VOLTMETER_DEFAULTS } from '../../sim/devices/voltmeter';
import { nodeName, type NetIndex } from '../analysis/traces';

export type ProbeColor = 'red' | 'black';
export type MeterMode = 'dc' | 'ac' | 'ohm';
export const METER_MODES: readonly MeterMode[] = ['dc', 'ac', 'ohm'];

/** Şemada bir uç: yeri (bacak ya da kablo) ve işaretin çizildiği nokta. */
export interface Probe {
  readonly spot: Spot;
  readonly at: Point;
}

/** Multimetrenin simülasyondaki kimliği (belgede yok). */
export const METER_ID = 'arıza:multimetre';
/** İç direnç: devredeki voltmetreyle aynı. */
export const METER_RESISTANCE = VOLTMETER_DEFAULTS.resistance;

/**
 * Simülasyona eklenen görünmez voltmetre. Şemanın çok uzağında durur (uçları hiçbir şeye değmez);
 * netlist'te uçları kırmızı ve siyah ucun anahtarlarına bağlanır.
 */
export function meterPart(mode: MeterMode): Part {
  return { id: METER_ID, type: 'voltmeter', label: 'MM', x: -100000, y: -100000, rotation: 0, props: { mode: mode === 'ac' ? 'ac' : 'dc', resistance: METER_RESISTANCE, ideal: false } };
}

/** Simülasyon netlist'inde multimetrenin uçlarını yerleştirir (Ω kipinde ya da uç eksikse boşta kalır). */
export function wireMeter(netlist: Netlist, mode: MeterMode, red: Probe | null, black: Probe | null): Netlist {
  if (mode === 'ohm' || !red || !black) return netlist;
  return { ...netlist, elements: netlist.elements.map((e) => (e.id === METER_ID ? { ...e, pins: [spotKey(red.spot), spotKey(black.spot)] } : e)) };
}

// --- Adlar ------------------------------------------------------------------------------------

/** Kaynak ve cihazların uçları "ucu", öbür parçalarınki "bacağı". */
const TERMINALS: ReadonlySet<DeviceType> = new Set(['battery', 'acsource', 'funcgen', 'dcsupply', 'voltmeter', 'ammeter', 'oscilloscope', 'tank', 'arduino']);

/**
 * Bacağın adı: "RC alt bacağı" (numaralı uçlu iki bacaklı parçada şemadaki konumuna göre), "Q1 kollektör
 * bacağı", "C1 + bacağı", "PS1 1+ ucu"; toprak sembolünde yalnızca adı ("GND1").
 */
export function legLabel(part: Part, pin: number): string {
  if (part.type === 'ground') return part.label;
  const short = (tr.devices.pinShort[part.type]?.[pin] ?? `${pin + 1}. uç`).replace(/^([+−]) uç$/, '$1');
  const word = TERMINALS.has(part.type) ? tr.fault.terminal : tr.fault.leg;
  const positions = pinPositions(part);
  if (/\. uç$/.test(short) && positions.length === 2) {
    const self = positions[pin]!;
    const other = positions[1 - pin]!;
    const vertical = Math.abs(self.y - other.y) >= Math.abs(self.x - other.x);
    const side = vertical ? (self.y > other.y ? tr.fault.side.bottom : tr.fault.side.top) : self.x > other.x ? tr.fault.side.right : tr.fault.side.left;
    return `${part.label} ${side} ${word}`;
  }
  return `${part.label} ${short} ${word}`;
}

/** Ucun yeri: bacak (legLabel) ya da kablo (düğümün adı; toprak ağıysa toprak sembolünün adı). */
export function spotLabel(spot: Spot, doc: CircuitDoc, idx: NetIndex): string {
  if ('part' in spot) {
    const part = doc.parts.find((p) => p.id === spot.part);
    return part ? legLabel(part, spot.pin) : '?';
  }
  const name = nodeName(spotKey(spot), idx);
  return name === '0' ? (doc.parts.find((p) => p.type === 'ground')?.label ?? tr.fault.ground) : name;
}

/** Siyah ucun ilk yeri: toprak sembolü (yoksa boşta). */
export function defaultBlack(doc: CircuitDoc): Probe | null {
  const ground = doc.parts.find((p) => p.type === 'ground');
  const at = ground ? pinPositions(ground)[0] : undefined;
  return ground && at ? { spot: { part: ground.id, pin: 0 }, at } : null;
}

// --- Ω ----------------------------------------------------------------------------------------

/** Güç kapalıyken devreden çıkan kaynaklar. */
const POWER: ReadonlySet<DeviceType> = new Set(['battery', 'acsource', 'funcgen', 'dcsupply', 'arduino']);
/**
 * Ω ölçümünün test gerilimi: el multimetrelerinin direnç kipindeki gibi küçük (silisyum eklemleri
 * iletime sokmaz; diyot kipi ayrı).
 */
export const OHM_TEST_VOLTAGE = 0.3;
/** Bunun üstü "OL" (aralık dışı). */
export const OHM_LIMIT = 40e6;

/**
 * İki nokta arası direnç (Ω), güç kapalıyken: kaynaklar çıkarılır, kondansatörler açık, bobinler kısa
 * devre; uçlar arasına test gerilimi uygulanıp geçen akım ölçülür. Ölçülemezse null, aralık dışıysa
 * Infinity.
 */
export function measureResistance(netlist: Netlist, a: string, b: string): number | null {
  const kept = netlist.elements.filter((e) => !POWER.has(e.type) && e.type !== 'capacitor' && e.type !== 'inductor' && e.id !== METER_ID);
  const shorts = netlist.elements.filter((e) => e.type === 'inductor').map((e) => ({ a: e.pins[0]!, b: e.pins[1]! }));
  const test = { id: 'arıza:ohmmetre', type: 'battery' as const, props: { voltage: OHM_TEST_VOLTAGE, internalResistance: 0 }, pins: [a, b] };
  const sim = new CircuitSimulator({ elements: [...kept, test], links: [...netlist.links, ...shorts] });
  if (!sim.canRun || !sim.runUntil(1e-3).ok) return null;
  const current = Math.abs(sim.measure(test.id)?.current ?? 0);
  const r = OHM_TEST_VOLTAGE / current;
  return r > OHM_LIMIT || !Number.isFinite(r) ? Infinity : r;
}
