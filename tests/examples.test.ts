// Hazır örnekler: devreler hatasız açılır ve örnek metinlerindeki cevaplar simülasyonla tutar.
// Paylaşım bağlantısı: sıkıştırma ve geri okuma.

import { describe, expect, it } from 'vitest';
import { EXAMPLE_IDS, exampleDoc, type ExampleId } from '../src/examples';
import { tr } from '../src/i18n/tr';
import { buildConnectivity } from '../src/model/connectivity';
import { flipParts, updatePart } from '../src/model/docOps';
import { decodeDoc, docFromHash, encodeDoc, shareUrl } from '../src/model/share';
import type { CircuitDoc } from '../src/model/types';
import { CircuitSimulator } from '../src/sim';

function load(id: ExampleId): CircuitDoc {
  const doc = exampleDoc(id);
  expect(doc, id).not.toBeNull();
  return doc!;
}

function idOf(doc: CircuitDoc, label: string): string {
  return doc.parts.find((p) => p.label === label)!.id;
}

function simulate(doc: CircuitDoc, until = 0): CircuitSimulator {
  const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
  expect(sim.advance(until).ok).toBe(true);
  return sim;
}

function withProps(doc: CircuitDoc, label: string, props: Record<string, number | boolean | string>): CircuitDoc {
  const part = doc.parts.find((p) => p.label === label)!;
  return updatePart(doc, part.id, { props: { ...part.props, ...props } });
}

describe('Örnekler', () => {
  for (const id of EXAMPLE_IDS) {
    it(`${id}: hatasız açılır, bütün uçlar bağlı, metinleri var`, () => {
      const doc = load(id);
      const connectivity = buildConnectivity(doc);
      expect(connectivity.unconnectedPins.size).toBe(0);
      expect(connectivity.danglingEnds).toEqual([]);
      expect(new CircuitSimulator(connectivity.netlist).topologyDiagnostics).toEqual([]);
      const texts = tr.examples.texts[id];
      for (const text of [texts.title, texts.description, texts.question, texts.answer]) expect(text.length).toBeGreaterThan(5);
    });
  }

  it('LED ve ön direnç: ≈ 9,7 mA; 100 Ω ile LED yanar', () => {
    const doc = load('led-on-direnc');
    const i = simulate(doc).measure(idOf(doc, 'A1'))!.current;
    expect(i).toBeGreaterThan(9.6e-3);
    expect(i).toBeLessThan(9.8e-3);
    const burned = simulate(withProps(doc, 'R1', { resistance: 100 }));
    expect(burned.status(idOf(doc, 'LED1')).burned).toBe(true);
  });

  it('Gerilim bölücü: 4,5 V', () => {
    const doc = load('gerilim-bolucu');
    expect(Math.abs(simulate(doc).measure(idOf(doc, 'V1'))!.voltage - 4.5)).toBeLessThan(0.005);
  });

  it('Voltmetrenin yükleme etkisi: 10 V; 20 MΩ ile ≈ 11,88 V', () => {
    const doc = load('voltmetre-yukleme');
    expect(Math.abs(simulate(doc).measure(idOf(doc, 'V1'))!.voltage - 10)).toBeLessThan(0.01);
    const better = withProps(doc, 'V1', { resistance: 20e6 });
    expect(Math.abs(simulate(better).measure(idOf(doc, 'V1'))!.voltage - (12 * 20) / 20.2)).toBeLessThan(0.01);
  });

  it('Ampermetrenin etkisi: 118,8 mA; ideal ampermetreyle 120,0 mA', () => {
    const doc = load('ampermetre-etkisi');
    expect(Math.abs(simulate(doc).measure(idOf(doc, 'A1'))!.current - 0.1188)).toBeLessThan(0.1e-3);
    const ideal = withProps(doc, 'A1', { ideal: true });
    expect(Math.abs(simulate(ideal).measure(idOf(doc, 'A1'))!.current - 0.12)).toBeLessThan(0.1e-3);
  });

  it('RC dolma: anahtar kapandıktan 0,1 s sonra ≈ 6,3 V', () => {
    const doc = load('rc-dolma');
    const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
    sim.runUntil(0.05);
    expect(Math.abs(sim.measure(idOf(doc, 'V1'))!.voltage)).toBeLessThan(1e-6);
    sim.update(buildConnectivity(withProps(doc, 'S1', { closed: true })).netlist);
    sim.runUntil(0.15);
    const v = sim.measure(idOf(doc, 'V1'))!.voltage;
    expect(Math.abs(v - 6.32) / 6.32).toBeLessThan(0.01);
  });

  it('Diyot yönü: ≈ 4,35 mA; ters çevirince (F) akım neredeyse sıfır', () => {
    const doc = load('diyot-yonu');
    const i = simulate(doc).measure(idOf(doc, 'A1'))!.current;
    expect(i).toBeGreaterThan(4.3e-3);
    expect(i).toBeLessThan(4.4e-3);
    const flipped = flipParts(doc, new Set([idOf(doc, 'D1')]));
    expect(Math.abs(simulate(flipped).measure(idOf(doc, 'A1'))!.current)).toBeLessThan(1e-6);
  });
});

describe('Paylaşım bağlantısı', () => {
  it('devre sıkıştırılıp geri okunur', () => {
    const doc = load('rc-dolma');
    const encoded = encodeDoc(doc);
    expect(encoded).toMatch(/^[A-Za-z0-9+\-$]+$/);
    expect(decodeDoc(encoded)).toEqual(doc);
    const url = shareUrl(doc, 'https://ornek.com/simulator/#eski');
    expect(url.startsWith('https://ornek.com/simulator/#d=')).toBe(true);
    expect(docFromHash(new URL(url).hash)).toEqual(doc);
  });

  it('bağlantıda devre yoksa undefined, bozuksa null', () => {
    expect(docFromHash('')).toBeUndefined();
    expect(docFromHash('#baska')).toBeUndefined();
    expect(docFromHash('#d=bozukveri')).toBeNull();
  });
});
