// ngspice kaynak kodu karşılaştırmasında bulunan model hataları (2026-10-27):
//   - MOSFET'in gövde diyodu yoktu: V_DS < 0'da kanal açılıyordu (mos1load.c'de bulk diyotları hep var).
//   - Ters aktif BJT "kesim" görünüyordu.
//   - exp sınırının (arg > 80) ötesinde iletkenlik akımın türevinden büyük damgalanıyordu.
//   - Kırılma noktasından (kare dalga kenarı) sonra adım kısaltılmıyordu (dctran.c): 1N4001'in ters
//     toparlanma yükü −%7,2 eksik çıkıyordu.

import { describe, expect, it } from 'vitest';
import { CircuitSimulator } from '../src/sim';
import { Junction, safeExp, safeExpSlope } from '../src/sim/devices/junction';
import { circuit } from './helpers';

describe('ngspice karşılaştırması: model düzeltmeleri', () => {
  it('IRF510 gövde diyodu: kapı source’ta, drain 10 Ω üzerinden −5 V’a çekilince V_DS ≈ −0,81 V, I ≈ 0,42 A', () => {
    // ngspice MOS1 (IS = 1e-14, N = 1): V_SD ≈ 0,81 V; diyotsuz eski model kanalı açıyordu (−4,1 V, 90 mA).
    const sim = new CircuitSimulator(
      circuit()
        .battery('B1', 'g0', 'n', 5)
        .ground('G1', 'g0')
        .resistor('R1', 'n', 'd', 10)
        .add('nmos', 'M1', ['d', 'g0', 'g0'], { model: 'IRF510' })
        .build(),
    );
    sim.runUntil(0);
    const m = sim.measure('M1')!;
    expect(m.voltage).toBeGreaterThan(-0.9);
    expect(m.voltage).toBeLessThan(-0.75);
    expect(-m.current).toBeCloseTo((5 + m.voltage) / 10, 3);
  });

  it('P kanal MOSFET’te gövde diyodu ters yönde: drain +5 V’a çekilince V_SD ≈ −0,8 V', () => {
    const sim = new CircuitSimulator(
      circuit().battery('B1', 'p', 'g0', 5).ground('G1', 'g0').resistor('R1', 'p', 'd', 10).add('pmos', 'M1', ['d', 'g0', 'g0']).build(),
    );
    sim.runUntil(0);
    const v = sim.measure('M1')!.voltage;
    expect(v).toBeGreaterThan(0.7);
    expect(v).toBeLessThan(0.9);
  });

  it('ileri yönde (V_DS > 0) gövde diyodu kapalı: kesimdeki MOSFET akım geçirmez', () => {
    const sim = new CircuitSimulator(
      circuit().battery('B1', 'p', 'g0', 12).ground('G1', 'g0').resistor('R1', 'p', 'd', 100).add('nmos', 'M1', ['d', 'g0', 'g0'], { model: 'IRF510' }).build(),
    );
    sim.runUntil(0);
    expect(Math.abs(sim.measure('M1')!.current)).toBeLessThan(1e-9);
  });

  it('ters aktif NPN (B-C iletimde, B-E ters): bölge "reverse"', () => {
    const sim = new CircuitSimulator(
      circuit()
        .battery('B1', 'b0', 'g0', 0.62)
        .ground('G1', 'g0')
        .battery('B2', 'e', 'g0', 7.1)
        .resistor('RB', 'b0', 'b', 10)
        .add('npn', 'Q1', ['g0', 'b', 'e'])
        .build(),
    );
    sim.runUntil(0);
    expect(sim.status('Q1').region).toBe('reverse');
  });

  it('exp sınırının ötesinde iletkenlik akımın türevine eşit (sonlu fark)', () => {
    expect(safeExpSlope(100) / ((safeExp(100 + 1e-3) - safeExp(100 - 1e-3)) / 2e-3)).toBeCloseTo(1, 6);
    const d = new Junction(1e-14, 1);
    for (const vd of [1, 2.5, 5, 8]) {
      const h = 1e-6;
      const fd = (d.current(vd + h) - d.current(vd - h)) / (2 * h);
      expect(Math.abs(d.conductance(vd) - fd) / fd).toBeLessThan(1e-4);
    }
  });

  it('kare dalga kenarından sonra küçük adım: 1N4001 ters toparlanma yükü ince adımlı çözümün %5’i içinde', () => {
    const run = (timeStep?: number) => {
      const b = circuit()
        .acsource('V', 'a', 'g', { waveform: 'square', amplitude: 5, frequency: 10000 })
        .ground('G', 'g')
        .add('diode', 'D', ['a', 'b'], { model: '1N4001' })
        .resistor('R', 'b', 'g', 1000);
      const sim = new CircuitSimulator(b.build(), timeStep ? { timeStep, minTimeStep: 1e-12 } : {});
      const r = sim.device('R')!;
      const pts: Array<[number, number]> = [];
      const orig = r.observe.bind(r);
      r.observe = (x: Float64Array, t: number) => {
        orig(x, t);
        if (t >= 10e-4) pts.push([t, r.measure(x).current]);
      };
      sim.runUntil(11e-4);
      let q = 0;
      for (let k = 1; k < pts.length; k++) q -= ((Math.min(0, pts[k - 1]![1]) + Math.min(0, pts[k]![1])) / 2) * (pts[k]![0] - pts[k - 1]![0]);
      return q;
    };
    const reference = run(20e-9);
    expect(reference).toBeGreaterThan(18e-9);
    expect(Math.abs(run() / reference - 1)).toBeLessThan(0.05);
  });
});
