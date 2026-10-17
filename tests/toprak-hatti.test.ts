// Fizik 3: görünür toprak hattı. Toprak sembolleri ve topraklı cihazların COM uçları binanın toprak
// hattıyla birbirine bağlı sayılır (Proteus ve SPICE gibi). Aralarında kablo yoksa akım bu hattan
// döner: çözücü her toprak noktasından hatta geçen akımı bulur, eşiği aşarsa mesaj verir; akım
// çizgesi (flow.ts) noktaları en kısa ağaçla birleştirip hattaki akımı da canlandırır.

import { describe, expect, it } from 'vitest';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';
import { buildConnectivity } from '../src/model/connectivity';
import { addPart, addWire } from '../src/model/docOps';
import { buildFlowGraph, solveFlows } from '../src/model/flow';
import { emptyDoc, type CircuitDoc, type Point } from '../src/model/types';
import { CircuitSimulator } from '../src/sim';
import { circuit } from './helpers';

const P = (x: number, y: number): Point => ({ x, y });
const groundReturn = (s: CircuitSimulator) => s.runtimeDiagnostics.find((d) => d.code === 'ground-return');
const lineCurrent = (s: CircuitSimulator) => Math.max(...s.groundLineCurrents().map((p) => Math.abs(p.current)));

/** Ek A, F bölümü: topraklı fonksiyon üreteci, R1 = R2 = 1 kΩ. */
const FG = { waveform: 'sine', frequency: 1000, amplitude: 2, offset: 0, earthed: true };

describe('Fizik 3: toprak hattından dönen akım', () => {
  it('iki toprak sembolü, aralarında kablo yok (9 V, 470 Ω, kırmızı LED): mesaj var, hattan ≈ 15,27 mA geçer', () => {
    const s = new CircuitSimulator(circuit().battery('B', 'a', 'x', 9).ground('G1', 'x').resistor('R', 'a', 'b', 470).led('L', 'b', 'y').ground('G2', 'y').build());
    expect(s.advance(0).ok).toBe(true);
    const current = s.measure('R')!.current;
    expect(current * 1e3).toBeCloseTo(15.27, 1);
    const points = s.groundLineCurrents();
    expect(points).toHaveLength(2);
    // Akım LED'in tarafındaki topraktan hatta girer, pilin tarafındakinden çıkar.
    const byId = new Map(points.map((p) => [p.ids[0], p.current]));
    expect(byId.get('G2')! / current).toBeCloseTo(1, 12);
    expect(byId.get('G1')! / current).toBeCloseTo(-1, 12);
    const d = groundReturn(s)!;
    expect(d).toBeDefined();
    expect([...d.elementIds].sort()).toEqual(['G1', 'G2']);
    expect(d.params?.current).toBeCloseTo(current, 12);
    // Yalnızca toprak sembolleri: şemanın ortak toprak gösterimi, bilgi olarak verilir.
    expect(d.severity).toBe('info');
  });

  it('tek toprak sembollü normal devre: mesaj yok, toprak hattı akımı 0', () => {
    const s = new CircuitSimulator(circuit().battery('B', 'a', 'x', 9).ground('G1', 'x').resistor('R', 'a', 'b', 470).led('L', 'b', 'x').build());
    s.advance(0);
    expect(groundReturn(s)).toBeUndefined();
    expect(lineCurrent(s)).toBeLessThan(1e-15);
  });

  it('aynı kabloya bağlı iki toprak sembolü tek noktadır: mesaj yok', () => {
    const s = new CircuitSimulator(circuit().battery('B', 'a', 'x', 9).ground('G1', 'x').ground('G2', 'x').resistor('R', 'a', 'x', 1000).build());
    s.advance(0);
    expect(s.groundLineCurrents()).toHaveLength(1);
    expect(groundReturn(s)).toBeUndefined();
  });

  it('Ek A F: osiloskobun COM ucu R1 ile R2 arasında: uyarı var, R2 kısa devre', () => {
    const s = new CircuitSimulator(
      circuit().add('funcgen', 'FG', ['o', 't', 'c'], FG).resistor('R1', 'o', 'm', 1000).resistor('R2', 'm', 'c', 1000).voltmeter('V2', 'm', 'c', 'ideal', 'ac')
        .oscilloscope('OS', 'o', 'o', 'm', { earthed: true, input: 'real' }).build(),
    );
    s.advance(0.01);
    s.advance(0.002);
    const d = groundReturn(s)!;
    expect(d).toBeDefined();
    expect(d.severity).toBe('warning');
    expect([...d.elementIds].sort()).toEqual(['FG', 'OS']);
    // Genlik 2 V tepeden tepeye: 1 V tepe / (R1 + üretecin 50 Ω'u) ≈ 0,952 mA hattan geçer;
    // R2'nin iki ucu aynı gerilimde.
    expect(d.params!.current! * 1050).toBeCloseTo(1, 2);
    expect(s.status('V2').reading!).toBeLessThan(1e-3);
  });

  it('osiloskobun COM ucu üretecin COM ucuna bağlı: uyarı yok', () => {
    const s = new CircuitSimulator(
      circuit().add('funcgen', 'FG', ['o', 't', 'c'], FG).resistor('R1', 'o', 'm', 1000).resistor('R2', 'm', 'c', 1000)
        .oscilloscope('OS', 'o', 'm', 'c', { earthed: true, input: 'real' }).build(),
    );
    s.advance(0.01);
    s.advance(0.002);
    expect(s.groundLineCurrents()).toHaveLength(1);
    expect(groundReturn(s)).toBeUndefined();
  });

  it('topraklı osiloskobun kendi giriş akımı (1 MΩ, birkaç µA) toprak hattı akımı sayılmaz', () => {
    // Prob ucu devrede, COM'u başka bir toprak sembolünde: girişten ≈ 4,5 µA hattan döner, ama bu
    // cihazın ölçüm akımıdır; doğru bağlanmış her topraklı prob mesaj vermesin.
    const s = new CircuitSimulator(
      circuit().battery('B', 'a', 'x', 9).ground('G1', 'x').resistor('R1', 'a', 'm', 1000).resistor('R2', 'm', 'x', 1000)
        .oscilloscope('OS', 'm', 'm', 'k', { earthed: true, input: 'real' }).ground('G2', 'k').build(),
    );
    s.advance(0);
    expect(lineCurrent(s)).toBeLessThan(1e-15);
    expect(groundReturn(s)).toBeUndefined();
  });
});

