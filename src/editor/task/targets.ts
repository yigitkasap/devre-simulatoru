// Görev hedefleri (C1, N5–N6): seçilebilen büyüklükler, adları (alt indis `_{…}` → <sub>), birimleri ve
// öğrenci görünümünde ölçülen değerleri. Canlı büyüklükler simülasyonun karesinden (salınıyorsa
// pencere özeti), Bode hedefleri Analiz → Bode'un son (güncel) ölçümünden; DC çalışma noktası
// transistörün ölçümünün pencere ortalamasından.

import { tr } from '../../i18n/tr';
import type { CircuitDoc, Part } from '../../model/types';
import type { Target, TargetQuantity } from '../../model/task';
import type { TraceDef } from '../../model/analysis';
import { formatNumber, formatSI } from '../../sim/units';
import { bodeSummary, toDb, type BodePoint } from '../analysis/bode';
import { parseTheory } from '../analysis/table';
import { nodeName, type NetIndex } from '../analysis/traces';
import { stableValue } from '../liveReadout';
import type { SimFrame } from '../useSimulation';

const TRANSISTORS: ReadonlySet<string> = new Set(['npn', 'pnp', 'njfet', 'pjfet', 'nmos', 'pmos']);
const NO_MEASURE: ReadonlySet<string> = new Set(['ground', 'oscilloscope', 'funcgen', 'dcsupply', 'arduino', 'tank']);

export interface TargetOption {
  readonly key: string;
  readonly q: TargetQuantity;
  /** Alt indisli ad (Rich) ve <option> için düz metin. */
  readonly name: string;
  readonly unit: string;
  readonly group: string;
}

const qName = (part: Part, axis: 'v' | 'i') => {
  const fet = part.type.endsWith('jfet') || part.type.endsWith('mos');
  return axis === 'v' ? (fet ? 'V_{DS}' : 'V_{CE}') : fet ? 'I_{D}' : 'I_{C}';
};

export const quantityKey = (q: TargetQuantity): string => JSON.stringify(q);

/** Hocanın seçebileceği hedefler: parça ölçümleri, düğüm gerilimleri (fark gerilimleri Grafik izlerinden), Bode, DC çalışma noktası. */
export function targetOptions(doc: CircuitDoc, idx: NetIndex, traces: readonly TraceDef[]): TargetOption[] {
  const t = tr.task.quantity;
  const out: TargetOption[] = [];
  for (const p of doc.parts) {
    if (!TRANSISTORS.has(p.type)) continue;
    for (const axis of ['v', 'i'] as const) {
      const q: TargetQuantity = { kind: 'q', part: p.id, axis };
      out.push({ key: quantityKey(q), q, name: t.q(qName(p, axis), p.label), unit: axis === 'v' ? 'V' : 'A', group: t.groups.q });
    }
  }
  for (const measure of ['gain', 'gainDb', 'fH'] as const) {
    const q: TargetQuantity = { kind: 'bode', measure };
    out.push({ key: quantityKey(q), q, name: t.bode[measure], unit: measure === 'gain' ? '' : measure === 'gainDb' ? 'dB' : 'Hz', group: t.groups.bode });
  }
  // Düğüm gerilimleri: devredeki her düğüm (toprağa göre); fark gerilimleri Grafik izlerinden.
  const seen = new Set<number>();
  const wired = new Set(doc.wires.map((w) => idx.netOf(`w:${w.id}`)));
  for (const p of doc.parts) {
    for (let pin = 0; idx.netOf(`${p.id}#${pin}`) !== undefined; pin++) {
      const net = idx.netOf(`${p.id}#${pin}`)!;
      if (net === idx.ground || seen.has(net) || !wired.has(net)) continue;
      seen.add(net);
      const q: TargetQuantity = { kind: 'node', node: `${p.id}#${pin}`, ref: null };
      out.push({ key: quantityKey(q), q, name: nodeLabel(q, idx), unit: 'V', group: t.groups.node });
    }
  }
  for (const tr0 of traces) {
    if (tr0.kind !== 'voltage' || !tr0.ref) continue;
    const q: TargetQuantity = { kind: 'node', node: tr0.node, ref: tr0.ref };
    out.push({ key: quantityKey(q), q, name: nodeLabel(q, idx), unit: 'V', group: t.groups.node });
  }
  for (const p of doc.parts) {
    if (NO_MEASURE.has(p.type)) continue;
    for (const measure of ['voltage', 'current', 'power'] as const) {
      const q: TargetQuantity = { kind: 'part', part: p.id, measure };
      out.push({ key: quantityKey(q), q, name: t.part[measure](p.label), unit: measure === 'voltage' ? 'V' : measure === 'current' ? 'A' : 'W', group: t.groups.part });
    }
  }
  return out;
}

