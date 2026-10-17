// Föy örnekleri (Fizik 2. sınıf Elektronik Laboratuvarı, Deney 1–9) ve laboratuvar cihazları:
// metinlerdeki ("Ne işe yarar?") sayılar simülasyonla tutar.

import { describe, expect, it } from 'vitest';
import { buildScopeView } from '../src/editor/scopeView';
import { exampleDoc, type ExampleId } from '../src/examples';
import { buildConnectivity } from '../src/model/connectivity';
import { flipParts, updatePart } from '../src/model/docOps';
import type { CircuitDoc } from '../src/model/types';
import { CircuitSimulator, OscilloscopeDevice, scopeSettings } from '../src/sim';

function load(id: ExampleId): CircuitDoc {
  const doc = exampleDoc(id);
  expect(doc, id).not.toBeNull();
  return doc!;
}
const idOf = (doc: CircuitDoc, label: string) => doc.parts.find((p) => p.label === label)!.id;
function run(doc: CircuitDoc, until: number): CircuitSimulator {
  const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
  expect(sim.runUntil(until).ok).toBe(true);
  return sim;
}
function withProps(doc: CircuitDoc, label: string, props: Record<string, number | boolean | string>): CircuitDoc {
  const part = doc.parts.find((p) => p.label === label)!;
  return updatePart(doc, part.id, { props: { ...part.props, ...props } });
}
/** `duration` boyunca küçük adımlarla ilerleyip bir büyüklüğün uç değerlerini bulur. */
function swing(sim: CircuitSimulator, value: () => number, duration: number, slice = 2e-5): { max: number; min: number } {
  let max = Number.NEGATIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  const end = sim.time + duration;
  while (sim.time < end - 1e-15) {
    expect(sim.advance(slice).ok).toBe(true);
    const v = value();
    max = Math.max(max, v);
    min = Math.min(min, v);
  }
  return { max, min };
}
const between = (value: number, lo: number, hi: number) => {
  expect(value).toBeGreaterThan(lo);
  expect(value).toBeLessThan(hi);
};

describe('Deney 1: diyot karakteristikleri', () => {
  it('1N4001 doğru akımda: 5 V’ta V_D ≈ 0,56 V, I ≈ 4,4 mA; 10 V’ta ≈ 9,4 mA; ters yönde < 1 µA', () => {
    const doc = load('diyot-dc');
    const at = (v: number) => run(withProps(doc, 'PS1', { voltage1: v }), 0);
    const five = at(5);
    between(five.measure(idOf(doc, 'D1'))!.voltage, 0.55, 0.57);
    between(five.status(idOf(doc, 'A1')).reading!, 4.4e-3, 4.48e-3);
    between(five.status(idOf(doc, 'V1')).reading!, 0.55, 0.57);
    const ten = at(10);
    between(ten.measure(idOf(doc, 'D1'))!.current, 9.35e-3, 9.45e-3);
    between(at(0.5).measure(idOf(doc, 'D1'))!.current, 0.12e-3, 0.135e-3);
    const reverse = run(flipParts(doc, new Set([idOf(doc, 'D1')])), 0);
    expect(Math.abs(reverse.status(idOf(doc, 'A1')).reading!)).toBeLessThan(1e-6);
  });

  it('1N4001 X-Y: 1 kHz’te en büyük akım ≈ 4,2 mA (V_D ≈ 0,56 V); 100 kHz’te ≈ −4,8 mA ters akım; topraklı üreteçte R kısa devre', () => {
    const doc = load('diyot-karakteristigi');
    const d = idOf(doc, 'D1');
    const sim = run(doc, 3e-3);
    const current = swing(sim, () => sim.measure(d)!.current, 2e-3, 1e-5);
    between(current.max, 4.15e-3, 4.3e-3);
    expect(current.min).toBeGreaterThan(-0.15e-3);
    between(swing(sim, () => sim.measure(d)!.voltage, 2e-3, 1e-5).max, 0.54, 0.57);
    const scope = doc.parts.find((p) => p.type === 'oscilloscope')!;
    const view = buildScopeView((sim.device(scope.id) as OscilloscopeDevice).recorder, scopeSettings(scope.props), [true, true]);
    expect(view.xyPath.length).toBeGreaterThan(100);
    const fast = run(withProps(doc, 'FG1', { frequency: 1e5 }), 30e-6);
    between(swing(fast, () => fast.measure(d)!.current, 20e-6, 1e-7).min, -5e-3, -4.5e-3);
    const earthed = run(withProps(doc, 'FG1', { earthed: true }), 3e-3);
    expect(Math.abs(swing(earthed, () => earthed.measure(idOf(doc, 'R1'))!.voltage, 1e-3, 1e-5).max)).toBeLessThan(1e-6);
    expect(swing(earthed, () => earthed.measure(d)!.current, 1e-3, 1e-5).max).toBeGreaterThan(80e-3);
  });

  it('Zener 5,6 V: ters yönde ≈ −5,4 V’ta ≈ 4,4 mA; ileri yönde ≈ 0,7 V’ta ≈ 8,9 mA', () => {
    const doc = load('zener-karakteristigi');
    const z = idOf(doc, 'Z1');
    const sim = run(doc, 3e-3);
    const i = swing(sim, () => sim.measure(z)!.current, 2e-3, 1e-5);
    between(i.min, -4.5e-3, -4.3e-3);
    between(i.max, 8.8e-3, 9e-3);
    const v = swing(sim, () => sim.measure(z)!.voltage, 2e-3, 1e-5);
    between(v.min, -5.45, -5.3);
    between(v.max, 0.65, 0.72);
  });

  it('LED: en büyük akım ≈ 3,1 mA, o anda V_F ≈ 1,69 V', () => {
    const doc = load('led-karakteristigi');
    const led = idOf(doc, 'LED1');
    const sim = run(doc, 3e-3);
    between(swing(sim, () => sim.measure(led)!.current, 2e-3, 1e-5).max, 3.05e-3, 3.2e-3);
    between(swing(sim, () => sim.measure(led)!.voltage, 2e-3, 1e-5).max, 1.65, 1.72);
  });
});

