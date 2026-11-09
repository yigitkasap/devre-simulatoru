// Simülasyon sırasındaki V/I/P bilgi kutusu ve ölçü aleti ekranları.

import { describe, expect, it } from 'vitest';
import { buildConnectivity } from '../src/model/connectivity';
import { addPart, addWire } from '../src/model/docOps';
import { emptyDoc, type CircuitDoc, type Part, type Point } from '../src/model/types';
import { METER_RESOLUTION, meterText, partReadout } from '../src/editor/readouts';
import { dotSpeed } from '../src/editor/useSimulation';
import { CircuitSimulator } from '../src/sim';

const P = (x: number, y: number): Point => ({ x, y });

function withProps(doc: CircuitDoc, id: string, props: Part['props']): CircuitDoc {
  return { ...doc, parts: doc.parts.map((p) => (p.id === id ? { ...p, props } : p)) };
}

/** 9,4 V ideal pil, 1 kΩ, seri ampermetre (ideal), dirence paralel voltmetre (ideal). */
function meteredCircuit() {
  let doc = emptyDoc();
  const b = addPart(doc, 'battery', P(0, 0), 90);
  doc = withProps(b.doc, b.id, { voltage: 9.4, internalResistance: 0 });
  const am = addPart(doc, 'ammeter', P(8, -8), 0);
  doc = withProps(am.doc, am.id, { ideal: true, resistance: 0.1 });
  const r = addPart(doc, 'resistor', P(16, 0), 90);
  doc = r.doc;
  const vm = addPart(doc, 'voltmeter', P(24, 0), 90);
  doc = withProps(vm.doc, vm.id, { ideal: true, resistance: 10e6 });
  doc = addPart(doc, 'ground', P(0, 8), 0).doc;
  doc = addWire(doc, [P(0, -4), P(0, -8), P(4, -8)]).doc;
  doc = addWire(doc, [P(12, -8), P(16, -8), P(16, -4)]).doc;
  doc = addWire(doc, [P(16, -4), P(24, -4)]).doc;
  doc = addWire(doc, [P(24, 4), P(16, 4)]).doc;
  doc = addWire(doc, [P(16, 4), P(16, 8), P(0, 8)]).doc;
  doc = addWire(doc, [P(0, 4), P(0, 8)]).doc;
  const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
  expect(sim.topologyDiagnostics).toEqual([]);
  expect(sim.advance(0).ok).toBe(true);
  const part = (id: string) => doc.parts.find((p) => p.id === id)!;
  return { sim, part, ids: { battery: b.id, ammeter: am.id, resistor: r.id, voltmeter: vm.id } };
}

describe('Ölçü aleti ekranları', () => {
  it('ampermetre ve voltmetre otomatik ölçekli, 4 anlamlı basamak', () => {
    const { sim, part, ids } = meteredCircuit();
    expect(meterText(part(ids.ammeter), sim.measure(ids.ammeter)!)).toBe('9,400 mA');
    expect(meterText(part(ids.voltmeter), sim.measure(ids.voltmeter)!)).toBe('9,400 V');
    expect(meterText(part(ids.resistor), sim.measure(ids.resistor)!)).toBeNull();
  });
});

describe('V/I/P bilgi kutusu', () => {
  it('dirençte Ohm yasası kontrolü', () => {
    const { sim, part, ids } = meteredCircuit();
    const readout = partReadout(part(ids.resistor), sim.measure(ids.resistor)!)!;
    expect(readout.title).toBe('R1 · Direnç');
    expect(readout.rows).toEqual([
      { label: 'Gerilim', value: '9,400 V' },
      { label: 'Akım', value: '9,400 mA' },
      { label: 'Harcanan güç', value: '88,36 mW' },
    ]);
    expect(readout.note).toBe('V = I · R → 9,40 V = 9,40 mA × 1,00 kΩ');
  });

  it('pilde verilen akım ve güç pozitif', () => {
    const { sim, part, ids } = meteredCircuit();
    const readout = partReadout(part(ids.battery), sim.measure(ids.battery)!)!;
    expect(readout.rows[1]).toEqual({ label: 'Verdiği akım', value: '9,400 mA' });
    expect(readout.rows[2]).toEqual({ label: 'Verdiği güç', value: '88,36 mW' });
  });

  it('ideal voltmetre akım çekmez', () => {
    const { sim, part, ids } = meteredCircuit();
    const readout = partReadout(part(ids.voltmeter), sim.measure(ids.voltmeter)!)!;
    expect(readout.rows[1]).toEqual({ label: 'Devreden çektiği akım', value: '0,000 A' });
    expect(readout.note).toContain('hiç akım çekmez');
  });
});

