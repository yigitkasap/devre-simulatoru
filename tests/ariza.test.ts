// Arıza bulma (B2), 1. aşama: arıza netlist kurulurken uygulanır, şema ve motor değişmez.
// Örnek senaryo (docs/tasarim-v3 "Arıza bulma"): BC107 yükselteçte RC'nin kollektör tarafındaki bacağı
// kopuk → VC ≈ 0,01 V, VB ≈ 0,55 V, Q1 doyumda; kopuk uçta 10 MΩ'lık ölçüm 12 V × 10 MΩ / (10 MΩ +
// 5,6 kΩ) ≈ 11,99 V.

import { describe, expect, it } from 'vitest';
import { atOperatingPoint } from '../src/editor/analysis/bode';
import { exampleDoc, type ExampleId } from '../src/examples';
import { buildConnectivity, pinKey, wireKey } from '../src/model/connectivity';
import { faultFits, faultValid, type Fault } from '../src/model/faults';
import { pinPositions } from '../src/model/geometry';
import type { CircuitDoc } from '../src/model/types';
import { CircuitSimulator } from '../src/sim';

const partId = (doc: CircuitDoc, label: string) => doc.parts.find((p) => p.label === label)!.id;

/** Arızalı devreyi DC çalışma noktasında başlatır; `meter` verilirse oraya topraktan 10 MΩ'lık voltmetre. */
function run(doc: CircuitDoc, faults: readonly Fault[], meter?: string, seconds = 0.2): CircuitSimulator {
  let netlist = buildConnectivity(doc, faults).netlist;
  if (meter) {
    const ground = pinKey(partId(doc, 'GND1'), 0);
    netlist = { ...netlist, elements: [...netlist.elements, { id: 'olcum', type: 'voltmeter', props: { mode: 'dc', resistance: 10e6 }, pins: [meter, ground] }] };
  }
  const sim = new CircuitSimulator(atOperatingPoint(netlist));
  expect(sim.runUntil(seconds).ok).toBe(true);
  return sim;
}
const reading = (sim: CircuitSimulator, id: string) => sim.status(id).reading ?? NaN;

