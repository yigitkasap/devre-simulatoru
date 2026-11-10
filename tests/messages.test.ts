// Editörün mesajları: toprak tuzağı tespiti, kısa devre edilen parça ve üretecin çıkışı, yanan LED için
// bağlama göre ön direnç önerisi.

import { describe, expect, it } from 'vitest';
import {
  e24AtLeast,
  earthTrapItem,
  findEarthTrap,
  findShortedGenerators,
  findShortedParts,
  itemFromDiagnostic,
  ledAdvice,
  seriesResistor,
  shortedGeneratorItem,
  shortedPartItem,
  suggestedResistor,
} from '../src/editor/messages';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';
import { buildConnectivity } from '../src/model/connectivity';
import { addWire, updatePart } from '../src/model/docOps';
import { pinPositions } from '../src/model/geometry';
import type { CircuitDoc } from '../src/model/types';
import { CircuitSimulator, compileNetlist, type Netlist } from '../src/sim';
import { circuit } from './helpers';

const compile = (doc: CircuitDoc) => compileNetlist(buildConnectivity(doc).netlist);
const label = (doc: CircuitDoc, id: string) => doc.parts.find((p) => p.id === id)!.label;

describe('toprak tuzağı', () => {
  it('köprüde prob toprağı yükün − ucundaysa bir diyot kısa devre olur', () => {
    const doc = exampleDoc('toprak-tuzagi')!;
    const trap = findEarthTrap(compile(doc));
    expect(trap).not.toBeNull();
    expect(trap!.shorted.map((id) => label(doc, id))).toEqual(['D4']);
    expect(trap!.instruments.map((id) => label(doc, id)).sort()).toEqual(['FG1', 'OSC1']);
    const item = earthTrapItem(trap!, doc);
    expect(item.title).toBe('Toprak tuzağı');
    expect(item.detail).toContain('D4 kısa devre oldu');
    expect(item.badgeIds).toEqual(trap!.shorted);
  });

  it('osiloskop topraktan yalıtılınca tuzak kalmaz', () => {
    const doc = exampleDoc('toprak-tuzagi')!;
    const scope = doc.parts.find((p) => p.type === 'oscilloscope')!;
    const isolated = updatePart(doc, scope.id, { props: { ...scope.props, earthed: false } });
    expect(findEarthTrap(compile(isolated))).toBeNull();
  });

  it('topraklı tek cihazlı devrede tuzak yok', () => {
    const doc = exampleDoc('yarim-dalga')!;
    expect(findEarthTrap(compile(doc))).toBeNull();
  });
});

describe('yanan LED: ön direnç önerisi', () => {
  it('E24 dizisinde bir üst değer', () => {
    expect(e24AtLeast(357.5)).toBe(360);
    expect(e24AtLeast(157.5)).toBe(160);
    expect(e24AtLeast(1000)).toBe(1000);
    expect(e24AtLeast(9.15)).toBe(10);
  });

  it('R = (V_kaynak − V_f) / 20 mA', () => {
    expect(suggestedResistor(9, 1.85)).toBe(360);
    expect(suggestedResistor(1.5, 1.85)).toBeNull();
  });

  it('LED ile direnç arasında seri ampermetre olsa da seri direnç bulunur', () => {
    const doc = exampleDoc('led-on-direnc')!;
    const led = doc.parts.find((p) => p.type === 'led')!;
    const r1 = doc.parts.find((p) => p.label === 'R1')!;
    expect(seriesResistor(led.id, compile(doc))).toBe(r1.id);
  });
});

/** Netlist'ten derlenmiş devre; kimlikler ad olarak kullanılır (R1 → "R1"). */
const net = (n: Netlist) => compileNetlist(n);
const fakeDoc = (n: Netlist): CircuitDoc =>
  ({ version: 1, parts: n.elements.map((e) => ({ id: e.id, type: e.type, label: e.id, x: 0, y: 0, rotation: 0, props: e.props })), wires: [] }) as unknown as CircuitDoc;
/** Bir parçanın iki ucunu, gövdesinin iki birim üstünden dolaşan bir kabloyla birleştirir. */
function bridge(doc: CircuitDoc, label: string): CircuitDoc {
  const part = doc.parts.find((p) => p.label === label)!;
  const [a, b] = pinPositions(part) as [{ x: number; y: number }, { x: number; y: number }];
  const up = (q: { x: number; y: number }) => ({ x: q.x, y: q.y - 2 });
  return addWire(doc, [a, up(a), up(b), b]).doc;
}

