// Ayarlı parçalar ve sensörler: potansiyometre, LDR, NTC termistör, akkor lamba. Beklenen değerler
// veri sayfalarından ve analitik çözümlerden.

import { describe, expect, it } from 'vitest';
import { exampleDoc, type ExampleId } from '../src/examples';
import { buildConnectivity } from '../src/model/connectivity';
import { updatePart } from '../src/model/docOps';
import type { CircuitDoc } from '../src/model/types';
import { CircuitSimulator } from '../src/sim';
import { LampDevice, lampParameters, LAMP_RATED_TEMPERATURE, ntcRatio, NTC_DISSIPATION } from '../src/sim/devices/sensors';
import { circuit } from './helpers';

describe('Potansiyometre (Bourns PTV09A, 10 kΩ)', () => {
  it('yüksüz sürgü gerilimi V·R₂₃/R: %0’da ≈ V·0,99, %50’de V/2, %100’de ≈ V·0,01 (artık direnç %1)', () => {
    for (const [position, want] of [
      [0, 0.99],
      [25, 0.745],
      [50, 0.5],
      [100, 0.01],
    ] as const) {
      const s = new CircuitSimulator(
        circuit().battery('B', 'p', 'g', 10).ground('G', 'g').add('potentiometer', 'P', ['p', 'w', 'g'], { position }).voltmeter('V', 'w', 'g', 'ideal').build(),
      );
      s.runUntil(1e-3);
      expect(s.status('V').reading ?? s.measure('V')!.voltage).toBeCloseTo(10 * want, 3);
    }
  });

  it('sürgüden yük çekilince gerilim düşer (yükleme): %50’de 10 kΩ yükle V·R‖R_L/(R/2 + R‖R_L)', () => {
    const s = new CircuitSimulator(
      circuit().battery('B', 'p', 'g', 10).ground('G', 'g').add('potentiometer', 'P', ['p', 'w', 'g'], { position: 50 }).resistor('RL', 'w', 'g', 10e3).build(),
    );
    s.runUntil(1e-3);
    const parallel = (5e3 * 10e3) / 15e3;
    expect(s.measure('RL')!.voltage).toBeCloseTo((10 * parallel) / (5e3 + parallel), 4);
  });

  it('0,05 W’ı aşınca uyarı: 1 kΩ’luk potun ucuna 12 V (0,144 W)', () => {
    const s = new CircuitSimulator(circuit().battery('B', 'p', 'g', 12).ground('G', 'g').add('potentiometer', 'P', ['p', 'w', 'g'], { resistance: 1000 }).build());
    s.runUntil(1e-3);
    expect(s.runtimeDiagnostics.map((d) => d.code)).toContain('resistor-overpower');
  });
});

describe('LDR (GL5528)', () => {
  const resistanceAt = (illuminance: number) => {
    const s = new CircuitSimulator(circuit().battery('B', 'p', 'g', 5).ground('G', 'g').add('ldr', 'R', ['p', 'g'], { illuminance }).build());
    s.runUntil(1e-3);
    return 5 / s.measure('R')!.current;
  };
  it('10 lükste 15 kΩ, 100 lükste R₁₀/10^γ (γ = 0,6), karanlıkta 1 MΩ', () => {
    const r10 = resistanceAt(10);
    expect(r10).toBeCloseTo(1 / (1 / 15e3 + 1 / 1e6), -1);
    expect(Math.log10(resistanceAt(10) / resistanceAt(100))).toBeCloseTo(0.6, 1);
    expect(resistanceAt(0)).toBeCloseTo(1e6, -2);
    expect(resistanceAt(10000)).toBeLessThan(300);
  });
});

