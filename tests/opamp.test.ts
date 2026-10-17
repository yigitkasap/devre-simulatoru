// İşlemsel yükselteç (LM741): eviren/evirmeyen yükselteç, doyum, karşılaştırıcı, eğim hızı, kazanç-bant
// genişliği çarpımı, kısa devre akımı. Beklenen değerler kapalı çevrim formüllerinden ve veri sayfasından.

import { describe, expect, it } from 'vitest';
import { exampleDoc, type ExampleId } from '../src/examples';
import { buildConnectivity } from '../src/model/connectivity';
import { updatePart } from '../src/model/docOps';
import type { CircuitDoc } from '../src/model/types';
import { CircuitSimulator, type Netlist } from '../src/sim';
import { OPAMP } from '../src/sim/devices/opamp';
import { circuit } from './helpers';

/** ±15 V besleme (iki pil, ortası toprak) ve [−, +, çıkış, V+, V−] uçlu 741. */
function supplied(build: (b: ReturnType<typeof circuit>) => ReturnType<typeof circuit>, volts = 15): Netlist {
  return build(circuit().battery('BP', 'vp', 'g', volts).battery('BN', 'g', 'vn', volts).ground('G', 'g')).build();
}
const opamp = (b: ReturnType<typeof circuit>, inv: string, non: string, out: string) => b.add('opamp', 'U', [inv, non, out, 'vp', 'vn']);

describe('İşlemsel yükselteç (LM741)', () => {
  it('evirmeyen yükselteç (1 + 100k/10k = 11): 0,5 V → 5,5 V; hata ≈ kazanç/A', () => {
    const s = new CircuitSimulator(supplied((b) => opamp(b.battery('VI', 'i', 'g', 0.5), 'm', 'i', 'o').resistor('R1', 'm', 'g', 10e3).resistor('R2', 'o', 'm', 100e3)));
    s.runUntil(0.3);
    const out = s.measure('U')!.voltage;
    expect(out).toBeCloseTo(5.5 / (1 + 11 / OPAMP.gain), 3);
  });

  it('eviren yükselteç (−100k/10k): 1 V → −10 V; eviren giriş sanal toprak (≈ 50 µV)', () => {
    const s = new CircuitSimulator(supplied((b) => opamp(b.battery('VI', 'i', 'g', 1).resistor('R1', 'i', 'm', 10e3).resistor('R2', 'm', 'o', 100e3), 'm', 'g', 'o')));
    s.runUntil(0.3);
    expect(s.measure('U')!.voltage).toBeCloseTo(-10, 2);
    expect(Math.abs(s.status('U').opamp!.differential)).toBeLessThan(1e-4);
  });

  it('doyum: kazanç 11, giriş 2 V → çıkış 10 kΩ’da ≈ +14 V (veri sayfası), 2 kΩ’da ≈ +13 V', () => {
    for (const [load, want] of [
      [10e3, 14],
      [2e3, 13],
    ] as const) {
      const s = new CircuitSimulator(
        supplied((b) => opamp(b.battery('VI', 'i', 'g', 2), 'm', 'i', 'o').resistor('R1', 'm', 'g', 10e3).resistor('R2', 'o', 'm', 100e3).resistor('RL', 'o', 'g', load)),
      );
      s.runUntil(0.3);
      expect(s.measure('U')!.voltage).toBeCloseTo(want, 0);
      expect(s.status('U').opamp!.mode).toBe('high');
    }
  });

  it('karşılaştırıcı ve eğim hızı: + giriş −1 V’tan +1 V’a geçince çıkış −14 V’tan +14 V’a 0,5 V/µs ile (≈ 56 µs)', () => {
    const net = (v: number) => supplied((b) => opamp(b.battery('VI', 'i', 'g', v), 'g', 'i', 'o').resistor('RL', 'o', 'g', 10e3));
    const s = new CircuitSimulator(net(-1));
    s.runUntil(0.01);
    expect(s.measure('U')!.voltage).toBeLessThan(-13.5);
    s.update(net(1));
    const t0 = s.time;
    let t10 = 0;
    let t90 = 0;
    while (s.time < t0 + 2e-4) {
      s.runUntil(s.time + 2e-7);
      const v = s.measure('U')!.voltage;
      if (!t10 && v > -14 + 2.8) t10 = s.time;
      if (!t90 && v > 14 - 2.8) t90 = s.time;
      if (s.time - t0 > 1e-5 && s.time - t0 < 3e-5) expect(s.status('U').opamp!.mode).toBe('slewing');
    }
    const slope = (0.8 * 28) / (t90 - t10);
    expect(slope / OPAMP.slewRate).toBeGreaterThan(0.95);
    expect(slope / OPAMP.slewRate).toBeLessThan(1.05);
    expect(s.measure('U')!.voltage).toBeGreaterThan(13.5);
  });

  it('küçük fark (1 mV) giriş katını doyurmaz: çıkış eğim hızıyla değil 2π·GBW·v_d ≈ 7,3 V/ms ile değişir', () => {
    const net = (v: number) => supplied((b) => opamp(b.battery('VI', 'i', 'g', v), 'g', 'i', 'o').resistor('RL', 'o', 'g', 10e3));
    const s = new CircuitSimulator(net(-0.001));
    s.runUntil(0.05);
    s.update(net(0.001));
    const t0 = s.time;
    s.runUntil(t0 + 1e-3);
    const v1 = s.measure('U')!.voltage;
    s.runUntil(t0 + 2e-3);
    const rate = (s.measure('U')!.voltage - v1) / 1e-3;
    expect(rate / (2 * Math.PI * OPAMP.gbw * 0.001)).toBeGreaterThan(0.9);
    expect(rate / (2 * Math.PI * OPAMP.gbw * 0.001)).toBeLessThan(1.15);
  });

  it('kazanç-bant genişliği: evirmeyen ×11, 100 kHz’te küçük sinyalde kazanç 11/√(1 + (11·f/GBW)²)', () => {
    const f = 100e3;
    const s = new CircuitSimulator(
      supplied((b) =>
        opamp(b.acsource('VI', 'i', 'g', { waveform: 'sine', amplitude: 0.01, frequency: f, offset: 0 }), 'm', 'i', 'o')
          .resistor('R1', 'm', 'g', 10e3)
          .resistor('R2', 'o', 'm', 100e3),
      ),
    );
    s.runUntil(40 / f);
    let max = 0;
    const t0 = s.time;
    while (s.time < t0 + 2 / f) {
      s.runUntil(s.time + 1 / (f * 200));
      max = Math.max(max, Math.abs(s.measure('U')!.voltage));
    }
    const want = 11 / Math.sqrt(1 + ((11 * f) / OPAMP.gbw) ** 2);
    expect(max / 0.01 / want).toBeGreaterThan(0.97);
    expect(max / 0.01 / want).toBeLessThan(1.03);
  });

  it('kısa devre: çıkış toprağa kısa, çıkış +’ya sürülürken ≈ 25 mA; akım V+ besleme ucundan çekilir', () => {
    const s = new CircuitSimulator(supplied((b) => opamp(b.battery('VI', 'i', 'g', 1), 'g', 'i', 'o').resistor('RS', 'o', 'g', 0.01)));
    s.runUntil(0.01);
    expect(s.measure('RS')!.current).toBeCloseTo(0.025, 3);
    const supply = s.measure('BP')!.current;
    expect(-supply).toBeCloseTo(0.025 + OPAMP.supplyCurrent, 3);
  });
});

