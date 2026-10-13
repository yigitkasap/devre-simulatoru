// Zener diyot, BJT (NPN/PNP), JFET (N/P) ve MOSFET (N/P): el hesabıyla bilinen çalışma noktaları.

import { describe, expect, it } from 'vitest';
import { CircuitSimulator, type PropValue } from '../src/sim';
import { circuit } from './helpers';

function solve(builder: ReturnType<typeof circuit>): CircuitSimulator {
  const sim = new CircuitSimulator(builder.build());
  const result = sim.advance(0);
  expect(result.error).toBeUndefined();
  expect(result.ok).toBe(true);
  return sim;
}

const add3 = (b: ReturnType<typeof circuit>, type: 'npn' | 'pnp' | 'njfet' | 'pjfet' | 'nmos' | 'pmos', id: string, pins: [string, string, string], props: Record<string, PropValue> = {}) =>
  b.add(type, id, pins, props);

describe('Zener diyot', () => {
  it('ters yönde ≈ 5 V’ta kırılır (10 V, 1 kΩ: ≈ 4,9 mA); ileri yönde ≈ 0,65 V', () => {
    const reverse = solve(
      circuit().battery('B1', 'a', 'gnd', 10).ground('G1', 'gnd').resistor('R1', 'a', 'k', 1000).add('zener', 'Z1', ['gnd', 'k'], { zenerVoltage: 5.1 }),
    );
    const vz = reverse.voltageAt('k')!;
    expect(vz).toBeGreaterThan(4.85);
    expect(vz).toBeLessThan(5.05);
    expect(reverse.status('Z1').breakdown).toBe(true);
    // 20 mA'de uçlar arası tam V_Z
    const atTest = solve(
      circuit().battery('B1', 'a', 'gnd', 25.1).ground('G1', 'gnd').resistor('R1', 'a', 'k', 1000).add('zener', 'Z1', ['gnd', 'k'], { zenerVoltage: 5.1 }),
    );
    expect(atTest.voltageAt('k')!).toBeCloseTo(5.1, 2);
    const forward = solve(
      circuit().battery('B1', 'a', 'gnd', 10).ground('G1', 'gnd').resistor('R1', 'a', 'k', 1000).add('zener', 'Z1', ['k', 'gnd'], { zenerVoltage: 5.1 }),
    );
    expect(forward.voltageAt('k')!).toBeGreaterThan(0.6);
    expect(forward.voltageAt('k')!).toBeLessThan(0.75);
    expect(forward.status('Z1').breakdown).toBe(false);
  });
});

