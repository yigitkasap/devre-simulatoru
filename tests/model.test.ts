// Şema modeli: geometriden bağlantı listesine dönüşüm ve kablo işlemleri.

import { describe, expect, it } from 'vitest';
import { buildConnectivity, pinKey, wireKey } from '../src/model/connectivity';
import { addPart, addWire, moveSelection, nextLabel, rotateParts, rotatePartsBy } from '../src/model/docOps';
import { pinPositions } from '../src/model/geometry';
import { emptyDoc, type CircuitDoc, type Point } from '../src/model/types';
import { moveEndpoint, moveSegment, normalizePoints, routeL } from '../src/model/wires';
import { CircuitSimulator } from '../src/sim';

const P = (x: number, y: number): Point => ({ x, y });

function place(doc: CircuitDoc, type: Parameters<typeof addPart>[1], x: number, y: number, rotation: 0 | 90 | 180 | 270 = 0) {
  return addPart(doc, type, P(x, y), rotation);
}

describe('Kablo yardımcıları', () => {
  it('sadeleştirme: tekrar eden ve aynı doğrudaki ara köşeler kalkar', () => {
    expect(normalizePoints([P(0, 0), P(0, 0), P(2, 0), P(5, 0), P(5, 3)])).toEqual([P(0, 0), P(5, 0), P(5, 3)]);
    // Geri dönen kıvrım korunur
    expect(normalizePoints([P(0, 0), P(5, 0), P(2, 0)])).toEqual([P(0, 0), P(5, 0), P(2, 0)]);
  });

  it('L biçimli yol', () => {
    expect(routeL(P(0, 0), P(5, 0))).toEqual([P(5, 0)]);
    expect(routeL(P(0, 0), P(5, 2))).toEqual([P(5, 0), P(5, 2)]);
    expect(routeL(P(0, 0), P(2, 5))).toEqual([P(0, 5), P(2, 5)]);
  });

  it('uç esnetme yatay/dikey düzeni korur', () => {
    // Tek parça eğik kalacaksa köşe eklenir
    expect(moveEndpoint([P(0, 0), P(10, 0)], 'end', P(10, 3))).toEqual([P(0, 0), P(10, 0), P(10, 3)]);
    // Üç noktalı kabloda komşu köşe kayar
    expect(moveEndpoint([P(0, 0), P(10, 0), P(10, 5)], 'end', P(12, 5))).toEqual([P(0, 0), P(12, 0), P(12, 5)]);
    expect(moveEndpoint([P(0, 0), P(10, 0), P(10, 5)], 'start', P(0, 2))).toEqual([P(0, 2), P(10, 2), P(10, 5)]);
  });

  it('parça kaydırma: uçlar yerinde kalır', () => {
    expect(moveSegment([P(0, 0), P(10, 0)], 0, P(0, 3))).toEqual([P(0, 0), P(0, 3), P(10, 3), P(10, 0)]);
    expect(moveSegment([P(0, 0), P(5, 0), P(5, 5), P(10, 5)], 1, P(2, 9))).toEqual([P(0, 0), P(7, 0), P(7, 5), P(10, 5)]);
  });
});

describe('Bağlantı kuralları', () => {
  it('kablo ucu pine değerse bağlanır; bağlanmayan pin listelenir', () => {
    let doc = emptyDoc();
    const r = place(doc, 'resistor', 0, 0);
    doc = r.doc;
    doc = addWire(doc, [P(4, 0), P(10, 0)]).doc;
    const c = buildConnectivity(doc);
    expect(c.unconnectedPins.has(pinKey(r.id, 0))).toBe(true);
    expect(c.unconnectedPins.has(pinKey(r.id, 1))).toBe(false);
    expect(c.danglingEnds).toEqual([P(10, 0)]);
    expect(c.netlist.links).toContainEqual({ a: pinKey(r.id, 1), b: wireKey('w1') });
  });

  it('T bağlantısı: kablo ucu başka kablonun ortasında → bağlı ve dolu nokta', () => {
    let doc = emptyDoc();
    doc = addWire(doc, [P(0, 0), P(10, 0)]).doc;
    doc = addWire(doc, [P(5, 0), P(5, 6)]).doc;
    const c = buildConnectivity(doc);
    expect(c.netlist.links).toContainEqual({ a: wireKey('w2'), b: wireKey('w1') });
    expect(c.junctions).toEqual([P(5, 0)]);
  });

  it('köşesiz kesişen kablolar bağlı değildir', () => {
    let doc = emptyDoc();
    doc = addWire(doc, [P(0, 0), P(10, 0)]).doc;
    doc = addWire(doc, [P(5, -5), P(5, 5)]).doc;
    const c = buildConnectivity(doc);
    expect(c.netlist.links).toEqual([]);
    expect(c.junctions).toEqual([]);
  });

  it('şemadan çözüme: gerilim bölücü', () => {
    // Pil dikey (+ üstte), iki direnç dikey, toprak altta.
    let doc = emptyDoc();
    const b = place(doc, 'battery', 0, 0, 90);
    doc = b.doc;
    doc = updateBatteryIdeal(doc, b.id, 10);
    const r1 = place(doc, 'resistor', 10, -4, 90);
    doc = r1.doc;
    const r2 = place(doc, 'resistor', 10, 4, 90);
    doc = r2.doc;
    const g = place(doc, 'ground', 0, 8);
    doc = g.doc;
    const [bPlus, bMinus] = pinPositions(doc.parts[0]!);
    expect(bPlus).toEqual(P(0, -4));
    expect(bMinus).toEqual(P(0, 4));
    doc = addWire(doc, [P(0, -4), P(0, -8), P(10, -8)]).doc; // + → R1 üst ucu
    doc = addWire(doc, [P(0, 4), P(0, 8)]).doc; // − → toprak
    doc = addWire(doc, [P(10, 8), P(0, 8)]).doc; // R2 alt ucu → toprak
    const c = buildConnectivity(doc);
    expect(c.unconnectedPins.size).toBe(0);
    const sim = new CircuitSimulator(c.netlist);
    expect(sim.topologyDiagnostics).toEqual([]);
    expect(sim.advance(0).ok).toBe(true);
    // R1 ile R2 (10,0) noktasında pin pine değiyor
    expect(sim.voltageAt(pinKey(r1.id, 1))).toBeCloseTo(5, 6);
    expect(sim.voltageAt(wireKey('w1'))).toBeCloseTo(10, 6);
  });
});