describe('Deney 2: doğrultucular', () => {
  it('Yarım dalga filtreleri: 22 µF’ta ≈ 4,2–8,5 V (ortalama ≈ 6,2 V); 470 µF’ta dalgalanma ≈ 0,2 V, tepe ≈ 7,1 V', () => {
    const doc = load('yarim-dalga');
    const out = (sim: CircuitSimulator) => swing(sim, () => sim.measure(idOf(doc, 'RL'))!.voltage, 0.04, 1e-4);
    const c1 = run(withProps(doc, 'S1', { closed: true }), 0.3);
    expect(out(c1).min).toBeLessThan(0.01);
    const c22 = run(withProps(doc, 'S2', { closed: true }), 0.5);
    const r22 = out(c22);
    between(r22.min, 4.1, 4.35);
    between(r22.max, 8.4, 8.55);
    between(c22.status(idOf(doc, 'V1')).reading!, 6.1, 6.35);
    const c470 = run(withProps(doc, 'S3', { closed: true }), 1);
    const r470 = out(c470);
    between(r470.max - r470.min, 0.15, 0.3);
    between(r470.max, 7.0, 7.2);
  });

  it('Köprü: 100 kΩ’da iki yarıda da ≈ 9,3 V tepe (A − B ölçümü doğru, prob toprağı toprakta)', () => {
    const doc = load('kopru-dogrultmac');
    const sim = run(doc, 0.105);
    const vl = () => sim.measure(idOf(doc, 'RL'))!.voltage;
    between(vl(), 9.2, 9.35);
    sim.runUntil(0.115);
    between(vl(), 9.2, 9.35);
    const scope = doc.parts.find((p) => p.type === 'oscilloscope')!;
    expect(scopeSettings(scope.props).mode).toBe('add');
  });
});

