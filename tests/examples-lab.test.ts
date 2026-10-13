// Laboratuvar örnekleri (diyot uygulamaları ve transistörler): cevap metinlerindeki sayılar
// simülasyonla tutar.

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
  while (sim.time < end - 1e-12) {
    expect(sim.advance(slice).ok).toBe(true);
    const v = value();
    max = Math.max(max, v);
    min = Math.min(min, v);
  }
  return { max, min };
}

describe('Diyot uygulamaları', () => {
  it('Diyot karakteristiği: en büyük akım ≈ 3,96 mA, o anda V_D ≈ 0,65 V; X-Y eğrisi çizilir', () => {
    const doc = load('diyot-karakteristigi');
    const sim = run(doc, 1);
    const d = idOf(doc, 'D1');
    const current = swing(sim, () => sim.measure(d)!.current, 1, 1e-3);
    expect(current.max).toBeGreaterThan(3.9e-3);
    expect(current.max).toBeLessThan(4.0e-3);
    expect(current.min).toBeGreaterThan(-1e-9);
    const voltage = swing(sim, () => sim.measure(d)!.voltage, 1, 1e-3);
    expect(voltage.max).toBeGreaterThan(0.63);
    expect(voltage.max).toBeLessThan(0.66);
    const scope = doc.parts.find((p) => p.type === 'oscilloscope')!;
    const view = buildScopeView((sim.device(scope.id) as OscilloscopeDevice).recorder, scopeSettings(scope.props), [true, true]);
    expect(view.xyPath.length).toBeGreaterThan(1000);
  });

  it('Orta uçlu tam dalga: tepe ≈ 9,3 V, çıkış frekansı 100 Hz', () => {
    const doc = load('tam-dalga-orta-uclu');
    const sim = run(doc, 0.1);
    const out = swing(sim, () => sim.measure(idOf(doc, 'RL'))!.voltage, 0.04);
    expect(out.max).toBeGreaterThan(9.25);
    expect(out.max).toBeLessThan(9.4);
    expect(out.min).toBeGreaterThan(-0.01);
    const scope = doc.parts.find((p) => p.type === 'oscilloscope')!;
    const view = buildScopeView((sim.device(scope.id) as OscilloscopeDevice).recorder, scopeSettings(scope.props), [true, true]);
    expect(view.channels[1].stats!.frequency).toBeCloseTo(100, 0);
    expect(view.channels[0].stats!.frequency).toBeCloseTo(50, 0);
  });

  it('Köprü doğrultmaç: tepe ≈ 8,7 V; filtre kondansatörüyle dalgalanma ≈ 0,7 V tepe-tepe', () => {
    const doc = load('kopru-filtre');
    const open = run(doc, 0.1);
    const raw = swing(open, () => open.measure(idOf(doc, 'RL'))!.voltage, 0.04);
    expect(raw.max).toBeGreaterThan(8.55);
    expect(raw.max).toBeLessThan(8.75);
    const filtered = withProps(doc, 'S1', { closed: true });
    const sim = run(filtered, 1);
    const out = swing(sim, () => sim.measure(idOf(doc, 'RL'))!.voltage, 0.04);
    expect(out.max - out.min).toBeGreaterThan(0.6);
    expect(out.max - out.min).toBeLessThan(0.8);
    expect(out.min).toBeGreaterThan(7.8);
  });

  it('Pozitif kenetleyici: çıkış ≈ −0,6 V ile ≈ 9,4 V arasında; tepe-tepe 10 V', () => {
    const doc = load('pozitif-kenetleyici');
    const sim = run(doc, 0.2);
    const out = swing(sim, () => sim.measure(idOf(doc, 'RL'))!.voltage, 0.04);
    expect(out.min).toBeGreaterThan(-0.7);
    expect(out.min).toBeLessThan(-0.5);
    expect(out.max).toBeGreaterThan(9.3);
    expect(out.max).toBeLessThan(9.5);
    expect(out.max - out.min).toBeCloseTo(10, 1);
    const negative = run(flipParts(doc, new Set([idOf(doc, 'D1')])), 0.2);
    const neg = swing(negative, () => negative.measure(idOf(doc, 'RL'))!.voltage, 0.04);
    expect(neg.max).toBeLessThan(0.7);
    expect(neg.min).toBeLessThan(-9.3);
  });

  it('Gerilim ikileyici: çıkış ≈ 8,7 V, 0,2 s içinde dolar', () => {
    const doc = load('gerilim-ikileyici');
    const sim = run(doc, 0.2);
    expect(sim.measure(idOf(doc, 'C2'))!.voltage).toBeGreaterThan(8.6);
    sim.runUntil(0.5);
    const reading = sim.status(idOf(doc, 'V1')).reading!;
    expect(reading).toBeGreaterThan(8.6);
    expect(reading).toBeLessThan(8.8);
  });

  it('Öngerilimli paralel kırpıcı: pozitif tepeler ≈ 3,7 V’ta kırpılır, negatif yarı geçer', () => {
    const doc = load('paralel-kirpici');
    const sim = run(doc, 0.1);
    const out = swing(sim, () => sim.voltageAt(`${idOf(doc, 'D1')}#0`)!, 0.04);
    expect(out.max).toBeGreaterThan(3.6);
    expect(out.max).toBeLessThan(3.75);
    expect(out.min).toBeLessThan(-9.99);
  });

  it('Çift yönlü zener kırpıcı: ≈ ±5,5 V’ta kırpar', () => {
    const doc = load('zener-kirpici');
    const sim = run(doc, 0.1);
    const out = swing(sim, () => sim.voltageAt(`${idOf(doc, 'R1')}#1`)!, 0.04);
    expect(out.max).toBeGreaterThan(5.4);
    expect(out.max).toBeLessThan(5.7);
    expect(out.min).toBeLessThan(-5.4);
    expect(out.min).toBeGreaterThan(-5.7);
  });
});