describe('BJT', () => {
  it('NPN gerilim bölücülü öngerilim: I_C ≈ 0,95 mA, V_C ≈ 7,5 V, aktif bölge; uç akımları toplamı 0', () => {
    const b = circuit()
      .battery('VCC', 'vcc', 'gnd', 12)
      .ground('G1', 'gnd')
      .resistor('R1', 'vcc', 'b', 56e3)
      .resistor('R2', 'b', 'gnd', 12e3)
      .resistor('RC', 'vcc', 'c', 4.7e3)
      .resistor('RE', 'e', 'gnd', 1.5e3);
    const sim = solve(add3(b, 'npn', 'Q1', ['c', 'b', 'e']));
    const [ic, ib, ie] = sim.pinCurrents('Q1')!;
    expect(ic!).toBeGreaterThan(0.92e-3);
    expect(ic!).toBeLessThan(1.0e-3);
    expect(ic! / ib!).toBeGreaterThan(200);
    expect(ic! / ib!).toBeLessThan(230);
    expect(Math.abs(ic! + ib! + ie!)).toBeLessThan(1e-12);
    expect(sim.voltageAt('c')!).toBeGreaterThan(7.3);
    expect(sim.voltageAt('c')!).toBeLessThan(7.7);
    expect(sim.voltageAt('b')! - sim.voltageAt('e')!).toBeGreaterThan(0.6);
    expect(sim.voltageAt('b')! - sim.voltageAt('e')!).toBeLessThan(0.66);
    expect(sim.status('Q1').region).toBe('active');
  });

  it('NPN anahtar: baz 10 kΩ’la 5 V’a bağlıyken doyumda (V_CE < 0,2 V), 0 V’ta kesimde', () => {
    const build = (vin: number) =>
      add3(
        circuit().battery('VCC', 'vcc', 'gnd', 9).battery('VIN', 'in', 'gnd', vin).ground('G1', 'gnd').resistor('RB', 'in', 'b', 10e3).resistor('RC', 'vcc', 'c', 1e3),
        'npn',
        'Q1',
        ['c', 'b', 'gnd'],
      );
    const on = solve(build(5));
    expect(on.voltageAt('c')!).toBeLessThan(0.2);
    expect(on.status('Q1').region).toBe('saturation');
    expect(on.pinCurrents('Q1')![0]!).toBeGreaterThan(8.7e-3);
    const off = solve(build(0));
    expect(off.voltageAt('c')!).toBeGreaterThan(8.99);
    expect(off.status('Q1').region).toBe('cutoff');
  });

  it('PNP: emetör +5 V, baz 470 kΩ ile toprağa → I_C ≈ −2 mA (kollektörden çıkar), aktif', () => {
    const sim = solve(
      add3(
        circuit().battery('VCC', 'vcc', 'gnd', 5).ground('G1', 'gnd').resistor('RB', 'b', 'gnd', 470e3).resistor('RC', 'c', 'gnd', 1e3),
        'pnp',
        'Q1',
        ['c', 'b', 'vcc'],
      ),
    );
    const [ic, ib] = sim.pinCurrents('Q1')!;
    expect(ic!).toBeLessThan(-1.8e-3);
    expect(ic!).toBeGreaterThan(-2.3e-3);
    expect(ib!).toBeLessThan(0);
    expect(sim.status('Q1').region).toBe('active');
  });
});

describe('JFET', () => {
  const nBuild = (vgs: number, vds: number) =>
    add3(
      circuit().battery('VDD', 'd', 'gnd', vds).battery('VG', 'g', 'gnd', vgs).ground('G1', 'gnd'),
      'njfet',
      'J1',
      ['d', 'g', 'gnd'],
    );

  it('N kanal: V_GS = 0’da I_D = I_DSS·(1 + λ·V_DS) = 3,3 mA; V_GS = −0,75 V’ta 0,825 mA; V_GS = −2 V’ta kesim', () => {
    expect(-solve(nBuild(0, 10)).measure('VDD')!.current).toBeCloseTo(3.3e-3, 6);
    expect(-solve(nBuild(-0.75, 10)).measure('VDD')!.current).toBeCloseTo(0.825e-3, 6);
    const off = solve(nBuild(-2, 10));
    expect(Math.abs(off.measure('VDD')!.current)).toBeLessThan(1e-9);
    expect(off.status('J1').region).toBe('cutoff');
  });

  it('N kanal omik bölge: V_DS = 0,2 V, V_GS = 0 → I_D = β·V_DS·(2·1,5 − V_DS)·(1 + λV_DS)', () => {
    const sim = solve(nBuild(0, 0.2));
    const beta = 3e-3 / (1.5 * 1.5);
    expect(-sim.measure('VDD')!.current).toBeCloseTo(beta * 0.2 * (3 - 0.2) * 1.002, 7);
    expect(sim.status('J1').region).toBe('ohmic');
  });

  it('kendinden öngerilim: R_S = 330 Ω → I_D ≈ 1,42 mA, V_GS ≈ −0,47 V', () => {
    const sim = solve(
      add3(
        circuit().battery('VDD', 'vdd', 'gnd', 12).ground('G1', 'gnd').resistor('RD', 'vdd', 'd', 4.7e3).resistor('RS', 's', 'gnd', 330).resistor('RG', 'g', 'gnd', 1e6),
        'njfet',
        'J1',
        ['d', 'g', 's'],
      ),
    );
    const id = sim.pinCurrents('J1')![0]!;
    expect(id).toBeGreaterThan(1.40e-3);
    expect(id).toBeLessThan(1.48e-3);
    expect(sim.voltageAt('s')!).toBeGreaterThan(0.46);
    expect(sim.voltageAt('s')!).toBeLessThan(0.49);
    expect(sim.status('J1').region).toBe('saturation');
  });

  it('P kanal: V_GS = +0,75 V, V_DS = −10 V → I_D = −0,825 mA', () => {
    const sim = solve(
      add3(circuit().battery('VDD', 'gnd', 'd', 10).battery('VG', 'g', 'gnd', 0.75).ground('G1', 'gnd'), 'pjfet', 'J1', ['d', 'g', 'gnd']),
    );
    expect(sim.pinCurrents('J1')![0]!).toBeCloseTo(-0.825e-3, 6);
  });

  it('ileri kutuplanan kapı eklemi akım çeker', () => {
    const sim = solve(
      add3(
        circuit().battery('VDD', 'd', 'gnd', 5).battery('VG', 'x', 'gnd', 5).resistor('RG', 'x', 'g', 10e3).ground('G1', 'gnd'),
        'njfet',
        'J1',
        ['d', 'g', 'gnd'],
      ),
    );
    expect(sim.pinCurrents('J1')![1]!).toBeGreaterThan(0.4e-3);
  });
});