describe('Ölçü aletinin çözünürlüğü: hesabın kalıntıları 0', () => {
  const meter = (type: 'ammeter' | 'voltmeter' | 'multimeter', props: Part['props'] = {}): Part => ({ id: 'm', type, label: 'M1', x: 0, y: 0, rotation: 0, props });
  const at = (voltage: number, current: number) => ({ voltage, current, power: voltage * current });

  it('çözünürlük 1 nV / 1 nA (4 basamak, en ince aralık µ: son basamak 0,001 µ)', () => {
    expect(METER_RESOLUTION).toBe(1e-9);
  });

  it('ampermetrede "0,003 pA" ve pA kalıntısı 0 gösterilir; 1 nA ve üstü olduğu gibi', () => {
    expect(meterText(meter('ammeter'), at(0, 3e-15))).toBe('0,000 A');
    expect(meterText(meter('ammeter'), at(0, -2.5e-12))).toBe('0,000 A');
    expect(meterText(meter('ammeter'), at(0, 2e-9))).toBe('2,000 nA');
    expect(meterText(meter('ammeter'), at(0, 4.5e-7))).toBe('450,0 nA');
    expect(meterText(meter('multimeter', { mode: 'a' }), at(0, 7e-13))).toBe('0,000 A');
  });

  it('voltmetrede pV kalıntısı 0; AC kipinde de', () => {
    expect(meterText(meter('voltmeter'), at(5e-13, 0))).toBe('0,000 V');
    expect(meterText(meter('voltmeter', { mode: 'ac' }), at(5e-13, 0), { reading: 4e-13 })).toBe('0,000 V~');
    expect(meterText(meter('multimeter'), at(-3e-10, 0))).toBe('0,000 V');
    expect(meterText(meter('voltmeter'), at(1.5e-6, 0))).toBe('1,500 µV');
  });

  it('ölçü aletinin kartındaki satırlar da (anlık, çektiği akım, gerilim düşümü)', () => {
    const v = partReadout(meter('voltmeter'), at(4e-12, 4e-19))!;
    expect(v.rows.map((r) => r.value)).toEqual(['0,000 V', '0,000 A']);
    const a = partReadout(meter('ammeter'), at(3e-16, 3e-15))!;
    expect(a.rows.map((r) => r.value)).toEqual(['0,000 A', '0,000 V']);
  });

  it('açık devrede seri ampermetre: devrede 0 okunur', () => {
    let doc = emptyDoc();
    const b = addPart(doc, 'battery', P(0, 0), 90);
    doc = withProps(b.doc, b.id, { voltage: 9, internalResistance: 0 });
    const am = addPart(doc, 'ammeter', P(8, -8), 0);
    doc = am.doc;
    const r = addPart(doc, 'resistor', P(16, 0), 90);
    doc = r.doc;
    doc = addWire(doc, [P(0, -4), P(0, -8), P(4, -8)]).doc;
    // Ampermetrenin öbür ucu boşta: akım yalnızca hesabın kalıntısı.
    doc = addWire(doc, [P(16, 4), P(16, 8), P(0, 8), P(0, 4)]).doc;
    const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
    sim.advance(0.01);
    const part = doc.parts.find((p) => p.id === am.id)!;
    expect(meterText(part, sim.measure(am.id)!)).toBe('0,000 A');
  });
});

describe('Akım noktaları', () => {
  it('10 nA altında hareketsiz, 1 µA altında neredeyse duruyor (voltmetrenin akımı), üstünde logaritmik hız', () => {
    expect(dotSpeed(2e-11)).toBe(0); // ters diyot sızıntısı
    expect(dotSpeed(9e-9)).toBe(0);
    expect(dotSpeed(0.5e-6)).toBeCloseTo(0.5); // 10 MΩ voltmetre 5 V'ta 0,5 µA: 16 px'lik aralık ≈ 30 s
    expect(dotSpeed(0.9e-6)).toBeLessThan(1);
    expect(dotSpeed(1e-6)).toBeCloseTo(1);
    expect(dotSpeed(1.2e-6)).toBeLessThan(3); // 12 V / 10 MΩ
    expect(dotSpeed(1e-3)).toBeCloseTo(74);
    expect(dotSpeed(1)).toBeCloseTo(147);
    expect(dotSpeed(100)).toBe(150);
    expect(dotSpeed(-1e-3)).toBe(dotSpeed(1e-3));
    // Süreklilik: 1 µA'in iki yanında aynı hız.
    expect(dotSpeed(0.999999e-6)).toBeCloseTo(dotSpeed(1.000001e-6), 4);
  });
});
