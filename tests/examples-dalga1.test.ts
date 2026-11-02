// Parça Dalga 1 örnekleri (akım kaynağı, 7805, LM317, optokuplör, Schottky, köprü diyot, tristör):
// örnek metinlerindeki ("Ne işe yarar?") sayılar simülasyonla tutar.

import { describe, expect, it } from 'vitest';
import { exampleDoc, type ExampleId } from '../src/examples';
import { buildConnectivity } from '../src/model/connectivity';
import { flipParts, updatePart } from '../src/model/docOps';
import type { CircuitDoc } from '../src/model/types';
import { CircuitSimulator } from '../src/sim';
import { lm317Note } from '../src/editor/lm317Divider';
import { schottkyLeakage } from '../src/sim/devices/schottky';
import type { Netlist } from '../src/sim/netlist';
import { formatSI } from '../src/sim/units';

function load(id: ExampleId): CircuitDoc {
  const doc = exampleDoc(id);
  expect(doc, id).not.toBeNull();
  return doc!;
}
const idOf = (doc: CircuitDoc, label: string) => doc.parts.find((p) => p.label === label)!.id;
function withProps(doc: CircuitDoc, label: string, props: Record<string, number | boolean | string>): CircuitDoc {
  const part = doc.parts.find((p) => p.label === label)!;
  return updatePart(doc, part.id, { props: { ...part.props, ...props } });
}
/** Devrenin netlist'i; `pressed` içindeki düğmeler basılı tutuluyor (arayüzdeki gibi). */
function netlist(doc: CircuitDoc, pressed: readonly string[] = []): Netlist {
  const ids = new Set(pressed.map((label) => idOf(doc, label)));
  const n = buildConnectivity(doc).netlist;
  return { ...n, elements: n.elements.map((e) => (ids.has(e.id) ? { ...e, props: { ...e.props, pressed: true } } : e)) };
}
function run(doc: CircuitDoc, until: number, pressed: readonly string[] = []): CircuitSimulator {
  const sim = new CircuitSimulator(netlist(doc, pressed));
  expect(sim.runUntil(until).ok).toBe(true);
  return sim;
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

describe('Parça Dalga 1 örnekleri: metinlerdeki sayılar', { timeout: 60_000 }, () => {
  it('Akım kaynağıyla Ohm yasası: 470 Ω’da 4,70 V, 1 kΩ’da 10,0 V, akım iki durumda da 10,0 mA; 5 mA’de 2,35 V', () => {
    const doc = load('akim-kaynagi-ohm');
    const reading = (sim: CircuitSimulator, label: string) => sim.status(idOf(doc, label)).reading!;
    const a = run(doc, 0.01);
    expect(reading(a, 'MM1')).toBeCloseTo(4.7, 2);
    expect(reading(a, 'A1') * 1e3).toBeCloseTo(10.0, 1);
    const b = run(withProps(doc, 'S1', { to: 'b' }), 0.01);
    expect(reading(b, 'MM1')).toBeCloseTo(10.0, 1);
    expect(reading(b, 'A1') * 1e3).toBeCloseTo(10.0, 1);
    expect(reading(run(withProps(doc, 'I1', { current: 0.005 }), 0.01), 'MM1')).toBeCloseTo(2.35, 2);
  });

  it('7805: 5,00 V, 50,0 mA, ≈ 0,24 W (4,2 mA bekleme); 1 kΩ’da 5,0 mA; 6 V’ta bırakma (≈ 1,5 V), çıkış 4,49 V', () => {
    const doc = load('7805-besleme');
    const u = idOf(doc, 'U1');
    const sim = run(doc, 0.02);
    expect(sim.status(idOf(doc, 'V1')).reading!).toBeCloseTo(5.0, 2);
    expect(sim.measure(idOf(doc, 'RL'))!.current * 1e3).toBeCloseTo(50.0, 1);
    between(sim.status(u).regulator!.power, 0.235, 0.245);
    expect(sim.averagePinCurrents(u)![1]! * -1e3).toBeCloseTo(4.2, 1);
    expect(sim.runtimeDiagnostics).toEqual([]);
    const light = run(withProps(doc, 'RL', { resistance: 1000 }), 0.02);
    expect(light.status(idOf(doc, 'V1')).reading!).toBeCloseTo(5.0, 2);
    expect(light.measure(idOf(doc, 'RL'))!.current * 1e3).toBeCloseTo(5.0, 1);
    const low = run(withProps(doc, 'B1', { voltage: 6 }), 0.02);
    expect(low.status(idOf(doc, 'V1')).reading!).toBeCloseTo(4.49, 2);
    expect(low.status(u).regulator!.dropout).toBe(true);
    const warning = low.runtimeDiagnostics.find((d) => d.code === 'regulator-dropout');
    expect(warning).toBeDefined();
    expect(warning!.params!.needed as number).toBeCloseTo(1.5, 1);
  });

  it('LM317: R1’den 5,2 mA, çıkış 5,04 V (formül 5,00 V), yükte 50,4 mA, LM317’de ≈ 0,39 W; R2 = 480 Ω’da 3,77 V', () => {
    const doc = load('lm317-ayarli');
    const sim = run(doc, 0.02);
    expect(sim.measure(idOf(doc, 'R1'))!.current * 1e3).toBeCloseTo(5.2, 1);
    expect(sim.status(idOf(doc, 'V1')).reading!).toBeCloseTo(5.04, 2);
    expect(1.25 * (1 + 720 / 240)).toBeCloseTo(5.0, 10);
    expect(sim.measure(idOf(doc, 'RL'))!.current * 1e3).toBeCloseTo(50.4, 1);
    expect(sim.status(idOf(doc, 'U1')).regulator!.power).toBeCloseTo(0.39, 2);
    // 100 Ω’da 0,25 W: yük direnci 0,5 W’lık seçildi, uyarı yok.
    expect(sim.runtimeDiagnostics).toEqual([]);
    expect(run(withProps(doc, 'R2', { resistance: 480 }), 0.02).status(idOf(doc, 'V1')).reading!).toBeCloseTo(3.77, 2);
  });

  it('LM317 kartı "Neden bu değer?": 1,25 V · (1 + R2 / R1) + I_ADJ · R2 = 5,036 V; yük regülasyonuyla kartın okuduğu 5,035 V', () => {
    const doc = load('lm317-ayarli');
    const card = (d: CircuitDoc) => {
      const sim = run(d, 0.02);
      const r = sim.status(idOf(d, 'U1')).regulator!;
      const resistance = (label: string) => d.parts.find((p) => p.label === label)!.props.resistance as number;
      return { note: lm317Note({ r1: resistance('R1'), r2: resistance('R2') }, r.current)!, output: formatSI(r.output, 'V', { digits: 4 }), dropout: r.dropout };
    };
    const { note, output } = card(doc);
    expect(output).toBe('5,035 V');
    expect(note).toContain('1,25 V · (1 + 720 Ω / 240 Ω) + 50 µA · 720 Ω = 5,036 V');
    // Notun vardığı sonuç (son gerilim) kartın Çıkış satırıyla aynı.
    const result = (text: string) => text.match(/\d+,\d+ V/g)!.at(-1);
    expect(result(note)).toBe(output);
    // Bırakmada kartta formül yerine uyarı çıkar: girişi aşmayan çıkışlar.
    for (const r2 of [360, 480, 1200]) {
      const other = card(withProps(withProps(doc, 'R2', { resistance: r2 }), 'RL', { powerRating: '2' }));
      expect(other.dropout).toBe(false);
      expect(result(other.note), `${r2} Ω: ${other.note}`).toBe(other.output);
    }
  });

  it('Optokuplör: basılıyken LED 9,7 mA (1,22 V), çıkış doyumda (0,13 V), LED1 7,1 mA; R1 = 3,3 kΩ’da 1,18 mA ve 3,55 mA', () => {
    const doc = load('optokuplor-led');
    const u = idOf(doc, 'U1');
    expect(run(doc, 0.01).measure(idOf(doc, 'LED1'))!.current).toBeLessThan(1e-9);
    const on = run(doc, 0.01, ['BT1']);
    const opto = on.status(u).opto!;
    expect(opto.led * 1e3).toBeCloseTo(9.7, 1);
    expect(opto.ledVoltage).toBeCloseTo(1.22, 2);
    expect(opto.vce).toBeCloseTo(0.13, 2);
    expect(opto.saturated).toBe(true);
    expect(on.measure(idOf(doc, 'LED1'))!.current * 1e3).toBeCloseTo(7.1, 1);
    const dim = run(withProps(doc, 'R1', { resistance: 3300 }), 0.01, ['BT1']).status(u).opto!;
    expect(dim.led * 1e3).toBeCloseTo(1.18, 2);
    expect(dim.saturated).toBe(false);
    expect(dim.ctr).toBe(3);
    expect(dim.output * 1e3).toBeCloseTo(3.55, 2);
  });

  it('Schottky: ≈ 10 mA’de 0,18 V ve 1N4001’de 0,60 V; güç 1,8 / 5,6 mW; 5 V ters yönde 45 µA ve 0,1 µA (≈ 450 kat); eğride 20 V ≈ 0,13 mA, 39 V ≈ 0,29 mA', () => {
    const doc = load('schottky-1n4001');
    const sim = run(doc, 0.01);
    const d1 = sim.measure(idOf(doc, 'D1'))!;
    const d2 = sim.measure(idOf(doc, 'D2'))!;
    for (const d of [d1, d2]) between(d.current, 9e-3, 11e-3);
    expect(sim.status(idOf(doc, 'V1')).reading!).toBeCloseTo(0.18, 2);
    expect(sim.status(idOf(doc, 'V2')).reading!).toBeCloseTo(0.6, 2);
    expect(d1.power * 1e3).toBeCloseTo(1.8, 1);
    expect(d2.power * 1e3).toBeCloseTo(5.6, 1);
    const reverse = run(flipParts(doc, new Set([idOf(doc, 'D1'), idOf(doc, 'D2')])), 0.01);
    const schottky = -reverse.measure(idOf(doc, 'D1'))!.current;
    const silicon = -reverse.measure(idOf(doc, 'D2'))!.current;
    expect(schottky * 1e6).toBeCloseTo(45, 0);
    expect(silicon * 1e6).toBeCloseTo(0.1, 2);
    expect(schottky / silicon / 450).toBeCloseTo(1, 1);
    // Metindeki eğri değerleri (onsemi Şekil 9, 25 °C).
    expect(schottkyLeakage(20).l * 1e3).toBeCloseTo(0.13, 2);
    expect(schottkyLeakage(39).l * 1e3).toBeCloseTo(0.29, 2);
  });

  it('Köprü diyot: filtresiz tepe 8,74 V, DC 5,24 V; 22 µF’ta 6,32–8,72 V (DC 7,59 V); yarım dalgada ≈ 4,3 V; 470 µF’ta 0,14 V', () => {
    const doc = load('kopru-diyot');
    const rl = (sim: CircuitSimulator) => () => sim.measure(idOf(doc, 'RL'))!.voltage;
    const bare = run(doc, 0.2);
    const open = swing(bare, rl(bare), 0.04);
    expect(open.max).toBeCloseTo(8.74, 2);
    expect(10 - open.max).toBeCloseTo(1.26, 2);
    expect(bare.status(idOf(doc, 'V1')).reading!).toBeCloseTo(5.24, 2);
    const filtered = run(withProps(doc, 'S1', { closed: true }), 0.4);
    const c22 = swing(filtered, rl(filtered), 0.04);
    expect(c22.max).toBeCloseTo(8.72, 2);
    expect(c22.min).toBeCloseTo(6.32, 2);
    expect(filtered.status(idOf(doc, 'V1')).reading!).toBeCloseTo(7.59, 2);
    // Yarım dalga örneği (aynı 22 µF ve 1 kΩ): dalgalanma ≈ 4,3 V, burada onun yarısına yakın.
    const half = load('yarim-dalga');
    const halfSim = run(withProps(half, 'S2', { closed: true }), 0.4);
    const h22 = swing(halfSim, () => halfSim.measure(idOf(half, 'RL'))!.voltage, 0.04);
    expect(h22.max - h22.min).toBeCloseTo(4.3, 1);
    between((c22.max - c22.min) / (h22.max - h22.min), 0.5, 0.6);
    const big = withProps(withProps(doc, 'S1', { closed: true }), 'C1', { capacitance: 470e-6 });
    const bigSim = run(big, 1.5);
    const c470 = swing(bigSim, rl(bigSim), 0.04);
    expect(c470.max - c470.min).toBeCloseTo(0.14, 2);
  });

  it('Tristör: BT1’le kapıdan 0,83 mA, LED 13,6 mA, V_{AK} 0,82 V; bırakınca yanık kalır; BT2 söndürür', () => {
    const doc = load('tristor-mandal');
    const scr = idOf(doc, 'SCR1');
    const led = idOf(doc, 'LED1');
    const sim = new CircuitSimulator(netlist(doc));
    const step = (pressed: readonly string[]) => {
      sim.update(netlist(doc, pressed));
      expect(sim.advance(0.05).ok).toBe(true);
    };
    step([]);
    expect(sim.status(scr).scr!.on).toBe(false);
    expect(sim.measure(led)!.current).toBeLessThan(1e-6);
    step(['BT1']);
    expect(sim.status(scr).scr!.gate * 1e3).toBeCloseTo(0.83, 2);
    expect(sim.measure(led)!.current * 1e3).toBeCloseTo(13.6, 1);
    expect(sim.measure(scr)!.voltage).toBeCloseTo(0.82, 2);
    step([]);
    expect(sim.status(scr).scr!.on).toBe(true);
    expect(sim.measure(led)!.current * 1e3).toBeCloseTo(13.6, 1);
    step(['BT2']);
    expect(sim.status(scr).scr!.on).toBe(false);
    step([]);
    expect(sim.status(scr).scr!.on).toBe(false);
    expect(sim.measure(led)!.current).toBeLessThan(1e-6);
  });
});