function example(id: ExampleId) {
  let doc: CircuitDoc = exampleDoc(id)!;
  const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
  const idOf = (label: string) => doc.parts.find((p) => p.label === label)!.id;
  return {
    sim,
    idOf,
    set(label: string, props: Record<string, number | boolean>) {
      const part = doc.parts.find((p) => p.label === label)!;
      doc = updatePart(doc, part.id, { props: { ...part.props, ...props } });
      sim.update(buildConnectivity(doc).netlist);
    },
  };
}

describe('İşlemsel yükselteç örnekleri: metindeki sayılar', () => {
  it('Evirmeyen ×11: V1 0,354 V, V2 3,889 V; 3 V t-t’de ±14,2 V’ta kırpılır; 20 kHz’te eğim sınırıyla 3,35 V', () => {
    const e = example('opamp-evirmeyen');
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    e.sim.runUntil(0.05);
    expect(e.sim.status(e.idOf('V1')).reading!).toBeCloseTo(0.354, 3);
    expect(e.sim.status(e.idOf('V2')).reading!).toBeCloseTo(3.889, 2);
    e.set('FG1', { amplitude: 3 });
    e.sim.runUntil(e.sim.time + 0.05);
    let max = 0;
    const t0 = e.sim.time;
    while (e.sim.time < t0 + 0.002) {
      e.sim.runUntil(e.sim.time + 5e-6);
      max = Math.max(max, e.sim.measure(e.idOf('U1'))!.voltage);
    }
    expect(max).toBeCloseTo(14.25, 1);
    e.set('FG1', { amplitude: 1, frequency: 20000 });
    e.sim.runUntil(e.sim.time + 0.01);
    expect(e.sim.status(e.idOf('V2')).reading!).toBeCloseTo(3.35, 1);
  });

  it('Eviren ×(−5,6): 1,5 V → −8,40 V, giriş farkı < 100 µV; R2 100 kΩ’da −14,2 V’ta doyum', () => {
    const e = example('opamp-eviren');
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    e.sim.runUntil(0.2);
    expect(e.sim.measure(e.idOf('V2'))!.voltage).toBeCloseTo(-8.4, 2);
    expect(Math.abs(e.sim.status(e.idOf('U1')).opamp!.differential)).toBeLessThan(1e-4);
    expect(e.sim.measure(e.idOf('R1'))!.current).toBeCloseTo(1.5e-4, 6);
    e.set('R2', { resistance: 100000 });
    e.sim.runUntil(e.sim.time + 0.2);
    expect(e.sim.measure(e.idOf('V2'))!.voltage).toBeCloseTo(-14.25, 1);
    expect(e.sim.status(e.idOf('U1')).opamp!.mode).toBe('low');
  });

  it('Karşılaştırıcı: 100 lükste + giriş 10,9 V, çıkış +12,2 V (yeşil 10 mA); 20 lükste yeşil, 19 lükste kırmızı', () => {
    const e = example('opamp-karsilastirici');
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    e.sim.runUntil(0.05);
    expect(e.sim.measure(e.idOf('R3'))!.voltage).toBeCloseTo(10.9, 1);
    expect(e.sim.measure(e.idOf('U1'))!.voltage).toBeCloseTo(12.2, 1);
    expect(e.sim.measure(e.idOf('LED1'))!.current).toBeCloseTo(0.01, 3);
    e.set('LDR1', { illuminance: 20 });
    e.sim.runUntil(e.sim.time + 0.05);
    expect(e.sim.measure(e.idOf('LED1'))!.current).toBeGreaterThan(0.009);
    e.set('LDR1', { illuminance: 19 });
    e.sim.runUntil(e.sim.time + 0.05);
    expect(e.sim.measure(e.idOf('U1'))!.voltage).toBeCloseTo(-12.1, 1);
    expect(e.sim.measure(e.idOf('LED2'))!.current).toBeGreaterThan(0.009);
    expect(e.sim.runtimeDiagnostics).toEqual([]);
  });
});
