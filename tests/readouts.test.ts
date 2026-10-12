// Simülasyon sırasındaki V/I/P bilgi kutusu ve ölçü aleti ekranları.

import { describe, expect, it } from 'vitest';
import { buildConnectivity } from '../src/model/connectivity';
import { addPart, addWire } from '../src/model/docOps';
import { emptyDoc, type CircuitDoc, type Part, type Point } from '../src/model/types';
import { meterText, partReadout } from '../src/editor/readouts';
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
      { label: 'Gerilim', value: '9,40 V' },
      { label: 'Akım', value: '9,40 mA' },
      { label: 'Harcanan güç', value: '88,4 mW' },
    ]);
    expect(readout.note).toBe('V = I · R → 9,40 V = 9,40 mA × 1,00 kΩ');
  });

  it('pilde verilen akım ve güç pozitif', () => {
    const { sim, part, ids } = meteredCircuit();
    const readout = partReadout(part(ids.battery), sim.measure(ids.battery)!)!;
    expect(readout.rows[1]).toEqual({ label: 'Verdiği akım', value: '9,40 mA' });
    expect(readout.rows[2]).toEqual({ label: 'Verdiği güç', value: '88,4 mW' });
  });

  it('ideal voltmetre akım çekmez', () => {
    const { sim, part, ids } = meteredCircuit();
    const readout = partReadout(part(ids.voltmeter), sim.measure(ids.voltmeter)!)!;
    expect(readout.rows[1]).toEqual({ label: 'Devreden çektiği akım', value: '0,00 A' });
    expect(readout.note).toContain('hiç akım çekmez');
  });
});

describe('Akım noktaları', () => {
  it('10 nA altında hareketsiz, voltmetrenin µA akımı görünür, logaritmik hız', () => {
    expect(dotSpeed(2e-11)).toBe(0); // ters diyot sızıntısı
    expect(dotSpeed(9e-9)).toBe(0);
    expect(dotSpeed(1e-6)).toBeCloseTo(8); // 10 MΩ voltmetre ≈ 1 µA
    expect(dotSpeed(1e-3)).toBeCloseTo(74);
    expect(dotSpeed(1)).toBeCloseTo(140);
    expect(dotSpeed(-1e-3)).toBe(dotSpeed(1e-3));
  });
});