describe('NTC termistör (Vishay NTCLE100E3103)', () => {
  it('üreticinin eğrisi veri sayfasının tablosunu tutturur (10 kΩ): −40 °C 332 094 Ω, 0 °C 32 554 Ω, 50 °C 3605 Ω, 100 °C 677,3 Ω; B₂₅/₈₅ = 3977 K', () => {
    expect(ntcRatio(298.15).ratio).toBeCloseTo(1, 3);
    const b = Math.log(ntcRatio(298.15).ratio / ntcRatio(358.15).ratio) / (1 / 298.15 - 1 / 358.15);
    expect(b).toBeCloseTo(3977, -1);
    for (const [celsius, ohms] of [
      [-40, 332094],
      [0, 32554],
      [50, 3605],
      [100, 677.3],
    ] as const) {
      expect(Math.abs((1e4 * ntcRatio(celsius + 273.15).ratio) / ohms - 1)).toBeLessThan(2e-3);
    }
  });

  it('gerilim bölücüde (5 V, NTC üstte, 10 kΩ altta): 25 °C’ta 2,5 V, 0 °C’ta ≈ 1,18 V, 50 °C’ta ≈ 3,67 V (ortam hemen uygulanır)', () => {
    const net = (temperature: number) =>
      circuit().battery('B', 'p', 'g', 5).ground('G', 'g').add('ntc', 'T', ['p', 'o'], { temperature }).resistor('R', 'o', 'g', 10e3).build();
    const s = new CircuitSimulator(net(25));
    s.runUntil(0.05);
    expect(s.measure('R')!.voltage).toBeCloseTo(2.5, 2);
    for (const [celsius, ohms] of [
      [0, 32554],
      [50, 3605],
    ] as const) {
      s.update(net(celsius));
      s.runUntil(s.time + 0.05);
      expect(s.measure('R')!.voltage).toBeCloseTo((5 * 10e3) / (10e3 + ohms), 2);
    }
  });

  it('öz ısınma 15 s’lik zaman sabitiyle: 3 s’de P/δ·(1 − e^(−0,2)); 10 V’ta ısınır ve direnci düşer', () => {
    const s = new CircuitSimulator(circuit().battery('B', 'p', 'g', 5).ground('G', 'g').add('ntc', 'T', ['p', 'o']).resistor('R', 'o', 'g', 10e3).build());
    s.runUntil(3);
    const rise = s.status('T').temperature! - 298.15;
    const power = s.measure('T')!.voltage * s.measure('T')!.current;
    expect(rise / ((power / NTC_DISSIPATION) * (1 - Math.exp(-0.2)))).toBeCloseTo(1, 2);
    const hot = new CircuitSimulator(circuit().battery('B', 'p', 'g', 10).ground('G', 'g').add('ntc', 'T', ['p', 'o']).resistor('R', 'o', 'g', 100).build());
    hot.runUntil(3);
    // 10 V / 10,1 kΩ: P ≈ 9,8 mW, θ∞ = P/δ ≈ 1,4 K; 3 s'de ≈ %18'i.
    expect(hot.status('T').temperature! - 298.15).toBeGreaterThan(0.2);
    expect(hot.status('T').temperature! - 298.15).toBeLessThan(0.3);
    expect(hot.status('T').resistance!).toBeLessThan(9.95e3);
  }, 30000);
});

describe('Akkor lamba (12 V, 0,1 A)', () => {
  const q = lampParameters({});
  const lamp = (volts: number, closed = true) =>
    circuit().battery('B', 'p', 'g', volts).ground('G', 'g').switch('S', 'p', 'a', closed).add('lamp', 'L', ['a', 'g']).build();

  it('anma geriliminde 0,1 A (120 Ω, 2500 K); soğuk direnç ≈ 8,9 Ω (13,5 kat)', () => {
    const s = new CircuitSimulator(lamp(12));
    s.runUntil(0.3);
    expect(s.measure('L')!.current).toBeCloseTo(0.1, 4);
    expect(s.status('L').temperature!).toBeCloseTo(LAMP_RATED_TEMPERATURE, 0);
    expect(q.cold).toBeGreaterThan(8.7);
    expect(q.cold).toBeLessThan(9.1);
    expect(q.hot / q.cold).toBeCloseTo(13.5, 0);
  });

  it('ilk an akımı: anahtar kapanınca ≈ 1,35 A (12 V / R_soğuk), birkaç ms içinde 0,1 A’e iner', () => {
    const s = new CircuitSimulator(lamp(12));
    let peak = 0;
    while (s.time < 2e-4) {
      s.runUntil(s.time + 1e-6);
      peak = Math.max(peak, s.measure('L')!.current);
    }
    expect(peak).toBeGreaterThan(1.2);
    expect(peak).toBeLessThan(12 / q.cold + 1e-3);
    s.runUntil(0.02);
    expect(s.measure('L')!.current).toBeLessThan(0.13);
    s.runUntil(0.1);
    expect(s.measure('L')!.current).toBeCloseTo(0.1, 3);
  });

  it('enerji korunumu: pilin verdiği enerji = ışınım + filamanın ısısı (C·ΔT), %0,5', () => {
    const s = new CircuitSimulator(lamp(12));
    let input = 0;
    let radiated = 0;
    let last = { p: 0, r: 0 };
    let t = 0;
    while (s.time < 0.03) {
      s.runUntil(s.time + 1e-5);
      const dt = s.time - t;
      t = s.time;
      const m = s.measure('L')!;
      const T = s.status('L').temperature!;
      const now = { p: m.voltage * m.current, r: q.k * (T ** 4 - 293.15 ** 4) };
      input += 0.5 * (now.p + last.p) * dt;
      radiated += 0.5 * (now.r + last.r) * dt;
      last = now;
    }
    const stored = q.heatCapacity * (s.status('L').temperature! - 293.15);
    expect(Math.abs(input - radiated - stored) / input).toBeLessThan(5e-3);
  });

  it('gerilimle akım doğrusal değil: 6 V’ta 0,1 A’in yarısından fazla (V ∝ T^2,6, I ∝ V^0,53)', () => {
    const s = new CircuitSimulator(lamp(6));
    s.runUntil(0.5);
    const i = s.measure('L')!.current;
    expect(i).toBeGreaterThan(0.065);
    expect(i).toBeLessThan(0.075);
  });

  it('aşırı gerilim: 36 V’ta filaman 3695 K’i aşar ve kopar (açık devre, uyarı); 18 V’ta kopmaz', () => {
    const s = new CircuitSimulator(lamp(36));
    s.runUntil(0.1);
    expect((s.device('L') as LampDevice).burned).toBe(true);
    expect(s.measure('L')!.current).toBe(0);
    expect(s.runtimeDiagnostics.map((d) => d.code)).toContain('lamp-burned');
    const ok = new CircuitSimulator(lamp(18));
    ok.runUntil(0.3);
    expect((ok.device('L') as LampDevice).burned).toBe(false);
  });
});