describe('Deney 3: kenetleyici ve katlayıcı', () => {
  it('Negatif kenetleyici: sinüste ≈ +0,56 V ile −9,1 V; karede ≈ +0,5 V ile −9,5 V; pozitif kenetleyici bunun aynası', () => {
    const doc = load('negatif-kenetleyici');
    const rl = (d: CircuitDoc) => {
      const sim = run(d, 0.2);
      return swing(sim, () => sim.measure(idOf(d, 'RL'))!.voltage, 0.004, 1e-5);
    };
    const sine = rl(doc);
    between(sine.max, 0.5, 0.62);
    between(sine.min, -9.2, -9.0);
    const square = rl(withProps(doc, 'FG1', { waveform: 'square' }));
    between(square.max, 0.45, 0.58);
    between(square.min, -9.55, -9.4);
    const positive = rl(load('pozitif-kenetleyici'));
    between(positive.max, 9.0, 9.2);
    between(positive.min, -0.62, -0.5);
  });

  it('Gerilim katlayıcı: 5 ms’de ≈ 4,9 V, 50 ms’de ≈ 8,7 V, sonunda ≈ 9,1 V', () => {
    const doc = load('gerilim-katlayici');
    const c2 = idOf(doc, 'C2');
    const sim = run(doc, 0.005);
    between(sim.measure(c2)!.voltage, 4.7, 5.05);
    sim.runUntil(0.05);
    between(sim.measure(c2)!.voltage, 8.6, 8.8);
    sim.runUntil(0.3);
    between(sim.measure(c2)!.voltage, 9.05, 9.2);
  });
});

describe('Deney 4: kırpıcılar', () => {
  it('4 V öngerilimli kırpıcı: ≈ 4,45 V’ta kırpar, negatif yarı geçer', () => {
    const doc = load('paralel-kirpici');
    const sim = run(doc, 0.01);
    const out = swing(sim, () => sim.voltageAt(`${idOf(doc, 'D1')}#0`)!, 0.004, 1e-5);
    between(out.max, 4.4, 4.5);
    expect(out.min).toBeLessThan(-9.8);
  });

  it('Çift yönlü kırpıcı (3 V ve −2 V): ≈ +3,46 V ile −2,47 V arasında', () => {
    const doc = load('cift-kirpici');
    const sim = run(doc, 0.01);
    const out = swing(sim, () => sim.voltageAt(`${idOf(doc, 'D1')}#0`)!, 0.004, 1e-5);
    between(out.max, 3.4, 3.5);
    between(out.min, -2.52, -2.42);
  });
});

describe('Deney 5: JFET karakteristikleri', () => {
  it('BF245A, V_DS = 10 V: V_GS = 0’da ≈ 4,1 mA, −0,2 V’ta ≈ 3,2 mA, −0,4 V’ta ≈ 2,5 mA; −1,8 V’ta kesim', () => {
    const doc = load('jfet-karakteristik');
    const id = (vgg: number) => run(withProps(doc, 'PS1', { voltage2: vgg }), 0).status(idOf(doc, 'A1')).reading!;
    between(id(0), 4.1e-3, 4.18e-3);
    between(id(0.2), 3.2e-3, 3.28e-3);
    between(id(0.4), 2.42e-3, 2.49e-3);
    // Kesimde yalnızca V_DS voltmetresinin (10 MΩ) akımı kalır.
    expect(id(1.8)).toBeLessThan(2e-6);
    const sim = run(withProps(doc, 'PS1', { voltage2: 0.4 }), 0);
    between(sim.status(idOf(doc, 'V2')).reading!, -0.41, -0.39);
  });
});