describe('Arıza bulma: arıza netlist kurulurken uygulanır', () => {
  const doc = exampleDoc('bjt-yukseltec')!;
  const RC = partId(doc, 'RC');
  const Q1 = partId(doc, 'Q1');
  const open: Fault = { kind: 'open', at: { part: RC, pin: 1 } };

  it('RC’nin 1. bacağı kollektör tarafında (Q1 kollektörüne giden kablonun başında)', () => {
    const rc = doc.parts.find((p) => p.id === RC)!;
    const toCollector = doc.wires.find((w) => w.points.some((p) => p.x === 44 && p.y === 0))!;
    expect(pinPositions(rc)[1]).toEqual(toCollector.points[0]);
    expect(faultValid(open, doc)).toBe(true);
  });

  it('sağlam devre (DC voltmetreyle, çıkıştaki AC ortalanır): VC ≈ 5,99 V, VB ≈ 0,64 V, Q1 aktif', () => {
    expect(reading(run(doc, [], pinKey(Q1, 0)), 'olcum')).toBeCloseTo(5.99, 1);
    const sim = run(doc, [], pinKey(Q1, 1));
    expect(reading(sim, 'olcum')).toBeCloseTo(0.64, 2);
    expect(sim.status(Q1).region).toBe('active');
  });

  it('RC kollektör bacağı kopuk: VC ≈ 0,01 V, VB ≈ 0,55 V, Q1 doyumda; kopuk uçta 10 MΩ ile 11,99 V, yanındaki düğümde 0,01 V', () => {
    const sim = run(doc, [open]);
    const vc = sim.voltageAt(pinKey(Q1, 0))!;
    const vb = sim.voltageAt(pinKey(Q1, 1))!;
    expect(Math.abs(vc - 0.01)).toBeLessThan(0.006);
    expect(vb).toBeCloseTo(0.55, 2);
    expect(sim.status(Q1).region).toBe('saturation');
    // Bacak ile bağlı olduğu düğüm ayrı okunur: aynı noktada iki farklı gerilim.
    const leg = run(doc, [open], pinKey(RC, 1));
    expect(reading(leg, 'olcum')).toBeCloseTo((12 * 10e6) / (10e6 + 5600), 2);
    const node = run(doc, [open], wireKey(doc.wires.find((w) => w.points.some((p) => p.x === 44 && p.y === 0))!.id));
    expect(Math.abs(reading(node, 'olcum') - 0.01)).toBeLessThan(0.006);
  });

  it('şemanın çizimi ve uyarıları değişmez (kavşaklar, bağlanmamış uçlar)', () => {
    const a = buildConnectivity(doc);
    const b = buildConnectivity(doc, [open]);
    expect(b.junctions).toEqual(a.junctions);
    expect([...b.unconnectedPins]).toEqual([...a.unconnectedPins]);
    expect(b.danglingEnds).toEqual(a.danglingEnds);
    expect(b.netlist.elements.length).toBe(a.netlist.elements.length);
  });

  it('kopuk kablo ucu: kablonun kendisi öbür ucundaki düğümde, kopuk uçtaki bacak ayrı kalır', () => {
    // RC'yi kollektöre bağlayan kablo (w3) kollektör ucunda kopuk: devre RC bacağı kopukmuş gibi davranır.
    const w = doc.wires.find((x) => x.points.some((p) => p.x === 44 && p.y === 0))!;
    const fault: Fault = { kind: 'open', at: { wire: w.id, end: 1 } };
    expect(faultValid(fault, doc)).toBe(true);
    const sim = run(doc, [fault]);
    expect(sim.voltageAt(pinKey(Q1, 0))!).toBeLessThan(0.05);
    expect(sim.voltageAt(wireKey(w.id))!).toBeGreaterThan(11.9);
  });

  it('kısa devre: Q1 kollektörü ile emetörü arası → VC = 0', () => {
    const sim = run(doc, [{ kind: 'short', at: { part: Q1, pin: 0 }, to: { part: Q1, pin: 2 } }]);
    expect(Math.abs(sim.voltageAt(pinKey(Q1, 0))!)).toBeLessThan(1e-6);
  });

  it('yanlış değer: RC 5,6 kΩ yerine 560 Ω → kollektör beslemeye yaklaşır (VC ≈ 11,4 V)', () => {
    const fault: Fault = { kind: 'value', part: RC, value: 560 };
    expect(faultValid(fault, doc)).toBe(true);
    const vc = run(doc, [fault]).voltageAt(pinKey(Q1, 0))!;
    expect(vc).toBeGreaterThan(11);
    expect(vc).toBeLessThan(11.8);
    // Belge değişmez.
    expect(doc.parts.find((p) => p.id === RC)!.props.resistance).toBe(5600);
  });

  it.each([
    ['diyot-yonu', 'D1', 'reversed'],
    ['led-on-direnc', 'LED1', 'reversed'],
    ['led-on-direnc', 'LED1', 'burnt'],
  ] as const)('%s: %s %s → ampermetre akım göstermez', (example, label, kind) => {
    const d = exampleDoc(example as ExampleId)!;
    const id = partId(d, label);
    const fault: Fault = { kind, part: id };
    expect(faultValid(fault, d)).toBe(true);
    const ammeter = partId(d, 'A1');
    expect(Math.abs(reading(run(d, []), ammeter))).toBeGreaterThan(1e-3);
    expect(Math.abs(reading(run(d, [fault]), ammeter))).toBeLessThan(1e-6);
  });

  it('tür parçaya uygun olmalı: dirence ters takılma ya da yanma olmaz; kutupsuz kondansatör ters takılmaz', () => {
    const rc = doc.parts.find((p) => p.id === RC)!;
    expect(faultFits('reversed', rc)).toBe(false);
    expect(faultFits('burnt', rc)).toBe(false);
    expect(faultFits('value', rc)).toBe(true);
    const c1 = doc.parts.find((p) => p.label === 'C1')!;
    expect(faultFits('reversed', c1)).toBe(true);
    expect(faultFits('reversed', { ...c1, props: { ...c1.props, kind: 'film' } })).toBe(false);
    expect(faultValid({ kind: 'open', at: { part: RC, pin: 2 } }, doc)).toBe(false);
    expect(faultValid({ kind: 'open', at: { wire: 'w1' } }, doc)).toBe(false);
    expect(faultValid({ kind: 'value', part: RC, value: -1 }, doc)).toBe(false);
  });
});