/** Dikey pil (+ üstte), üstte direnç, sağda dikey LED; pilin ve LED'in altında ayrı toprak sembolleri. */
function twoGroundDoc(): CircuitDoc {
  let doc = emptyDoc();
  const b = addPart(doc, 'battery', P(0, 0), 90);
  doc = { ...b.doc, parts: b.doc.parts.map((p) => ({ ...p, props: { voltage: 9, internalResistance: 0 } })) };
  doc = addPart(doc, 'resistor', P(8, -8), 0).doc;
  doc = addPart(doc, 'led', P(16, 0), 90).doc;
  doc = addPart(doc, 'ground', P(0, 8), 0).doc;
  doc = addPart(doc, 'ground', P(16, 8), 0).doc;
  doc = addWire(doc, [P(0, -4), P(0, -8), P(4, -8)]).doc;
  doc = addWire(doc, [P(12, -8), P(16, -8), P(16, -4)]).doc;
  doc = addWire(doc, [P(0, 4), P(0, 8)]).doc;
  doc = addWire(doc, [P(16, 4), P(16, 8)]).doc;
  return doc;
}

describe('Fizik 3: tuvaldeki toprak hattı', () => {
  it('iki ayrı toprak noktası tek bir kesikli toprak hattı parçasıyla birleşir; hattaki akım devre akımıdır', () => {
    const doc = twoGroundDoc();
    const s = new CircuitSimulator(buildConnectivity(doc).netlist);
    expect(s.advance(0).ok).toBe(true);
    const graph = buildFlowGraph(doc);
    const earth = graph.segments.map((seg, i) => [seg, i] as const).filter(([seg]) => seg.earth);
    expect(earth).toHaveLength(1);
    const flows = solveFlows(graph, (id, pin) => (doc.parts.find((p) => p.id === id)?.type === 'ground' ? null : (s.pinCurrents(id)?.[pin] ?? null)));
    const led = doc.parts.find((p) => p.type === 'led')!;
    const current = Math.abs(s.measure(led.id)!.current);
    // Varsayılan direnç 1 kΩ: (9 V − ≈ 1,76 V) / 1 kΩ ≈ 7,2 mA.
    expect(current).toBeGreaterThan(5e-3);
    expect(Math.abs(flows[earth[0]![1]]!) / current).toBeCloseTo(1, 9);
  });

  it('tek toprak noktalı devrede toprak hattı çizilmez', () => {
    let doc = twoGroundDoc();
    // İkinci toprağın yerine LED'den pilin − ucuna kablo
    const second = doc.parts.filter((p) => p.type === 'ground')[1]!;
    doc = { ...doc, parts: doc.parts.filter((p) => p.id !== second.id) };
    doc = addWire(doc, [P(16, 8), P(0, 8)]).doc;
    expect(buildFlowGraph(doc).segments.some((seg) => seg.earth)).toBe(false);
  });

  it('üç toprak noktası en kısa ağaçla iki parçada birleşir', () => {
    let doc = twoGroundDoc();
    doc = addPart(doc, 'ground', P(30, 8), 0).doc;
    const earth = buildFlowGraph(doc).segments.filter((seg) => seg.earth);
    expect(earth).toHaveLength(2);
  });

  it('örneklerde toprak hattı mesajı: yalnızca toprak tuzağında uyarı, baraj ve köprü doğrultmaçta hiç yok', () => {
    const warnings: string[] = [];
    const none = ['kopru-dogrultmac', 'baraj-cubuk', 'baraj-tek-isik'];
    for (const id of EXAMPLE_IDS) {
      const doc = exampleDoc(id)!;
      const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
      sim.advance(sim.isTransient ? 0.02 : 0);
      sim.advance(sim.isTransient ? 0.005 : 0);
      const d = groundReturn(sim);
      if (d?.severity === 'warning') warnings.push(id);
      if (none.includes(id)) expect(d, id).toBeUndefined();
    }
    expect(warnings).toEqual(['toprak-tuzagi']);
  });
});