function example(id: ExampleId) {
  let doc: CircuitDoc = exampleDoc(id)!;
  const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
  const idOf = (label: string) => doc.parts.find((p) => p.label === label)!.id;
  return {
    sim,
    idOf,
    /** Özelliği değiştirir; `settle` ise devre 10 ms çalıştırılır (doğru akımda yeni denge). */
    set(label: string, props: Record<string, number | boolean>, settle = true) {
      const part = doc.parts.find((p) => p.label === label)!;
      doc = updatePart(doc, part.id, { props: { ...part.props, ...props } });
      sim.update(buildConnectivity(doc).netlist);
      if (settle) sim.runUntil(sim.time + 0.01);
    },
  };
}

describe('Ayarlı parça ve sensör örnekleri: metindeki sayılar', () => {
  it('Potansiyometre: %0’da 0,09 V, %50’de 3,57 V (yüklü), %100’de 8,8 V ve LED 1,45 mA; hiçbir konumda uyarı yok', () => {
    const e = example('potansiyometre');
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    const volts = (position: number) => {
      e.set('P1', { position });
      return e.sim.measure(e.idOf('V1'))!.voltage;
    };
    expect(volts(0)).toBeCloseTo(0.09, 2);
    expect(e.sim.measure(e.idOf('LED1'))!.current).toBeLessThan(1e-6);
    expect(volts(50)).toBeCloseTo(3.57, 2);
    for (let position = 0; position <= 100; position += 10) {
      volts(position);
      expect(e.sim.runtimeDiagnostics).toEqual([]);
    }
    expect(volts(100)).toBeCloseTo(8.77, 2);
    expect(e.sim.measure(e.idOf('LED1'))!.current).toBeCloseTo(1.45e-3, 4);
  });

  it('LDR gece lambası: 100 lükste baz 0,33 V ve LED sönük; 20 lükste ≈ 3,3 mA; 10 lükste ≈ 6,9 mA', () => {
    const e = example('ldr-gece-lambasi');
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    e.sim.runUntil(0.01);
    expect(e.sim.measure(e.idOf('LDR1'))!.voltage).toBeCloseTo(0.33, 2);
    expect(e.sim.measure(e.idOf('LED1'))!.current).toBeLessThan(1e-5);
    e.set('LDR1', { illuminance: 50 });
    expect(e.sim.measure(e.idOf('LED1'))!.current).toBeLessThan(0.1e-3);
    e.set('LDR1', { illuminance: 20 });
    expect(e.sim.measure(e.idOf('LED1'))!.current).toBeCloseTo(3.3e-3, 3);
    e.set('LDR1', { illuminance: 10 });
    expect(e.sim.measure(e.idOf('LED1'))!.current).toBeCloseTo(6.9e-3, 3);
  });

  it('NTC termometre: −20 °C 0,47 V, 0 °C 1,17 V, 25 °C 2,50 V, 50 °C 3,67 V, 75 °C 4,35 V, 100 °C 4,68 V', () => {
    const e = example('ntc-termometre');
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    for (const [temperature, volts] of [
      [-20, 0.47],
      [0, 1.17],
      [25, 2.5],
      [50, 3.67],
      [75, 4.35],
      [100, 4.68],
    ] as const) {
      e.set('NTC1', { temperature });
      expect(e.sim.measure(e.idOf('V1'))!.voltage).toBeCloseTo(volts, 2);
    }
  });

  it('Akkor lamba: kapanınca ≈ 1,21 A, ≈ 6 ms’de 0,2 A’in altına iner, ≈ 2490 K’de 0,1 A', () => {
    const e = example('lamba-ani-akim');
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    e.set('S1', { closed: true }, false);
    const t0 = e.sim.time;
    let peak = 0;
    let below = 0;
    while (e.sim.time < t0 + 0.03) {
      e.sim.runUntil(e.sim.time + 2e-6);
      const i = e.sim.measure(e.idOf('RS'))!.current;
      peak = Math.max(peak, i);
      if (!below && peak > 1 && i < 0.2) below = e.sim.time - t0;
    }
    expect(peak).toBeCloseTo(1.21, 2);
    expect(below).toBeGreaterThan(4.5e-3);
    expect(below).toBeLessThan(7e-3);
    e.sim.runUntil(t0 + 0.2);
    expect(e.sim.measure(e.idOf('RS'))!.current).toBeCloseTo(0.1, 3);
    expect(e.sim.status(e.idOf('LP1')).temperature!).toBeCloseTo(2492, -1);
    expect(e.sim.runtimeDiagnostics).toEqual([]);
  });
});