describe('kısa devre edilen parça', () => {
  it('iki ucu aynı kablo ağında: "R2 kısa devre edildi", parça ve ağ vurgulanır', () => {
    const n = circuit().battery('B1', 'k', 'gnd', 9).ground('G1', 'gnd').resistor('R1', 'k', 'a', 100).resistor('R2', 'a', 'b', 100).wire('a', 'b').wire('b', 'gnd').build();
    const shorted = findShortedParts(net(n));
    expect(shorted.map((s) => [s.id, s.via])).toEqual([['R2', 'wire']]);
    const item = shortedPartItem(shorted[0]!, fakeDoc(n));
    expect(item.title).toBe('R2 kısa devre edildi');
    expect(item.severity).toBe('warning');
    expect(item.elementIds).toEqual(['R2']);
    expect(item.netKeys).toHaveLength(1);
    expect(item.detail).toContain('R2 direncinin iki ucu aynı noktaya bağlı');
    expect(item.detail).toContain('kablodan geçer');
  });

  it('iki ucu iki ayrı toprak sembolünde: toprak üzerinden kısa devre (tuzak değil: topraklı cihaz yok)', () => {
    const n = circuit().battery('B1', 'k', 'g1', 9).ground('G1', 'g1').resistor('R1', 'k', 'g2', 100).ground('G2', 'g2').resistor('R2', 'g2', 'g1', 100).build();
    const c = net(n);
    expect(findShortedParts(c).map((s) => [s.id, s.via])).toEqual([['R2', 'ground']]);
    expect(findEarthTrap(c)).toBeNull();
    expect(shortedPartItem(findShortedParts(c)[0]!, fakeDoc(n)).detail).toContain('ikisi de toprakta');
  });

  it('LED, ampermetre, anahtar ve A kipindeki multimetre kısa devre sayılır; voltmetre ve V kipindeki multimetre sayılmaz', () => {
    const n = circuit()
      .battery('B1', 'k', 'gnd', 9)
      .ground('G1', 'gnd')
      .resistor('R1', 'k', 'a', 1000)
      .led('D1', 'a', 'a')
      .ammeter('A1', 'a', 'a')
      .switch('S1', 'a', 'a', false)
      .add('multimeter', 'MA', ['a', 'a'], { mode: 'a' })
      .add('multimeter', 'MV', ['a', 'a'], { mode: 'dc' })
      .voltmeter('V1', 'a', 'a')
      .resistor('R2', 'a', 'gnd', 1000)
      .build();
    expect(findShortedParts(net(n)).map((s) => s.id)).toEqual(['D1', 'A1', 'S1', 'MA']);
    const doc = fakeDoc(n);
    expect(shortedPartItem({ id: 'D1', via: 'wire' }, doc).detail).toContain('LED ışık vermez');
    expect(shortedPartItem({ id: 'A1', via: 'wire' }, doc).detail).toContain('0 gösterir');
  });

  it('kaynaklar (pil, akım kaynağı) bu uyarıyı almaz', () => {
    const n = circuit().battery('B1', 'k', 'k', 9, 1).ground('G1', 'k').add('currentsource', 'I1', ['x', 'x'], { current: 0.001 }).build();
    expect(findShortedParts(net(n))).toEqual([]);
  });

  it('hiçbir örnekte kısa devre edilen parça ya da OUT’u COM’a bağlı üreteç yok (toprak tuzağındaki D4 tuzak mesajında)', () => {
    for (const id of EXAMPLE_IDS) {
      const doc = exampleDoc(id)!;
      const c = compile(doc);
      const trapped = new Set(findEarthTrap(c)?.shorted ?? []);
      expect(findShortedParts(c).filter((s) => !trapped.has(s.id)), id).toEqual([]);
      expect(findShortedGenerators(c), id).toEqual([]);
      if (id === 'toprak-tuzagi') expect(findShortedParts(c).map((s) => label(doc, s.id))).toEqual(['D4']);
    }
  });
});