const nodeLabel = (q: Extract<TargetQuantity, { kind: 'node' }>, idx: NetIndex) => (q.ref ? `V(${nodeName(q.node, idx)}, ${nodeName(q.ref, idx)})` : `V(${nodeName(q.node, idx)})`);

/** Hedefin adı (alt indisli) ve birimi. */
export function targetName(q: TargetQuantity, doc: CircuitDoc, idx: NetIndex): { name: string; unit: string } {
  const t = tr.task.quantity;
  const part = 'part' in q ? doc.parts.find((p) => p.id === q.part) : undefined;
  if (q.kind === 'part') return { name: t.part[q.measure](part?.label ?? '?'), unit: q.measure === 'voltage' ? 'V' : q.measure === 'current' ? 'A' : 'W' };
  if (q.kind === 'q') return { name: part ? t.q(qName(part, q.axis), part.label) : '?', unit: q.axis === 'v' ? 'V' : 'A' };
  if (q.kind === 'bode') return { name: t.bode[q.measure], unit: q.measure === 'gain' ? '' : q.measure === 'gainDb' ? 'dB' : 'Hz' };
  return { name: nodeLabel(q, idx), unit: 'V' };
}

/** Değerin yazısı: birimli (SI önekli), kazançta birimsiz. */
export function valueText(v: number, unit: string): string {
  if (unit === '') return formatNumber(v, Math.abs(v) >= 100 ? 1 : 2).replace(/,0+$/, '');
  if (unit === 'dB') return `${formatNumber(v, 1)} dB`;
  return formatSI(v, unit, { digits: 3, trim: true });
}

/**
 * Tahmin kutusundaki yazı ("6 V", "5,9", "500k"; birim hedefinki, dB'de birimsiz): boşsa değer yok,
 * okunamıyorsa geçersiz. Yazarken her harfte okunur (analiz düzeltmeleri, 5).
 */
export function readPrediction(text: string, unit: string): { value: number | null; invalid: boolean } {
  if (text.trim() === '') return { value: null, invalid: false };
  const v = parseTheory(text, unit === 'dB' ? '' : unit);
  return v === null ? { value: null, invalid: true } : { value: v, invalid: false };
}

/** "Hedef 6 V ± %10", "Hedef ≥ 500 kHz". */
export function goalText(t: Target, unit: string): string {
  const v = valueText(t.value, unit);
  if (t.op === 'ge') return tr.task.goal(`≥ ${v}`);
  if (t.op === 'le') return tr.task.goal(`≤ ${v}`);
  return tr.task.goal(`${v} ± %${formatNumber(t.tol, t.tol % 1 === 0 ? 0 : 1)}`);
}

/** Simülasyondaki karşılığı izlenmesi gereken parçalar (canlı hedefler). */
export function targetParts(targets: readonly Target[]): string[] {
  return targets.flatMap((t) => ('part' in t.q ? [t.q.part] : []));
}

/** Öğrenci görünümünde ölçülen değer; ölçülemiyorsa (simülasyon durmuş, Bode ölçülmemiş) null. */
export function measureTarget(q: TargetQuantity, frame: SimFrame | null, doc: CircuitDoc, idx: NetIndex, bode: readonly BodePoint[] | null): number | null {
  if (q.kind === 'bode') {
    const s = bode && bode.length > 0 ? bodeSummary(bode) : null;
    if (!s) return null;
    return q.measure === 'gain' ? s.mid.gain : q.measure === 'gainDb' ? toDb(s.mid.gain) : s.fH;
  }
  if (!frame) return null;
  if (q.kind === 'node') {
    const at = (key: string) => {
      const net = idx.netOf(key);
      if (net === undefined) return null;
      if (net === idx.ground) return 0;
      const wire = doc.wires.find((w) => idx.netOf(`w:${w.id}`) === net);
      if (!wire) return null;
      return frame.wireSummaries.get(wire.id)?.mean ?? frame.wireVoltages.get(wire.id) ?? null;
    };
    const a = at(q.node);
    const b = q.ref ? at(q.ref) : 0;
    return a === null || b === null ? null : a - b;
  }
  const m = frame.measurements.get(q.part);
  if (!m) return null;
  const stats = frame.summaries.get(q.part);
  if (q.kind === 'q') {
    // DC çalışma noktası: pencerenin ortalaması (AC sinyal üstüne binmişse de).
    const s = stats?.get(q.axis === 'v' ? 'm.voltage' : 'm.current');
    const live = q.axis === 'v' ? m.voltage : m.current;
    return s && s.kind === 'number' && s.time > 0 ? s.sum / s.time : live;
  }
  const key = q.measure === 'voltage' ? 'm.voltage' : q.measure === 'current' ? 'm.current' : 'm.power';
  const live = q.measure === 'voltage' ? m.voltage : q.measure === 'current' ? m.current : m.power;
  return stableValue(live, stats?.get(key)).value;
}
