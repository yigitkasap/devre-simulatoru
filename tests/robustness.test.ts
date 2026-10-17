// Sayısal sağlamlık: Newton-Raphson'un zorlandığı devreler, durum korunması, hız.

import { describe, expect, it } from 'vitest';
import { CircuitSimulator } from '../src/sim';
import { circuit } from './helpers';

describe('Newton-Raphson sağlamlığı', () => {
  it('ters bağlı LED yüksek gerilimde yanmaz, akım ≈ 0', () => {
    const sim = new CircuitSimulator(
      circuit().battery('B1', 'k', 'gnd', 9).ground('G1', 'gnd').resistor('R1', 'k', 'a', 10).led('D1', 'gnd', 'a').build(),
    );
    expect(sim.advance(0).ok).toBe(true);
    expect(sim.status('D1').burned).toBe(false);
    expect(Math.abs(sim.measure('D1')!.current)).toBeLessThan(1e-6);
  });

  it('paralel beş LED tek dirençle', () => {
    const b = circuit().battery('B1', 'k', 'gnd', 9).ground('G1', 'gnd').resistor('R1', 'k', 'a', 100);
    for (let i = 0; i < 5; i++) b.led(`D${i}`, 'a', 'gnd', i % 2 ? 'green' : 'red');
    const sim = new CircuitSimulator(b.build());
    expect(sim.advance(0).ok).toBe(true);
    // Kırmızılar (Vf daha küçük) akımın çoğunu çeker; toplam ≈ (9 − 1,8)/100
    const total = [0, 1, 2, 3, 4].reduce((s, i) => s + sim.measure(`D${i}`)!.current, 0);
    expect(total).toBeCloseTo(sim.measure('R1')!.current, 6);
  });

  it('kondansatör üzerinden LED: ilk anda nominalin üstü, sonra söner', () => {
    const sim = new CircuitSimulator(
      circuit()
        .battery('B1', 'k', 'gnd', 9)
        .ground('G1', 'gnd')
        .resistor('R1', 'k', 'a', 270)
        .led('D1', 'a', 'b', 'red')
        .capacitor('C1', 'b', 'gnd', 100e-6)
        .build(),
    );
    sim.advance(1e-3);
    expect(sim.status('D1').overCurrent).toBe(true);
    expect(sim.status('D1').burned).toBe(false);
    sim.runUntil(1);
    expect(sim.measure('D1')!.current).toBeLessThan(1e-3);
    expect(sim.status('D1').overCurrent).toBe(false);
  });

  it('diyot + kondansatör + yük: kararlı çözüm', () => {
    const sim = new CircuitSimulator(
      circuit()
        .battery('B1', 'k', 'gnd', 5)
        .ground('G1', 'gnd')
        .diode('D1', 'k', 'out')
        .capacitor('C1', 'out', 'gnd', 100e-6)
        .resistor('R1', 'out', 'gnd', 1000)
        .build(),
    );
    const result = sim.runUntil(0.5);
    expect(result.ok).toBe(true);
    const vout = sim.voltageAt('out')!;
    // 5 V − diyot düşümü (≈ 0,64 V, ≈ 4,4 mA'de)
    expect(vout).toBeGreaterThan(4.3);
    expect(vout).toBeLessThan(4.45);
  });

  it('1 s simülasyon (20 000 adım, LED + kondansatör) hızlı biter', () => {
    const sim = new CircuitSimulator(
      circuit()
        .battery('B1', 'k', 'gnd', 9, 1)
        .ground('G1', 'gnd')
        .switch('S1', 'k', 'k2', true)
        .resistor('R1', 'k2', 'a', 1000)
        .led('D1', 'a', 'b', 'blue')
        .capacitor('C1', 'b', 'gnd', 470e-6)
        .resistor('R2', 'b', 'gnd', 10e3)
        .voltmeter('V1', 'b', 'gnd')
        .ammeter('A1', 'k2', 'k3')
        .resistor('R3', 'k3', 'gnd', 2200)
        .build(),
    );
    const start = performance.now();
    const result = sim.runUntil(1);
    const elapsed = performance.now() - start;
    expect(result.ok).toBe(true);
    // En büyük adım 50 µs (20 000 adım); başlangıçta adım küçükten büyür (≈ 10 adım daha).
    expect(result.steps).toBeGreaterThanOrEqual(20000);
    expect(result.steps).toBeLessThanOrEqual(20015);
    expect(elapsed).toBeLessThan(3000);
  });
});

describe('Devre güncellenince durum korunur', () => {
  it('direnç değeri değişince kondansatör gerilimi ve yanmış LED korunur', () => {
    const build = (r: number) =>
      circuit()
        .battery('B1', 'k', 'gnd', 10)
        .ground('G1', 'gnd')
        .resistor('R1', 'k', 'a', r)
        .capacitor('C1', 'a', 'gnd', 100e-6)
        .resistor('R2', 'k', 'l', 10)
        .led('D1', 'l', 'gnd')
        .build();
    const sim = new CircuitSimulator(build(1000));
    sim.runUntil(0.1);
    const vc = sim.measure('C1')!.voltage;
    expect(sim.status('D1').burned).toBe(true);
    sim.update(build(2000));
    expect(sim.measure('C1')!.voltage).toBe(vc);
    expect(sim.status('D1').burned).toBe(true);
    sim.runUntil(0.2);
    expect(sim.measure('C1')!.voltage).toBeGreaterThan(vc);
  });
});