describe('Transistörler', () => {
  const drainSwing = (doc: CircuitDoc) => {
    const sim = run(doc, 1);
    return swing(sim, () => sim.pinCurrents(idOf(doc, 'J1'))![0]!, 1, 1e-3);
  };

  it('JFET çıkış karakteristiği: V_GS = −0,5 V’ta 10 V’taki akım ≈ 1,47 mA; 0 V’ta ≈ 3,3 mA; −1 V’ta ≈ 0,37 mA', () => {
    const doc = load('fet-cikis-karakteristigi');
    expect(drainSwing(doc).max).toBeCloseTo(1.467e-3, 4);
    expect(drainSwing(withProps(doc, 'VGG', { voltage: 0 })).max).toBeCloseTo(3.3e-3, 4);
    expect(drainSwing(withProps(doc, 'VGG', { voltage: 1 })).max).toBeCloseTo(0.367e-3, 4);
  });

  it('JFET transfer karakteristiği: en büyük akım ≈ 3,3 mA, V_GS = −1,5 V’ta kesim', () => {
    const doc = load('fet-transfer-karakteristigi');
    const s = drainSwing(doc);
    expect(s.max).toBeGreaterThan(3.25e-3);
    expect(s.max).toBeLessThan(3.35e-3);
    expect(s.min).toBeLessThan(1e-9);
  });

  /** Yükselteç: girişin tepe anında çıkış / giriş (işaretli kazanç). */
  function gain(id: ExampleId): { gain: number; peak: number } {
    const doc = load(id);
    const sim = run(doc, 0.05);
    const out = swing(sim, () => sim.measure(idOf(doc, 'RL'))!.voltage, 0.004, 1e-5);
    sim.runUntil(0.30025);
    const vin = sim.measure(idOf(doc, 'AC1'))!.voltage;
    return { gain: sim.measure(idOf(doc, 'RL'))!.voltage / vin, peak: (out.max - out.min) / 2 };
  }

  it('JFET’li yükselteç: kazanç ≈ −12, çıkış ≈ 0,6 V tepe', () => {
    const { gain: g, peak } = gain('fet-yukseltec');
    expect(g).toBeLessThan(-11);
    expect(g).toBeGreaterThan(-13);
    expect(peak).toBeGreaterThan(0.55);
    expect(peak).toBeLessThan(0.65);
  });

  it('BJT’li yükselteç: kazanç ≈ −155, çıkış ≈ 0,78 V tepe; çalışma noktası I_C ≈ 0,96 mA', () => {
    const { gain: g, peak } = gain('bjt-yukseltec');
    expect(g).toBeLessThan(-145);
    expect(g).toBeGreaterThan(-170);
    expect(peak).toBeGreaterThan(0.73);
    expect(peak).toBeLessThan(0.83);
    const doc = load('bjt-yukseltec');
    const sim = run(doc, 0.0101);
    expect(sim.status(idOf(doc, 'Q1')).region).toBe('active');
  });

  it('MOSFET’li yükselteç: kazanç ≈ −54', () => {
    const { gain: g } = gain('mosfet-yukseltec');
    expect(g).toBeLessThan(-50);
    expect(g).toBeGreaterThan(-58);
  });

  it('BJT anahtar: giriş 5 V’ta doyum (I_C ≈ 18 mA, V_CE ≈ 0,06 V, LED yanar); 0 V’ta kesim', () => {
    const doc = load('bjt-anahtar');
    const sim = run(doc, 0.25);
    const q = idOf(doc, 'Q1');
    const [ic, ib] = sim.pinCurrents(q)!;
    expect(ic!).toBeGreaterThan(17.5e-3);
    expect(ic!).toBeLessThan(19e-3);
    expect(ib!).toBeGreaterThan(0.4e-3);
    expect(ib!).toBeLessThan(0.45e-3);
    expect(sim.measure(q)!.voltage).toBeLessThan(0.1);
    expect(sim.status(q).region).toBe('saturation');
    expect(sim.status(idOf(doc, 'LED1')).brightness!).toBeGreaterThan(0.9);
    sim.runUntil(0.75);
    expect(Math.abs(sim.pinCurrents(q)![0]!)).toBeLessThan(1e-9);
    expect(sim.status(q).region).toBe('cutoff');
  });

  it('MOSFET anahtar: kapalı anahtarla omik bölge, V_DS ≈ 0,06 V, I_D ≈ 17 mA, kapı akımı 0; açıkken kesim', () => {
    const doc = load('mosfet-anahtar');
    const off = run(doc, 0);
    expect(Math.abs(off.pinCurrents(idOf(doc, 'M1'))![0]!)).toBeLessThan(1e-9);
    expect(off.status(idOf(doc, 'M1')).region).toBe('cutoff');
    const on = run(withProps(doc, 'S1', { closed: true }), 0);
    const [id, ig] = on.pinCurrents(idOf(doc, 'M1'))!;
    expect(id!).toBeGreaterThan(16.5e-3);
    expect(id!).toBeLessThan(18e-3);
    expect(ig).toBe(0);
    expect(on.status(idOf(doc, 'V1')).reading!).toBeGreaterThan(0.05);
    expect(on.status(idOf(doc, 'V1')).reading!).toBeLessThan(0.07);
    expect(on.status(idOf(doc, 'M1')).region).toBe('ohmic');
  });
});
