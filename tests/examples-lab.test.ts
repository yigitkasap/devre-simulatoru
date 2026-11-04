// Föy örnekleri (Fizik 2. sınıf Elektronik Laboratuvarı, Deney 1–9) ve laboratuvar cihazları:
// metinlerdeki ("Ne işe yarar?") sayılar simülasyonla tutar.

import { describe, expect, it } from 'vitest';
import { buildScopeView } from '../src/editor/scopeView';
import { EXAMPLE_GROUPS } from '../src/examples';
import { buildConnectivity } from '../src/model/connectivity';
import { flipParts } from '../src/model/docOps';
import type { CircuitDoc } from '../src/model/types';
import { tr } from '../src/i18n/tr';
import { CircuitSimulator, OscilloscopeDevice, scopeSettings } from '../src/sim';
import { between, idOf, load, nodeOf, run, swing, withProps } from './ornek-yardimci';

describe('Deney 1: diyot karakteristikleri', () => {
  it('1N4001 doğru akımda (Şekil-2, voltmetre 1 kΩ’un uçlarında): 5 V’ta V_D ≈ 0,56 V, I ≈ 4,44 mA, V_o ≈ 4,44 V; 10 V’ta ≈ 9,4 mA; ters yönde < 1 µA', () => {
    const doc = load('diyot-dc');
    const at = (v: number) => run(withProps(doc, 'PS1', { voltage1: v }), 0);
    const five = at(5);
    between(five.measure(idOf(doc, 'D1'))!.voltage, 0.55, 0.57);
    between(five.status(idOf(doc, 'A1')).reading!, 4.4e-3, 4.48e-3);
    between(five.status(idOf(doc, 'V1')).reading!, 4.4, 4.48);
    between(five.measure(idOf(doc, 'R1'))!.voltage, 4.4, 4.48);
    const ten = at(10);
    between(ten.measure(idOf(doc, 'D1'))!.current, 9.35e-3, 9.45e-3);
    between(at(0.5).measure(idOf(doc, 'D1'))!.current, 0.12e-3, 0.135e-3);
    const reverse = run(flipParts(doc, new Set([idOf(doc, 'D1')])), 0);
    expect(Math.abs(reverse.status(idOf(doc, 'A1')).reading!)).toBeLessThan(1e-6);
  });

  it('1N4001 X-Y (Şekil-3: A girişte, B 1 kΩ’un üst ucunda, COM alt hatta): 1 kHz’te en büyük akım ≈ 4,2 mA (V_D ≈ 0,56 V); 100 kHz’te ≈ −4,8 mA ters akım', () => {
    const doc = load('diyot-karakteristigi');
    const fg = doc.parts.find((p) => p.type === 'funcgen')!;
    expect(fg.props.amplitude).toBe(10);
    expect(fg.props.earthed).toBe(true);
    const d = idOf(doc, 'D1');
    const sim = run(doc, 3e-3);
    const current = swing(sim, () => sim.measure(d)!.current, 2e-3, 1e-5);
    between(current.max, 4.15e-3, 4.3e-3);
    expect(current.min).toBeGreaterThan(-0.15e-3);
    between(swing(sim, () => sim.measure(d)!.voltage, 2e-3, 1e-5).max, 0.54, 0.57);
    const scope = doc.parts.find((p) => p.type === 'oscilloscope')!;
    const view = buildScopeView((sim.device(scope.id) as OscilloscopeDevice).recorder, scopeSettings(scope.props), [true, true]);
    expect(view.xyPath.length).toBeGreaterThan(100);
    expect(scope.props.mode).toBe('xy');
    // B (1 kΩ’un üst ucu, COM’a göre) akımla aynı işaretli: ters çevrilmez.
    expect(scope.props.invertB).toBe(false);
    between(swing(sim, () => sim.measure(idOf(doc, 'R1'))!.voltage, 2e-3, 1e-5).max, 4.15, 4.3);
    const fast = run(withProps(doc, 'FG1', { frequency: 1e5 }), 30e-6);
    between(swing(fast, () => fast.measure(d)!.current, 20e-6, 1e-7).min, -5e-3, -4.5e-3);
  });

  it('Zener 5,6 V: föydeki 5 V genlikte kırılmaz (≈ −4,9 V, ≈ 0,1 mA); 10 V genlikte ters yönde ≈ −5,4 V’ta ≈ 4,4 mA, ileri yönde ≈ 0,7 V’ta ≈ 8,9 mA', () => {
    const doc = load('zener-karakteristigi');
    const small = run(withProps(doc, 'FG1', { amplitude: 10 }), 3e-3);
    const smallV = swing(small, () => small.measure(idOf(doc, 'Z1'))!.voltage, 2e-3, 1e-5);
    between(smallV.min, -4.95, -4.8);
    expect(swing(small, () => small.measure(idOf(doc, 'Z1'))!.current, 2e-3, 1e-5).min).toBeGreaterThan(-0.2e-3);
    const z = idOf(doc, 'Z1');
    const sim = run(doc, 3e-3);
    const i = swing(sim, () => sim.measure(z)!.current, 2e-3, 1e-5);
    between(i.min, -4.5e-3, -4.3e-3);
    between(i.max, 8.8e-3, 9e-3);
    const v = swing(sim, () => sim.measure(z)!.voltage, 2e-3, 1e-5);
    between(v.min, -5.45, -5.3);
    between(v.max, 0.65, 0.72);
  });

  it('LED: en büyük akım ≈ 3,2 mA, o anda V_F ≈ 1,69 V', () => {
    const doc = load('led-karakteristigi');
    const led = idOf(doc, 'LED1');
    const sim = run(doc, 3e-3);
    between(swing(sim, () => sim.measure(led)!.current, 2e-3, 1e-5).max, 3.05e-3, 3.2e-3);
    between(swing(sim, () => sim.measure(led)!.voltage, 2e-3, 1e-5).max, 1.65, 1.72);
  });
});