function updateBatteryIdeal(doc: CircuitDoc, id: string, voltage: number): CircuitDoc {
  return {
    ...doc,
    parts: doc.parts.map((p) => (p.id === id ? { ...p, props: { voltage, internalResistance: 0 } } : p)),
  };
}

describe('Taşıma ve döndürme', () => {
  it('parça taşınınca bağlı kablo esner, uzak uç yerinde kalır', () => {
    let doc = emptyDoc();
    const r = place(doc, 'resistor', 0, 0);
    doc = addWire(r.doc, [P(4, 0), P(10, 0)]).doc;
    doc = moveSelection(doc, new Set([r.id]), new Set(), 0, 3);
    expect(doc.parts[0]).toMatchObject({ x: 0, y: 3 });
    expect(doc.wires[0]!.points).toEqual([P(4, 3), P(4, 0), P(10, 0)]);
    const pts = doc.wires[0]!.points;
    expect(pts[0]).toEqual(P(4, 3));
    expect(pts[pts.length - 1]).toEqual(P(10, 0));
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.x === pts[i - 1]!.x || pts[i]!.y === pts[i - 1]!.y).toBe(true);
    }
  });

  it('iki ucu da taşınan parçalara bağlı kablo bütünüyle kayar', () => {
    let doc = emptyDoc();
    const r1 = place(doc, 'resistor', 0, 0);
    const r2 = place(r1.doc, 'resistor', 12, 0);
    doc = addWire(r2.doc, [P(4, 0), P(8, 0)]).doc;
    doc = moveSelection(doc, new Set([r1.id, r2.id]), new Set(), 2, 5);
    expect(doc.wires[0]!.points).toEqual([P(6, 5), P(10, 5)]);
  });

  it('döndürmede pinlere bağlı kablolar yeni pin konumuna esner', () => {
    let doc = emptyDoc();
    const r = place(doc, 'resistor', 0, 0);
    doc = addWire(r.doc, [P(4, 0), P(10, 0)]).doc;
    doc = rotateParts(doc, new Set([r.id]));
    expect(doc.parts[0]!.rotation).toBe(90);
    const [, pin1] = pinPositions(doc.parts[0]!);
    expect(pin1).toEqual(P(0, 4));
    expect(doc.wires[0]!.points[0]).toEqual(P(0, 4));
    expect(buildConnectivity(doc).unconnectedPins.has(pinKey(r.id, 1))).toBe(false);
  });

  it('esneyen kablo parçasına T ile bağlı kablo da kayar (bağlantı kopmaz)', () => {
    let doc = emptyDoc();
    const r = place(doc, 'resistor', 0, 0, 90); // pinler (0,-4) ve (0,4)
    doc = addWire(r.doc, [P(-10, -8), P(0, -8), P(0, -4)]).doc; // w1: üst uç
    doc = addWire(doc, [P(6, -6), P(0, -6)]).doc; // w2: w1'in dikey parçasına T
    expect(buildConnectivity(doc).junctions).toContainEqual(P(0, -6));
    doc = moveSelection(doc, new Set([r.id]), new Set(), 3, 0);
    const w2 = doc.wires[1]!.points;
    expect(w2[w2.length - 1]).toEqual(P(3, -6));
    expect(buildConnectivity(doc).junctions).toContainEqual(P(3, -6));
  });

  it('art arda iki döndürme (180°) diyotu ters çevirir: kablolar yerinde, pinler yer değiştirir', () => {
    let doc = emptyDoc();
    const d = place(doc, 'diode', 0, 0); // anot (-4,0), katot (4,0)
    doc = addWire(d.doc, [P(-10, 0), P(-4, 0)]).doc; // w1 anoda
    doc = addWire(doc, [P(4, 0), P(10, 0)]).doc; // w2 katoda
    const flipped = rotatePartsBy(doc, new Set([d.id]), 2);
    expect(flipped.wires).toEqual(doc.wires);
    expect(flipped.parts[0]!.rotation).toBe(180);
    const links = buildConnectivity(flipped).netlist.links;
    expect(links).toContainEqual({ a: pinKey(d.id, 1), b: wireKey('w1') }); // katot artık w1'de
    expect(links).toContainEqual({ a: pinKey(d.id, 0), b: wireKey('w2') });
    // 90°'de kablolar pinleri izler; 360°'de her şey başa döner
    const quarter = rotatePartsBy(doc, new Set([d.id]), 1);
    expect(buildConnectivity(quarter).unconnectedPins.size).toBe(0);
    expect(rotatePartsBy(doc, new Set([d.id]), 4)).toBe(doc);
  });

  it('otomatik adlar', () => {
    let doc = emptyDoc();
    doc = place(doc, 'resistor', 0, 0).doc;
    doc = place(doc, 'resistor', 0, 5).doc;
    expect(doc.parts.map((p) => p.label)).toEqual(['R1', 'R2']);
    expect(nextLabel(doc, 'led')).toBe('LED1');
  });
});