describe('Deney 6–8: yükselteçler', () => {
  /** Yükseltecin kazancı (çıkış tepe / giriş tepe) ve çıkış uçları. */
  function amplifier(doc: CircuitDoc, q: string, frequency = 1e3, until = 0.3) {
    const fg = doc.parts.find((p) => p.label === 'FG1')!.props;
    const vin = ((fg.amplitude as number) * (fg.attenuate ? 0.1 : 1)) / 2;
    const sim = run(withProps(doc, 'FG1', { frequency }), until);
    const out = swing(sim, () => sim.voltageAt(`${idOf(doc, q)}#0`)!, 2 / frequency, 1 / (100 * frequency));
    return { sim, out, gain: (out.max - out.min) / 2 / vin };
  }

  it('JFET (BF245A, R_D = 2,7 kΩ): I_D ≈ 3,8 mA, kazanç ≈ 10; 2 V tepe-tepe girişte bozulma', () => {
    const doc = load('fet-yukseltec');
    const { sim, gain } = amplifier(doc, 'J1', 1e3, 0.05);
    between(gain, 9.8, 10.3);
    between(sim.pinCurrents(idOf(doc, 'J1'))![0]!, 3.7e-3, 3.9e-3);
    expect(sim.status(idOf(doc, 'J1')).region).toBe('saturation');
    const big = amplifier(withProps(doc, 'FG1', { amplitude: 2 }), 'J1', 1e3, 0.05).out;
    expect(big.max).toBeGreaterThan(14);
    expect(big.min).toBeLessThan(1.5);
  });

  it('BJT (BC107, R_B = 2,2 MΩ, R_C = 5,6 kΩ): I_C ≈ 1,1 mA, V_CE ≈ 5,9 V, kazanç ≈ 215; 1 MHz’te ≈ 150', () => {
    const doc = load('bjt-yukseltec');
    const { sim, gain } = amplifier(doc, 'Q1');
    between(gain, 205, 225);
    between(sim.pinCurrents(idOf(doc, 'Q1'))![0]!, 1.04e-3, 1.13e-3);
    between(sim.measure(idOf(doc, 'Q1'))!.voltage, 5.6, 6.2);
    expect(sim.status(idOf(doc, 'Q1')).region).toBe('active');
    between(amplifier(doc, 'Q1', 1e6, 300e-6).gain, 140, 165);
  });

  it('MOSFET (IRF510, R_D = 10 kΩ, R_S = 1 kΩ, offset 4,55 V): I_D ≈ 0,70 mA, kazanç ≈ 9,7, ters faz', () => {
    const doc = load('mosfet-yukseltec');
    const { sim, gain } = amplifier(doc, 'M1', 1e3, 0.05);
    between(gain, 9.5, 9.9);
    between(sim.pinCurrents(idOf(doc, 'M1'))![0]!, 0.68e-3, 0.72e-3);
    // Ters faz: girişin pozitif tepesinde (1/4 periyot) çıkış en küçük, negatif tepesinde en büyüktür.
    const phase = run(doc, 0.05025);
    const atInputPeak = phase.voltageAt(`${idOf(doc, 'M1')}#0`)!;
    phase.runUntil(0.05075);
    expect(phase.voltageAt(`${idOf(doc, 'M1')}#0`)! - atInputPeak).toBeGreaterThan(0.9);
    const big = amplifier(withProps(doc, 'FG1', { amplitude: 1 }), 'M1', 1e3, 0.05).out;
    between(big.max, 12.6, 13.1);
    between(big.min, 3.0, 3.35);
  });
});

describe('Deney 9: transistör anahtar', () => {
  it('LED kollektörde: giriş 5 V’ta doyum (I_C ≈ 10 mA, V_CE ≈ 0,04 V); 0 V’ta kesim', () => {
    const doc = load('bjt-anahtar');
    const q = idOf(doc, 'Q1');
    const sim = run(doc, 0.25);
    const [ic, ib] = sim.pinCurrents(q)!;
    between(ic!, 9.9e-3, 10.4e-3);
    between(ib!, 0.41e-3, 0.45e-3);
    expect(sim.measure(q)!.voltage).toBeLessThan(0.1);
    expect(sim.status(q).region).toBe('saturation');
    sim.runUntil(0.75);
    expect(Math.abs(sim.pinCurrents(q)![0]!)).toBeLessThan(1e-9);
    expect(sim.status(q).region).toBe('cutoff');
  });

  it('LED emetörde: transistör aktif bölgede kalır, LED’den yalnızca ≈ 2,6 mA geçer (V_CE ≈ 7,8 V)', () => {
    const doc = load('bjt-anahtar-emetor');
    const q = idOf(doc, 'Q1');
    const sim = run(doc, 0.25);
    between(sim.measure(idOf(doc, 'LED1'))!.current, 2.4e-3, 2.7e-3);
    expect(sim.status(q).region).toBe('active');
    between(sim.measure(q)!.voltage, 7.5, 8);
  });
});