describe('fonksiyon üretecinin OUT ucu COM’a kısa devre', () => {
  it('OUT ile COM aynı kablo ağında: "FG1 çıkışı kısa devre"', () => {
    const n = circuit().add('funcgen', 'FG1', ['o', 'ttl', 'o'], {}).resistor('R1', 'x', 'y', 1000).build();
    const found = findShortedGenerators(net(n));
    expect(found.map((s) => [s.id, s.via])).toEqual([['FG1', 'wire']]);
    const item = shortedGeneratorItem(found[0]!, fakeDoc(n));
    expect(item.title).toBe('FG1 çıkışı kısa devre');
    expect(item.detail).toContain('OUT ucu COM ucuyla aynı noktaya bağlı');
    expect(item.elementIds).toEqual(['FG1']);
  });

  it('topraklı üretecin OUT ucu toprak sembolünde: toprak üzerinden kısa devre; topraksız üreteçte değil', () => {
    const earthed = circuit().add('funcgen', 'FG1', ['o', 'ttl', 'c'], { earthed: true }).ground('G1', 'o').resistor('R1', 'c', 'x', 100).build();
    expect(findShortedGenerators(net(earthed)).map((s) => s.via)).toEqual(['ground']);
    const floating = circuit().add('funcgen', 'FG1', ['o', 'ttl', 'c'], { earthed: false }).ground('G1', 'o').resistor('R1', 'c', 'o', 100).build();
    expect(findShortedGenerators(net(floating))).toEqual([]);
  });

  it('OUT bir dirençle COM’a bağlıysa kısa devre değil', () => {
    const n = circuit().add('funcgen', 'FG1', ['o', 'ttl', 'c'], {}).resistor('R1', 'o', 'c', 1000).build();
    expect(findShortedGenerators(net(n))).toEqual([]);
  });

  it('TTL ile COM aynı kablo ağında: "FG1 TTL çıkışı kısa devre", OUT’un uyarısından ayrı', () => {
    const n = circuit().add('funcgen', 'FG1', ['o', 'c', 'c'], {}).resistor('R1', 'o', 'c', 1000).build();
    const found = findShortedGenerators(net(n));
    expect(found.map((s) => [s.id, s.via, s.output])).toEqual([['FG1', 'wire', 'ttl']]);
    const item = shortedGeneratorItem(found[0]!, fakeDoc(n));
    expect(item.title).toBe('FG1 TTL çıkışı kısa devre');
    expect(item.detail).toContain('TTL ucu COM ucuyla aynı noktaya bağlı');
    expect(item.key).toBe('generator-shorted|FG1|ttl');
    // İkisi birden kısa devre: iki uyarı, anahtarları ayrı.
    const both = circuit().add('funcgen', 'FG1', ['c', 'c', 'c'], {}).resistor('R1', 'c', 'x', 1000).build();
    const items = findShortedGenerators(net(both)).map((s) => shortedGeneratorItem(s, fakeDoc(both)));
    expect(items.map((i) => i.title)).toEqual(['FG1 çıkışı kısa devre', 'FG1 TTL çıkışı kısa devre']);
    expect(new Set(items.map((i) => i.key)).size).toBe(2);
  });

  it('topraklı üretecin TTL ucu toprak sembolünde: toprak üzerinden kısa devre; topraksız üreteçte değil', () => {
    const earthed = circuit().add('funcgen', 'FG1', ['o', 't', 'c'], { earthed: true }).ground('G1', 't').resistor('R1', 'o', 'c', 100).build();
    expect(findShortedGenerators(net(earthed)).map((s) => [s.via, s.output])).toEqual([['ground', 'ttl']]);
    const floating = circuit().add('funcgen', 'FG1', ['o', 't', 'c'], { earthed: false }).ground('G1', 't').resistor('R1', 'o', 'c', 100).build();
    expect(findShortedGenerators(net(floating))).toEqual([]);
  });
});

describe('yanan LED: bağlama göre mesaj', () => {
  const base = exampleDoc('led-on-direnc')!;
  const led = base.parts.find((p) => p.type === 'led')!;
  /** LED'i yakan devrenin "LED yandı" mesajı (bağlamıyla). */
  const burnText = (doc: CircuitDoc) => {
    const c = compile(doc);
    const shorted = findShortedParts(c);
    const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
    sim.advance(0.05);
    const d = sim.runtimeDiagnostics.find((x) => x.code === 'led-burned');
    expect(d, 'LED yanmalı').toBeDefined();
    const ctx = {
      label: (id: string) => doc.parts.find((p) => p.id === id)?.label ?? id,
      type: (id: string) => doc.parts.find((p) => p.id === id)?.type,
      ledAdvice: (id: string) => ledAdvice(id, c, shorted, doc),
    };
    return itemFromDiagnostic(d!, ctx).detail;
  };

  it('ön direnç var ama küçük: "R1 ön direnci bu gerilim için küçük", "ön direnç ekle" yok', () => {
    const r1 = base.parts.find((p) => p.label === 'R1')!;
    const doc = updatePart(base, r1.id, { props: { ...r1.props, resistance: 1 } });
    expect(ledAdvice(led.id, compile(doc), [], doc)).toEqual({ kind: 'resistor', label: 'R1' });
    const text = burnText(doc);
    expect(text).toContain('R1 ön direnci bu gerilim için küçük');
    expect(text).not.toContain('Seri bir ön direnç ekle');
  });

  it('ön direnç kısa devre edilmiş: mesaj R1’in kısa devresini söyler', () => {
    const doc = bridge(base, 'R1');
    const c = compile(doc);
    expect(findShortedParts(c).map((s) => doc.parts.find((p) => p.id === s.id)?.label)).toEqual(['R1']);
    expect(ledAdvice(led.id, c, findShortedParts(c), doc)).toEqual({ kind: 'resistor-shorted', label: 'R1' });
    const text = burnText(doc);
    expect(text).toContain('R1 kısa devre edilmiş');
    expect(text).not.toContain('Seri bir ön direnç ekle');
  });

  it('ön direnç hiç yok: "Seri bir ön direnç ekle"', () => {
    const n = circuit().battery('B1', 'k', 'gnd', 9).ground('G1', 'gnd').led('D1', 'k', 'gnd').build();
    const c = net(n);
    expect(ledAdvice('D1', c, findShortedParts(c), fakeDoc(n))).toEqual({ kind: 'no-resistor' });
    const sim = new CircuitSimulator(n);
    sim.advance(0.05);
    const d = sim.runtimeDiagnostics.find((x) => x.code === 'led-burned')!;
    const doc = fakeDoc(n);
    const text = itemFromDiagnostic(d, { label: (id) => id, type: (id) => doc.parts.find((p) => p.id === id)?.type, ledAdvice: (id) => ledAdvice(id, c, [], doc) }).detail;
    expect(text).toContain('Seri bir ön direnç ekle');
  });
});
