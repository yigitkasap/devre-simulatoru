// Hazır örnekler: devreler hatasız açılır ve örnek metinlerindeki sayılar simülasyonla tutar.
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
    it(`${id}: hatasız açılır, bütün uçlar bağlı (osiloskop kanalları ve kullanılmayan cihaz çıkışları dışında), metinleri var`, () => {
      const doc = load(id);
      const connectivity = buildConnectivity(doc);
      const open = connectivity.unconnectedPins;
      // Boş kalabilecek uçlar: osiloskop kanalları, üretecin OUT ya da TTL çıkışı (biri kullanılır),
      // güç kaynağının iki ucu da boş olan çıkışı.
      const allowed = new Set([
        ...doc.parts.filter((p) => p.type === 'oscilloscope').flatMap((p) => [`${p.id}#0`, `${p.id}#1`]),
        ...doc.parts.filter((p) => p.type === 'funcgen').flatMap((p) => [`${p.id}#0`, `${p.id}#1`]),
        ...doc.parts
          .filter((p) => p.type === 'dcsupply')
          .flatMap((p) => [0, 2].filter((k) => open.has(`${p.id}#${k}`) && open.has(`${p.id}#${k + 1}`)).flatMap((k) => [`${p.id}#${k}`, `${p.id}#${k + 1}`])),
      ]);
      expect([...open].filter((pin) => !allowed.has(pin))).toEqual([]);
      for (const fg of doc.parts.filter((p) => p.type === 'funcgen')) {
        expect(open.has(`${fg.id}#0`) && open.has(`${fg.id}#1`), `${fg.label} kullanılmıyor`).toBe(false);
      }
      expect(connectivity.danglingEnds).toEqual([]);
      // Hata ve uyarı yok; bilgi olabilir (ör. transformatörün yalıtılmış ikincilinin kendi sıfır noktası).
      expect(new CircuitSimulator(connectivity.netlist).topologyDiagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
      const texts = tr.examples.texts[id];
      for (const text of [texts.title, texts.description, texts.purpose, texts.everyday]) expect(text.length).toBeGreaterThan(5);
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

  /** Bir periyot boyunca küçük adımlarla ilerleyip voltmetrenin anlık değerinin uç noktalarını bulur. */
  function swing(sim: CircuitSimulator, id: string, duration: number): { max: number; min: number } {
    let max = Number.NEGATIVE_INFINITY;
    let min = Number.POSITIVE_INFINITY;
    const end = sim.time + duration;
    while (sim.time < end - 1e-12) {
      expect(sim.advance(5e-5).ok).toBe(true);
      const v = sim.measure(id)!.voltage;
      max = Math.max(max, v);
      min = Math.min(min, v);
    }
    return { max, min };
  }

  it('Yarım dalga doğrultmaç (föy): yükte ≈ 9,0 V tepe, DC voltmetre ≈ 2,8 V; ters diyotla negatif yarılar', () => {
    const doc = load('yarim-dalga');
    const sim = simulate(doc, 0.1);
    const reading = sim.status(idOf(doc, 'V1')).reading!;
    expect(reading).toBeGreaterThan(2.7);
    expect(reading).toBeLessThan(2.85);
    const { max, min } = swing(sim, idOf(doc, 'V1'), 0.02);
    expect(max).toBeGreaterThan(8.9);
    expect(max).toBeLessThan(9.05);
    expect(min).toBeGreaterThan(-0.01);
    const flipped = simulate(flipParts(doc, new Set([idOf(doc, 'D1')])), 0.1);
    const reverse = swing(flipped, idOf(doc, 'V1'), 0.02);
    expect(reverse.max).toBeLessThan(0.01);
    expect(reverse.min).toBeLessThan(-8.9);
  });

  it('Kare dalga ile RC: yarım periyot sonunda ≈ 9,93 V; 5 Hz’de kondansatör tam dolamaz', () => {
    const doc = load('rc-kare-dalga');
    const sim = simulate(doc, 0.4999);
    const c = idOf(doc, 'C1');
    expect(sim.measure(c)!.voltage).toBeGreaterThan(9.9);
    expect(sim.measure(c)!.voltage).toBeLessThan(9.96);
    const fast = simulate(withProps(doc, 'AC1', { frequency: 5 }), 2);
    const { max, min } = swing(fast, c, 0.2);
    expect(max).toBeLessThan(8);
    expect(min).toBeGreaterThan(2);
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