describe('Proje: baraj su seviyesi uyarısı', () => {
  // Devreler yavaş (hazne 16 s'de dolar, baz kondansatörünün zaman sabiti ≈ 0,1 s): testte 2 ms adım.
  const simOf = (doc: CircuitDoc) => new CircuitSimulator(buildConnectivity(doc).netlist, { timeStep: 2e-3 });
  /** LED'lerin yanık olup olmadığı (≥ 5 mA). */
  const lit = (sim: CircuitSimulator, doc: CircuitDoc) => ['LED1', 'LED2', 'LED3'].map((l) => sim.measure(idOf(doc, l))!.current > 5e-3);

  it('çubuk gösterge: yeşil ≈ 3,4 s, sarı ≈ 8,4 s, kırmızı ≈ 13,4 s’de eklenir; doluyken üçü doyumda, ≈ 14,5 mA', () => {
    const doc = load('baraj-cubuk');
    const sim = simOf(doc);
    sim.runUntil(3.2);
    expect(lit(sim, doc)).toEqual([false, false, false]);
    sim.runUntil(3.7);
    expect(lit(sim, doc)).toEqual([true, false, false]);
    sim.runUntil(8.7);
    expect(lit(sim, doc)).toEqual([true, true, false]);
    sim.runUntil(13.7);
    expect(lit(sim, doc)).toEqual([true, true, true]);
    for (const q of ['Q1', 'Q2', 'Q3']) {
      expect(sim.status(idOf(doc, q)).region).toBe('saturation');
      between(sim.measure(idOf(doc, q))!.voltage, 0.03, 0.07);
    }
    between(sim.measure(idOf(doc, 'LED1'))!.current, 14e-3, 15e-3);
    // Seviye 1'de baz akımı ≈ 0,55 mA.
    const one = simOf(withProps(doc, 'H1', { level: 45, mode: 'stop' }));
    one.runUntil(2);
    between(one.pinCurrents(idOf(doc, 'Q1'))![1]!, 0.52e-3, 0.57e-3);
    // Çok saf su (1 MΩ): LED'den yalnızca ≈ 0,5 mA geçer.
    const pure = simOf(withProps(doc, 'H1', { level: 45, mode: 'stop', waterResistance: 1e6 }));
    pure.runUntil(5);
    between(pure.measure(idOf(doc, 'LED1'))!.current, 0.3e-3, 0.7e-3);
  });

  it('tek ışık: aynı anda tek LED (yeşil → sarı → kırmızı); doluyken Q3–Q5 doyumda, Q1 ve Q2 kesimde', () => {
    const doc = load('baraj-tek-isik');
    const sim = simOf(doc);
    sim.runUntil(6);
    expect(lit(sim, doc)).toEqual([true, false, false]);
    sim.runUntil(11);
    expect(lit(sim, doc)).toEqual([false, true, false]);
    sim.runUntil(16);
    expect(lit(sim, doc)).toEqual([false, false, true]);
    for (const q of ['Q3', 'Q4', 'Q5']) expect(sim.status(idOf(doc, q)).region).toBe('saturation');
    for (const q of ['Q1', 'Q2']) expect(sim.status(idOf(doc, q)).region).toBe('cutoff');
    expect(sim.measure(idOf(doc, 'Q4'))!.voltage).toBeLessThan(0.02);
    // Boşaltınca ışık geri döner: kırmızı → sarı → yeşil.
    const drain = simOf(withProps(doc, 'H1', { level: 100, mode: 'drain' }));
    drain.runUntil(5);
    expect(lit(drain, doc)).toEqual([false, true, false]);
    drain.runUntil(10);
    expect(lit(drain, doc)).toEqual([true, false, false]);
  });
});

describe('Laboratuvar cihazları', () => {
  it('Toprak tuzağı: topraklı prob yükün − ucundayken yük yalnızca pozitif yarıda akım alır', () => {
    const doc = load('toprak-tuzagi');
    const sim = run(doc, 0.00425);
    const vl = () => sim.measure(idOf(doc, 'RL'))!.voltage;
    expect(vl()).toBeGreaterThan(3.2);
    sim.runUntil(0.00475);
    expect(Math.abs(vl())).toBeLessThan(0.1);
    // Topraksız (yalıtılmış) osiloskopla köprü tam dalga verir.
    const isolated = run(withProps(doc, 'OSC1', { earthed: false }), 0.00425);
    const vi = () => isolated.measure(idOf(doc, 'RL'))!.voltage;
    expect(vi()).toBeGreaterThan(3.2);
    isolated.runUntil(0.00475);
    expect(vi()).toBeGreaterThan(3.2);
  });
});
