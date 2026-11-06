// Bir değeri tarayarak (analiz v2): devrenin DC çalışma noktası, bir değer (kaynak çıkışı, pil, üretecin
// ofseti, potansiyometre konumu, direnç) adım adım değiştirilerek. Her adımda AC kaynakların ve üretecin
// sinyali sıfır (yalnız ofset), kondansatörler açık devre, bobinler kısa devre; güç kaynağının akım sınırı
// geçerli; her nokta bir öncekinin çözümünden başlar (motorun update()'i durumu korur). İsteğe bağlı ikinci
// değer her eğri için bir kez ayarlanır (eğri ailesi). Uzun tarama Web Worker'da (sweep.worker.ts).

import { tr } from '../../i18n/tr';
import type { Quantity, SweepParam, SweepRange } from '../../model/analysis';
import { CATALOG } from '../../model/catalog';
import type { CircuitDoc, Part } from '../../model/types';
import { CircuitSimulator, type Netlist } from '../../sim';
import { traceValue } from './recorder';

/** Taranabilen değerler: parça türü → özellik. */
const SWEEPABLE: Readonly<Partial<Record<Part['type'], readonly string[]>>> = {
  dcsupply: ['voltage1', 'voltage2'],
  battery: ['voltage'],
  funcgen: ['offset'],
  potentiometer: ['position'],
  resistor: ['resistance'],
  currentsource: ['current'],
};

export interface SweepParamOption {
  readonly param: SweepParam;
  /** "PS1 · 1. çıkış", "RD · direnç". */
  readonly name: string;
  readonly unit: string;
  /** Şu anki değeri (varsayılan aralığın ucu). */
  readonly value: number;
}

/** Devredeki taranabilen değerler (parçanın adına göre sıralı). */
export function sweepParams(doc: CircuitDoc): SweepParamOption[] {
  const out: SweepParamOption[] = [];
  const parts = [...doc.parts].sort((a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true }));
  for (const part of parts) {
    for (const prop of SWEEPABLE[part.type] ?? []) {
      const def = CATALOG[part.type].propDefs.find((d) => d.key === prop);
      const value = part.props[prop] ?? CATALOG[part.type].defaultProps[prop];
      out.push({ param: { part: part.id, prop }, name: `${part.label} · ${tr.analysis.sweep.props[prop] ?? prop}`, unit: def?.kind === 'number' ? def.unit : '', value: typeof value === 'number' ? value : 0 });
    }
  }
  return out;
}

/** Bir aralığın değerleri (uçlar dahil; adım işaretten bağımsız). */
export function rangeValues(r: SweepRange): number[] {
  const step = Math.abs(r.step);
  if (!(step > 0) || !Number.isFinite(r.from) || !Number.isFinite(r.to)) return [r.from];
  const n = Math.floor(Math.abs(r.to - r.from) / step + 1e-9);
  const dir = r.to >= r.from ? 1 : -1;
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(Number((r.from + dir * i * step).toPrecision(12)));
  if (Math.abs(out[out.length - 1]! - r.to) > step * 1e-6) out.push(r.to);
  return out;
}

/** Bütün aralıkların değerleri sırayla; bir aralığın başı öncekinin sonuyla aynıysa bir kez. */
export function sweepValues(ranges: readonly SweepRange[]): number[] {
  const out: number[] = [];
  for (const r of ranges) for (const v of rangeValues(r)) if (out.length === 0 || Math.abs(out[out.length - 1]! - v) > 1e-12) out.push(v);
  return out;
}

/** En çok nokta (bütün eğrilerin toplamı). */
export const MAX_SWEEP_POINTS = 4000;

/** DC çalışma noktası için devre: AC sinyaller sıfır, kondansatörler açık, bobinler kısa devre. */
export function dcNetlist(netlist: Netlist): Netlist {
  return {
    elements: netlist.elements
      .filter((e) => e.type !== 'capacitor' && e.type !== 'inductor')
      .map((e) => (e.type === 'acsource' || e.type === 'funcgen' ? { ...e, props: { ...e.props, amplitude: 0 } } : e)),
    links: [...netlist.links, ...netlist.elements.filter((e) => e.type === 'inductor').map((e) => ({ a: e.pins[0]!, b: e.pins[1]! }))],
  };
}

export interface DcSweepRequest {
  readonly netlist: Netlist;
  readonly param: SweepParam;
  readonly ranges: readonly SweepRange[];
  /** Her eğri için ikinci değer ve değerleri (eğri ailesi); null: tek eğri. */
  readonly family: { readonly param: SweepParam; readonly values: readonly number[] } | null;
  /** Yatay eksen: null ise taranan değer. */
  readonly x: Quantity | null;
  readonly y: readonly Quantity[];
}

export interface DcSweepCurve {
  /** Eğrinin ikinci değeri (ailede); tek eğride null. */
  readonly step: number | null;
  /** Her nokta: [taranan değer, x, y₁, y₂, …] (x taranan değerse ikisi aynı). */
  readonly points: readonly (readonly number[])[];
}

function withProp(netlist: Netlist, p: SweepParam, value: number): Netlist {
  return { ...netlist, elements: netlist.elements.map((e) => (e.id === p.part ? { ...e, props: { ...e.props, [p.prop]: value } } : e)) };
}

/**
 * Noktada oturtma: zamana bağlı durumu olmayan devrede tek çözüm; olanda (lamba filamanı, motor…)
 * okunan büyüklükler iki katına çıkan aralıklarla (1 ms'den en çok 2 s) değişmeyene kadar ilerletilir.
 */
function settle(sim: CircuitSimulator, read: () => number[]): boolean {
  if (!sim.isTransient) return sim.advance(0).ok;
  let previous = read();
  for (let dt = 1e-3; dt <= 2; dt *= 2) {
    if (!sim.runUntil(sim.time + dt).ok) return false;
    const now = read();
    if (now.every((v, i) => Math.abs(v - previous[i]!) <= 1e-6 * Math.max(1, Math.abs(v)) || !Number.isFinite(v))) return true;
    previous = now;
  }
  return true;
}

/** Taramayı yapar (eğri eğri). onProgress her noktada; cancelled true dönerse durur. Çözüm bulunamayan noktada eğri biter. */
export function runDcSweep(req: DcSweepRequest, onProgress?: (done: number, total: number) => void, cancelled?: () => boolean): DcSweepCurve[] {
  const xs = sweepValues(req.ranges);
  const steps: (number | null)[] = req.family ? [...req.family.values] : [null];
  const total = Math.min(MAX_SWEEP_POINTS, xs.length * steps.length);
  const base = dcNetlist(req.netlist);
  const curves: DcSweepCurve[] = [];
  let done = 0;
  for (const step of steps) {
    const points: number[][] = [];
    let sim: CircuitSimulator | null = null;
    const familyNetlist = step !== null && req.family ? withProp(base, req.family.param, step) : base;
    for (const v of xs) {
      if (cancelled?.() || done >= MAX_SWEEP_POINTS) return [...curves, { step, points }];
      const netlist = withProp(familyNetlist, req.param, v);
      if (!sim) {
        sim = new CircuitSimulator(netlist);
        if (!sim.canRun) break;
      } else sim.update(netlist);
      const s = sim;
      const read = () => [req.x ? traceValue(s, req.x) : v, ...req.y.map((q) => traceValue(s, q))];
      if (!settle(s, read)) break;
      points.push([v, ...read()]);
      done++;
      onProgress?.(done, total);
    }
    curves.push({ step, points });
  }
  return curves;
}