describe('MOSFET', () => {
  const nBuild = (vgs: number, vds: number) =>
    add3(
      circuit().battery('VDD', 'd', 'gnd', vds).battery('VG', 'g', 'gnd', vgs).ground('G1', 'gnd'),
      'nmos',
      'M1',
      ['d', 'g', 'gnd'],
    );

  it('N kanal doyum: V_GS = 4,1 V, V_DS = 10 V → I_D = k·2²·1,1 = 0,22 A; kapı akımı yok', () => {
    const sim = solve(nBuild(4.1, 10));
    const [id, ig] = sim.pinCurrents('M1')!;
    expect(id!).toBeCloseTo(0.05 * 4 * 1.1, 6);
    expect(Math.abs(ig!)).toBe(0);
    expect(sim.status('M1').region).toBe('saturation');
  });

  it('N kanal omik ve kesim', () => {
    const ohmic = solve(nBuild(4.1, 0.1));
    expect(ohmic.pinCurrents('M1')![0]!).toBeCloseTo(0.05 * (2 * 2 * 0.1 - 0.01) * 1.001, 7);
    expect(ohmic.status('M1').region).toBe('ohmic');
    const off = solve(nBuild(1.5, 10));
    expect(Math.abs(off.pinCurrents('M1')![0]!)).toBeLessThan(1e-9);
  });

  it('gerilim bölücülü öngerilim: V_G = 3,75 V, R_S = 1 kΩ → I_D ≈ 1,48 mA', () => {
    const sim = solve(
      add3(
        circuit()
          .battery('VDD', 'vdd', 'gnd', 12)
          .ground('G1', 'gnd')
          .resistor('RG1', 'vdd', 'g', 2.2e6)
          .resistor('RG2', 'g', 'gnd', 1e6)
          .resistor('RD', 'vdd', 'd', 3.3e3)
          .resistor('RS', 's', 'gnd', 1e3),
        'nmos',
        'M1',
        ['d', 'g', 's'],
      ),
    );
    const id = sim.pinCurrents('M1')![0]!;
    expect(id).toBeGreaterThan(1.45e-3);
    expect(id).toBeLessThan(1.52e-3);
  });

  it('P kanal: V_GS = −4,1 V, V_DS = −10 V → I_D = −0,22 A', () => {
    const sim = solve(
      add3(circuit().battery('VDD', 'gnd', 'd', 10).battery('VG', 'gnd', 'g', 4.1).ground('G1', 'gnd'), 'pmos', 'M1', ['d', 'g', 'gnd']),
    );
    expect(sim.pinCurrents('M1')![0]!).toBeCloseTo(-0.22, 5);
  });
});
