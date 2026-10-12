// Kablo akım dağılımı ve belge kaydı.

import { describe, expect, it } from 'vitest';
import { buildConnectivity, pinKey } from '../src/model/connectivity';
import { addPart, addWire } from '../src/model/docOps';
import { buildFlowGraph, solveFlows } from '../src/model/flow';
import { parseDoc, serializeDoc, structureKey } from '../src/model/serialize';
import { emptyDoc, type CircuitDoc, type Point } from '../src/model/types';
import { CircuitSimulator } from '../src/sim';

const P = (x: number, y: number): Point => ({ x, y });

/** Dikey pil (+ üstte), üstte yatay direnç, sağda dikey direnç, altta toprak. */
function seriesCircuit(): { doc: CircuitDoc; battery: string; r1: string; r2: string } {
  let doc = emptyDoc();
  const b = addPart(doc, 'battery', P(0, 0), 90);
  doc = { ...b.doc, parts: b.doc.parts.map((p) => ({ ...p, props: { voltage: 10, internalResistance: 0 } })) };
  const r1 = addPart(doc, 'resistor', P(8, -8), 0);
  const r2 = addPart(r1.doc, 'resistor', P(16, 0), 90);
  doc = addPart(r2.doc, 'ground', P(0, 8), 0).doc;
  doc = addWire(doc, [P(0, -4), P(0, -8), P(4, -8)]).doc; // + → R1
  doc = addWire(doc, [P(12, -8), P(16, -8), P(16, -4)]).doc; // R1 → R2
  doc = addWire(doc, [P(16, 4), P(16, 8), P(0, 8)]).doc; // R2 → toprak
  doc = addWire(doc, [P(0, 4), P(0, 8)]).doc; // − → toprak (T değil, uç uca)
  return { doc, battery: b.id, r1: r1.id, r2: r2.id };
}

function simulate(doc: CircuitDoc) {
  const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
  expect(sim.advance(0).ok).toBe(true);
  return sim;
}

describe('Kablo akımları', () => {
  it('seri devrede her kablo parçasından aynı akım, doğru yönde geçer', () => {
    const { doc } = seriesCircuit();
    const sim = simulate(doc);
    const graph = buildFlowGraph(doc);
    const flows = solveFlows(graph, (id, pin) => {
      const m = sim.measure(id);
      if (!m || doc.parts.find((p) => p.id === id)?.type === 'ground') return null;
      return pin === 0 ? m.current : -m.current;
    });
    const byKey = new Map(graph.segments.map((s, i) => [s.key, flows[i]!]));
    // 10 V / 2 kΩ = 5 mA. w1: + uçtan yukarı (0,-4)→(0,-8) parçası a→b yönünde
    expect(byKey.get('w1:0:0')).toBeCloseTo(5e-3, 9);
    expect(byKey.get('w1:1:0')).toBeCloseTo(5e-3, 9);
    expect(byKey.get('w2:1:0')).toBeCloseTo(5e-3, 9);
    // w3: R2'den toprağa doğru akar
    expect(byKey.get('w3:0:0')).toBeCloseTo(5e-3, 9);
    expect(byKey.get('w3:1:0')).toBeCloseTo(5e-3, 9);
    // w4: topraktan pilin − ucuna (b→a yönünde, yani negatif)
    expect(byKey.get('w4:0:0')).toBeCloseTo(-5e-3, 9);
  });

  it('T bağlantısında akım bölünür', () => {
    let doc = emptyDoc();
    const b = addPart(doc, 'battery', P(0, 0), 90);
    doc = { ...b.doc, parts: b.doc.parts.map((p) => ({ ...p, props: { voltage: 10, internalResistance: 0 } })) };
    const r1 = addPart(doc, 'resistor', P(10, 0), 90); // pinler (10,-4) (10,4)
    const r2 = addPart(r1.doc, 'resistor', P(20, 0), 90); // pinler (20,-4) (20,4)
    doc = addPart(r2.doc, 'ground', P(0, 6), 0).doc;
    doc = addWire(doc, [P(0, -4), P(0, -8), P(20, -8), P(20, -4)]).doc; // üst ray
    doc = addWire(doc, [P(10, -4), P(10, -8)]).doc; // R1'e T
    doc = addWire(doc, [P(0, 4), P(0, 6)]).doc;
    doc = addWire(doc, [P(10, 4), P(10, 6), P(0, 6)]).doc;
    doc = addWire(doc, [P(20, 4), P(20, 6), P(10, 6)]).doc;
    const sim = simulate(doc);
    expect(sim.voltageAt(pinKey(r2.id, 0))).toBeCloseTo(10, 6);
    const graph = buildFlowGraph(doc);
    const flows = solveFlows(graph, (id, pin) => {
      if (doc.parts.find((p) => p.id === id)?.type === 'ground') return null;
      const m = sim.measure(id)!;
      return pin === 0 ? m.current : -m.current;
    });
    const byKey = new Map(graph.segments.map((s, i) => [s.key, flows[i]!]));
    // Üst rayın yatay parçası T noktasında (10,-8) ikiye bölünür: 20 mA, sonra 10 mA
    expect(byKey.get('w1:1:0')).toBeCloseTo(20e-3, 9);
    expect(byKey.get('w1:1:1')).toBeCloseTo(10e-3, 9);
    // T kablosu R1'e doğru (aşağı): a=(10,-4) → b=(10,-8) yönünün tersi
    expect(byKey.get('w2:0:0')).toBeCloseTo(-10e-3, 9);
  });
});

describe('Belge kaydı', () => {
  it('kaydedilen belge aynen geri okunur', () => {
    const { doc } = seriesCircuit();
    const back = parseDoc(JSON.parse(serializeDoc(doc)));
    expect(back).toEqual(doc);
    expect(structureKey(back!)).toBe(structureKey(doc));
  });

  it('bozuk veri reddedilir', () => {
    expect(parseDoc(null)).toBeNull();
    expect(parseDoc({ version: 2, parts: [], wires: [] })).toBeNull();
    expect(parseDoc({ version: 1, parts: [{ id: 'p1', type: 'transistor' }], wires: [] })).toBeNull();
    expect(
      parseDoc({ version: 1, parts: [], wires: [{ id: 'w1', points: [[0, 0], [1.5, 0]] }] }),
    ).toBeNull();
  });

  it('değer değişikliği yapıyı değiştirmez, taşıma değiştirir', () => {
    const { doc, r1 } = seriesCircuit();
    const changedValue = { ...doc, parts: doc.parts.map((p) => (p.id === r1 ? { ...p, props: { resistance: 5 } } : p)) };
    expect(structureKey(changedValue)).toBe(structureKey(doc));
    const moved = { ...doc, parts: doc.parts.map((p) => (p.id === r1 ? { ...p, x: p.x + 1 } : p)) };
    expect(structureKey(moved)).not.toBe(structureKey(doc));
  });
});