describe('Deney 2: doğrultucular', () => {
  it('Yarım dalga (Şekil-4a, 3 V genlik, 1 kHz, voltmetre yok): tepe ≈ 2,36 V; 1 µF’ta ≈ 1,0–2,2 V; 22 µF’ta ≈ 1,75–1,81 V; 470 µF’ta dalgalanma ≈ 3 mV; R_L = ∞’da ≈ 2,55 V', () => {
    const doc = load('yarim-dalga');
    const fg = doc.parts.find((p) => p.type === 'funcgen')!;
    expect([fg.props.amplitude, fg.props.frequency]).toEqual([6, 1000]);
    expect(doc.parts.some((p) => p.type === 'voltmeter')).toBe(false);
    const out = (sim: CircuitSimulator) => swing(sim, () => sim.measure(idOf(doc, 'RL'))!.voltage, 0.004, 2e-6);
    const bare = out(run(doc, 0.02));
    between(bare.max, 2.3, 2.42);
    expect(bare.min).toBeGreaterThan(-0.05);
    const r1 = out(run(withProps(doc, 'S1', { closed: true }), 0.05));
    between(r1.min, 0.95, 1.1);
    between(r1.max, 2.15, 2.25);
    const r22 = out(run(withProps(doc, 'S2', { closed: true }), 0.1));
    between(r22.min, 1.72, 1.78);
    between(r22.max, 1.79, 1.84);
    const r470 = out(run(withProps(doc, 'S3', { closed: true }), 1.5));
    expect(r470.max - r470.min).toBeLessThan(0.01);
    between(r470.max, 1.76, 1.8);
    // R_L = ∞ (S4 açık): kondansatör tepeye yakın dolar ve boşalmaz.
    const open = run(withProps(withProps(doc, 'S4', { closed: false }), 'S2', { closed: true }), 0.1);
    between(swing(open, () => open.measure(idOf(doc, 'C2'))!.voltage, 0.004, 2e-6).min, 2.5, 2.6);
    // 470 µF'ın oturması 1 kHz'te 1500 dönem sürer: paralel testlerde 5 s'yi aşabilir.
  }, 30_000);

  it('Köprü (Şekil-5a, 5 V genlik, 1 kHz, D1–D4): 100 kΩ’da iki yarıda da ≈ 4,36 V tepe (A − B ölçümü doğru, prob toprağı toprakta)', () => {
    const doc = load('kopru-dogrultmac');
    expect(['D1', 'D2', 'D3', 'D4'].every((l) => doc.parts.some((p) => p.label === l && p.props.model === '1N4001'))).toBe(true);
    const sim = run(doc, 0.02025);
    const vl = () => sim.measure(idOf(doc, 'RL'))!.voltage;
    between(vl(), 4.3, 4.4);
    sim.runUntil(0.02075);
    between(vl(), 4.3, 4.4);
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

  it('Gerilim katlayıcı (Şekil-10, tam dalga): iki kondansatör eşit dolar; V_ç = 2V_p 5 ms’de ≈ 7,3 V, 50 ms’de ≈ 9,05 V, 0,3 s’de ≈ 9,24 V', () => {
    const doc = load('gerilim-katlayici');
    const vp = (sim: CircuitSimulator) => [sim.measure(idOf(doc, 'C1'))!.voltage, sim.measure(idOf(doc, 'C2'))!.voltage];
    const out = (sim: CircuitSimulator) => vp(sim)[0]! + vp(sim)[1]!;
    const sim = run(doc, 0.005);
    between(out(sim), 7.2, 7.4);
    sim.runUntil(0.05);
    between(out(sim), 8.95, 9.15);
    sim.runUntil(0.3);
    between(out(sim), 9.15, 9.3);
    const [c1, c2] = vp(sim);
    expect(Math.abs(c1! - c2!)).toBeLessThan(0.02);
    // Osiloskop: COM ortada, A üst çıkışta (+V_p), B alt çıkışta (−V_p).
    const scope = doc.parts.find((p) => p.type === 'oscilloscope')!;
    const node = nodeOf(doc);
    expect(node(scope.label, 0)).toBe(node('C1', 0));
    expect(node(scope.label, 1)).toBe(node('C2', 1));
    expect(node(scope.label, 2)).toBe(node('C1', 1));
    expect(node('FG1', 2)).toBe(node('C2', 0));
  });
});

describe('Deney 4: kırpıcılar', () => {
  it('föydeki sıra: Şekil-13a, 13b, 13c, 13d', () => {
    expect(EXAMPLE_GROUPS.find((g) => g.id === 'kirpici')!.ids).toEqual(['seri-kirpici', 'paralel-kirpici', 'cift-kirpici', 'alt-kirpici']);
  });

  it('Seri kırpıcı (13a, katot üreteçte): yalnızca negatif yarı geçer, ≈ −9,47 V', () => {
    const doc = load('seri-kirpici');
    const sim = run(doc, 0.01);
    const out = swing(sim, () => sim.voltageAt(`${idOf(doc, 'D1')}#0`)!, 0.004, 1e-5);
    expect(out.max).toBeLessThan(0.15);
    between(out.min, -9.55, -9.4);
  });

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

  it('13d (iki diyot da katotla çıkışta): D1 altı ≈ 2,51 V’ta keser, üstü geçer; D2 hiç iletmez', () => {
    const doc = load('alt-kirpici');
    const sim = run(doc, 0.01);
    const out = swing(sim, () => sim.voltageAt(`${idOf(doc, 'D1')}#1`)!, 0.004, 1e-5);
    between(out.min, 2.45, 2.55);
    between(out.max, 9.85, 9.95);
    // D2 hep ters kutuplu (≈ −4,5 ile −11,9 V); içinden yalnızca eklem kapasitesinin µA'lık akımı geçer.
    expect(swing(sim, () => sim.measure(idOf(doc, 'D2'))!.voltage, 0.004, 1e-5).max).toBeLessThan(-4);
  });
});

describe('Deney 5: JFET karakteristikleri', () => {
  it('BF245A (Şekil-15: R_G = 10 kΩ, R_D = 100 Ω, V_DD = 10 V): V_GS = 0’da ≈ 4,12 mA (V_DS ≈ 9,59 V), −0,2 V’ta ≈ 3,23 mA, −0,4 V’ta ≈ 2,45 mA; −1,8 V’ta kesim', () => {
    const doc = load('jfet-karakteristik');
    expect(doc.parts.find((p) => p.label === 'RG')!.props.resistance).toBe(10000);
    expect(doc.parts.find((p) => p.label === 'RD')!.props.resistance).toBe(100);
    expect(doc.parts.filter((p) => p.type === 'voltmeter')).toHaveLength(1);
    const at = (vgg: number) => run(withProps(doc, 'PS1', { voltage2: vgg }), 0);
    const id = (vgg: number) => at(vgg).status(idOf(doc, 'A1')).reading!;
    between(id(0), 4.1e-3, 4.14e-3);
    between(at(0).status(idOf(doc, 'V1')).reading!, 9.57, 9.61);
    between(id(0.2), 3.2e-3, 3.26e-3);
    between(id(0.4), 2.42e-3, 2.47e-3);
    expect(id(1.8)).toBeLessThan(1e-6);
    // V_GS = −V_GG: kapı akımı yok, R_G'de gerilim düşmez.
    const sim = at(0.4);
    const j = idOf(doc, 'J1');
    between(sim.voltageAt(`${j}#1`)! - sim.voltageAt(`${j}#2`)!, -0.401, -0.399);
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

  it('JFET (Şekil-17: R_g = 10 kΩ seri, R_D = 2,7 kΩ, V_DD = 15 V, kondansatörsüz): I_D ≈ 3,82 mA, V_DS ≈ 4,70 V, kazanç ≈ 10; 2 V tepe-tepe girişte bozulma', () => {
    const doc = load('fet-yukseltec');
    expect(doc.parts.some((p) => p.type === 'capacitor')).toBe(false);
    expect(doc.parts.find((p) => p.label === 'RG')!.props.resistance).toBe(10000);
    const { sim, gain } = amplifier(doc, 'J1', 1e3, 0.05);
    between(gain, 9.9, 10.2);
    between(sim.pinCurrents(idOf(doc, 'J1'))![0]!, 3.75e-3, 3.9e-3);
    between(sim.voltageAt(`${idOf(doc, 'J1')}#0`)!, 4.6, 4.8);
    expect(sim.status(idOf(doc, 'J1')).region).toBe('saturation');
    const big = amplifier(withProps(doc, 'FG1', { amplitude: 2 }), 'J1', 1e3, 0.05).out;
    expect(big.max).toBeGreaterThan(12.5);
    expect(big.min).toBeLessThan(1.3);
  });

  it('JFET, kuplajlı (ek, föyde yok: R_G = 1 MΩ, R_D = 2,7 kΩ): I_D ≈ 3,8 mA, kazanç ≈ 10; 2 V tepe-tepe girişte bozulma', () => {
    const doc = load('fet-yukseltec-kuplajli');
    const { sim, gain } = amplifier(doc, 'J1', 1e3, 0.05);
    between(gain, 9.8, 10.3);
    between(sim.pinCurrents(idOf(doc, 'J1'))![0]!, 3.7e-3, 3.9e-3);
    expect(sim.status(idOf(doc, 'J1')).region).toBe('saturation');
    const big = amplifier(withProps(doc, 'FG1', { amplitude: 2 }), 'J1', 1e3, 0.05).out;
    expect(big.max).toBeGreaterThan(14);
    expect(big.min).toBeLessThan(1.5);
  });

  it('BJT (Şekil-18: R_B = 10 kΩ seri, R_C = 1 kΩ, V_CC = 12 V, ofset 0,98 V): I_C ≈ 5,98 mA, V_CE ≈ 6,0 V; tasarım K = β R_C / R_B = 20, ölçülen ≈ 16,3 (r_π ve küçük işaret β); 1 MHz’te ≈ 5,6', () => {
    const doc = load('bjt-yukseltec');
    expect(doc.parts.some((p) => p.type === 'capacitor')).toBe(false);
    const fg = doc.parts.find((p) => p.label === 'FG1')!.props;
    expect([fg.offset, fg.amplitude, fg.attenuate]).toEqual([0.98, 0.2, false]);
    const { sim, gain } = amplifier(doc, 'Q1', 1e3, 0.05);
    between(gain, 16, 16.7);
    between(sim.pinCurrents(idOf(doc, 'Q1'))![0]!, 5.85e-3, 6.1e-3);
    between(sim.measure(idOf(doc, 'Q1'))!.voltage, 5.9, 6.15);
    expect(sim.status(idOf(doc, 'Q1')).region).toBe('active');
    between(amplifier(doc, 'Q1', 1e6, 30e-6).gain, 5.2, 6.1);
  });

  it('BJT, kuplajlı (ek, föyde yok: R_B = 2,2 MΩ, R_C = 5,6 kΩ): I_C ≈ 1,05 mA, V_CE ≈ 6,1 V, kazanç ≈ 204; 1 MHz’te ≈ 127', () => {
    // Gummel-Poon kartı (ters Early gerilimi VAR, FC = 0,96): eski Ebers-Moll modelinde 1,1 mA, 215, 150.
    const doc = load('bjt-yukseltec-kuplajli');
    const { sim, gain } = amplifier(doc, 'Q1');
    between(gain, 196, 212);
    between(sim.pinCurrents(idOf(doc, 'Q1'))![0]!, 1.0e-3, 1.09e-3);
    between(sim.measure(idOf(doc, 'Q1'))!.voltage, 5.8, 6.4);
    expect(sim.status(idOf(doc, 'Q1')).region).toBe('active');
    between(amplifier(doc, 'Q1', 1e6, 300e-6).gain, 115, 140);
  });

  it('MOSFET (Şekil-21: 10 kΩ seri, R_S yok, R_D = 1 kΩ, V_DD = 15 V, ofset 3,907 V): I_D ≈ 7,5 mA, V_DS ≈ 7,5 V; küçük işaret kazancı ≈ 172; 0,1 V t-t’de ≈ 2,25–13,97 V; ofsette 1 mV ≈ 0,19 V', () => {
    const doc = load('mosfet-yukseltec');
    expect(doc.parts.some((p) => p.label === 'RS')).toBe(false);
    const op = (offset: number) => run(withProps(withProps(doc, 'FG1', { amplitude: 0 }), 'FG1', { offset }), 0.002);
    const q = op(3.907);
    between(q.voltageAt(`${idOf(doc, 'M1')}#0`)!, 7.4, 7.6);
    between(q.pinCurrents(idOf(doc, 'M1'))![0]!, 7.4e-3, 7.6e-3);
    // Ofsetin hassasiyeti: 1 mV, V_DS'yi ≈ 0,19 V kaydırır.
    between(op(3.906).voltageAt(`${idOf(doc, 'M1')}#0`)! - op(3.908).voltageAt(`${idOf(doc, 'M1')}#0`)!, 0.35, 0.42);
    between(amplifier(withProps(doc, 'FG1', { amplitude: 0.01 }), 'M1', 1e3, 0.005).gain, 165, 180);
    const big = amplifier(doc, 'M1', 1e3, 0.005).out;
    between(big.max, 13.8, 14.1);
    between(big.min, 2.1, 2.4);
  });

  it('MOSFET, R_S’li (ek, föyde yok: IRF510, R_D = 10 kΩ, R_S = 1 kΩ, offset 4,55 V): I_D ≈ 0,70 mA, kazanç ≈ 9,7, ters faz', () => {
    const doc = load('mosfet-yukseltec-rs');
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

describe('Föydeki sorular: cevaplardaki sayılar', () => {
  /** Yükseltecin kazancı (çıkış tepe-tepe / giriş tepe-tepe) ve çıkışın uçları. */
  function gainOf(doc: CircuitDoc, q: string, until: number) {
    const fg = doc.parts.find((p) => p.label === 'FG1')!.props;
    const sim = run(doc, until);
    const out = swing(sim, () => sim.voltageAt(`${idOf(doc, q)}#0`)!, 2e-3, 1e-5);
    return { sim, out, gain: (out.max - out.min) / (fg.amplitude as number) };
  }

  it('kartlarda soru var: Deney 7 (1. adım), Deney 8 (3., 4., 5. adım)', () => {
    expect(tr.examples.texts['bjt-yukseltec'].questions!.map((q) => q.step)).toEqual(['Deney 7 · 1. adım']);
    expect(tr.examples.texts['mosfet-yukseltec'].questions!.map((q) => q.step)).toEqual(['Deney 8 · 3. adım', 'Deney 8 · 4. adım', 'Deney 8 · 5. adım']);
  });

  it('Deney 7: R_B = 8,2 kΩ ve ofset 0,928 V’ta V_CE ≈ 6,0 V, kazanç ≈ 19,5 (R_B = 10 kΩ’da 16,3)', () => {
    const doc = withProps(withProps(load('bjt-yukseltec'), 'RB', { resistance: 8200 }), 'FG1', { offset: 0.928 });
    const op = run(withProps(doc, 'FG1', { amplitude: 0 }), 2e-3);
    between(op.measure(idOf(doc, 'Q1'))!.voltage, 5.9, 6.1);
    const { out, gain } = gainOf(doc, 'Q1', 5e-3);
    between(gain, 19.3, 19.8);
    between(out.min, 4.0, 4.2);
    between(out.max, 7.9, 8.1);
  });

  it('Deney 8: faz 180° (10 mV t-t: + tepede ≈ 6,73 V, − tepede ≈ 8,29 V); 1 V t-t’de ≈ 0,01–15,0 V', () => {
    const small = withProps(load('mosfet-yukseltec'), 'FG1', { amplitude: 0.01 });
    const sim = run(small, 0.00525);
    between(sim.voltageAt(`${idOf(small, 'M1')}#0`)!, 6.65, 6.8);
    sim.runUntil(0.00575);
    between(sim.voltageAt(`${idOf(small, 'M1')}#0`)!, 8.2, 8.35);
    const { out } = gainOf(withProps(load('mosfet-yukseltec'), 'FG1', { amplitude: 1 }), 'M1', 5e-3);
    expect(out.min).toBeLessThan(0.05);
    expect(out.max).toBeGreaterThan(14.95);
  });

  it('Deney 6: 1 V t-t girişte kazanç ≈ 8; çıkış girişle ters fazlı', () => {
    between(gainOf(withProps(load('fet-yukseltec'), 'FG1', { amplitude: 1 }), 'J1', 0.05).gain, 7.8, 8.2);
    const doc = load('fet-yukseltec');
    const sim = run(doc, 0.05025);
    const atPositive = sim.voltageAt(`${idOf(doc, 'J1')}#0`)!;
    sim.runUntil(0.05075);
    expect(sim.voltageAt(`${idOf(doc, 'J1')}#0`)! - atPositive).toBeGreaterThan(4);
  });
});

describe('Deney 9: transistör anahtar', () => {
  it('Şekil-24 (LED transistöre paralel): TTL 5 V’ta doyum (I_C ≈ 11,95 mA, V_CE ≈ 0,05 V), LED söner; 0 V’ta kesim, LED ≈ 10,2 mA ile yanar', () => {
    const doc = load('bjt-anahtar');
    expect(doc.parts.some((p) => p.type === 'oscilloscope')).toBe(false);
    const q = idOf(doc, 'Q1');
    const led = idOf(doc, 'LED1');
    const sim = run(doc, 0.25);
    const [ic, ib] = sim.pinCurrents(q)!;
    between(ic!, 11.8e-3, 12.1e-3);
    between(ib!, 0.41e-3, 0.45e-3);
    expect(sim.measure(q)!.voltage).toBeLessThan(0.1);
    expect(sim.status(q).region).toBe('saturation');
    expect(sim.measure(led)!.current).toBeLessThan(1e-6);
    sim.runUntil(0.75);
    // Kesimde kollektör akımı yalnızca eklem kapasitelerinin yamuk kuralı salınımı (± ≈ 5 µA, işareti
    // her adımda değişir); LED'in akımının binde birinden az.
    expect(Math.abs(sim.pinCurrents(q)![0]!)).toBeLessThan(1e-5);
    expect(sim.status(q).region).toBe('cutoff');
    between(sim.measure(led)!.current, 10e-3, 10.4e-3);
  });

  it('Şekil-25 (emetör → R2 → LED → ortak hat): TTL 5 V’ta transistör aktif bölgede, LED’den ≈ 2,55 mA (V_CE ≈ 7,8 V); 0 V’ta söner', () => {
    const doc = load('bjt-anahtar-emetor');
    const q = idOf(doc, 'Q1');
    // Sıra: emetör → R2 → LED'in anodu; LED'in katodu ortak hatta.
    const node = nodeOf(doc);
    expect(node('Q1', 2)).toBe(node('R2', 0));
    expect(node('R2', 1)).toBe(node('LED1', 0));
    expect(node('LED1', 1)).toBe(node('GND1', 0));
    const sim = run(doc, 0.25);
    between(sim.measure(idOf(doc, 'LED1'))!.current, 2.4e-3, 2.7e-3);
    expect(sim.status(q).region).toBe('active');
    between(sim.measure(q)!.voltage, 7.5, 8);
    sim.runUntil(0.75);
    expect(Math.abs(sim.measure(idOf(doc, 'LED1'))!.current)).toBeLessThan(1e-6);
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
    // Seviye 1'de baz akımı ≈ 0,43 mA: (9 V − 0,65 V − ≈ 1,7 V elektroliz) / 15 kΩ.
    const one = simOf(withProps(doc, 'H1', { level: 45, mode: 'stop' }));
    one.runUntil(2);
    between(one.pinCurrents(idOf(doc, 'Q1'))![1]!, 0.41e-3, 0.45e-3);
    between(one.status(idOf(doc, 'H1')).polarization!, 1.65, 1.75);
    // Çok saf su (1 MΩ): LED'den yalnızca ≈ 0,25 mA geçer.
    const pure = simOf(withProps(doc, 'H1', { level: 45, mode: 'stop', waterResistance: 1e6 }));
    pure.runUntil(5);
    between(pure.measure(idOf(doc, 'LED1'))!.current, 0.15e-3, 0.35e-3);
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
