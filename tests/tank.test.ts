// Su haznesi (baraj seviye probları): kuru prob açık devre, ıslak problar arasında su direnci;
// Doldur / Boşalt ile seviye simülasyon zamanıyla değişir.

import { describe, expect, it } from 'vitest';
import { CircuitSimulator, type PropValue } from '../src/sim';
import { LED_MODELS } from '../src/sim/devices/led';
import { probeWetness, TANK_PROBE_HEIGHTS } from '../src/sim/devices/tank';
import { circuit } from './helpers';

/** 9 V, her seviye probu 10 kΩ ile pile bağlı; ortak prob toprakta. */
function tank(props: Record<string, PropValue>) {
  return circuit()
    .ground('G', 'gnd')
    .battery('B', 'v', 'gnd', 9)
    .resistor('R1', 'v', 'p1', 10e3)
    .resistor('R2', 'v', 'p2', 10e3)
    .resistor('R3', 'v', 'p3', 10e3)
    .add('tank', 'H', ['gnd', 'p1', 'p2', 'p3'], { level: 0, mode: 'stop', fillTime: 10, waterResistance: 5e3, ...props });
}

describe('Su haznesi', () => {
  it('kuru problar açık devre; seviye bir probu geçince o prob ortak proba su direnciyle bağlanır', () => {
    const dry = new CircuitSimulator(tank({ level: 0 }).build());
    dry.advance(0);
    expect(dry.voltageAt('p1')!).toBeCloseTo(9, 3);
    const half = new CircuitSimulator(tank({ level: 50 }).build());
    half.advance(0);
    // Seviye 1 ıslak: 10 kΩ ile 5 kΩ'luk su direnci → 3 V; Seviye 2 ve 3 kuru.
    expect(half.voltageAt('p1')!).toBeCloseTo(3, 3);
    expect(half.voltageAt('p2')!).toBeCloseTo(9, 3);
    expect(half.status('H').wetProbes).toEqual([true, true, false, false]);
    expect(half.pinCurrents('H')![0]!).toBeCloseTo(-0.6e-3, 6);
    const full = new CircuitSimulator(tank({ level: 100 }).build());
    full.advance(0);
    expect(full.status('H').wetProbes).toEqual([true, true, true, true]);
  });

  it('Doldur: boştan doluya dolma süresinde; 5 s’de %50 (yalnız Seviye 1 ıslak), 7 s’de %70', () => {
    const sim = new CircuitSimulator(tank({ mode: 'fill', fillTime: 10 }).build(), { timeStep: 1e-3 });
    expect(sim.runUntil(5).ok).toBe(true);
    expect(sim.status('H').level!).toBeCloseTo(50, 1);
    expect(sim.status('H').wetProbes).toEqual([true, true, false, false]);
    sim.runUntil(7);
    expect(sim.status('H').level!).toBeCloseTo(70, 1);
    expect(sim.voltageAt('p2')!).toBeLessThan(5);
    sim.runUntil(20);
    expect(sim.status('H').level).toBe(100);
  });

  it('Boşalt: %100’den 5 s’de %50’ye iner', () => {
    const sim = new CircuitSimulator(tank({ level: 100, mode: 'drain', fillTime: 10 }).build(), { timeStep: 1e-3 });
    sim.runUntil(5);
    expect(sim.status('H').level!).toBeCloseTo(50, 1);
    sim.runUntil(12);
    expect(sim.status('H').level).toBe(0);
  });

  it('çalışırken kip ya da süre değişince seviye kaldığı yerden sürer; başlangıç seviyesi değişince yeni değer geçerli', () => {
    const sim = new CircuitSimulator(tank({ mode: 'fill', fillTime: 10 }).build(), { timeStep: 1e-3 });
    sim.runUntil(3);
    sim.update(tank({ mode: 'stop', fillTime: 10 }).build());
    sim.runUntil(4);
    expect(sim.status('H').level!).toBeCloseTo(30, 1);
    sim.update(tank({ level: 80, mode: 'stop', fillTime: 10 }).build());
    sim.advance(0.01);
    expect(sim.status('H').level).toBe(80);
  });

  it('su yüzeyi probu ±%1’lik aralıkta yumuşakça ıslatır; probların yüksekliği uçların yüksekliği', () => {
    expect(TANK_PROBE_HEIGHTS).toEqual([12.5, 37.5, 62.5, 87.5]);
    expect(probeWetness(36.5, 37.5)).toBe(0);
    expect(probeWetness(37.5, 37.5)).toBeCloseTo(0.5, 6);
    expect(probeWetness(38.5, 37.5)).toBe(1);
  });
});

describe('Sarı LED', () => {
  it('20 mA’de ≈ 2,1 V (kırmızı ile yeşil arasında)', () => {
    const sim = new CircuitSimulator(
      circuit().ground('G', 'gnd').battery('B', 'v', 'gnd', 22.1).resistor('R', 'v', 'a', 1000).led('D', 'a', 'gnd', 'yellow').build(),
    );
    sim.advance(0);
    const m = sim.measure('D')!;
    expect(m.current).toBeCloseTo(20e-3, 4);
    expect(m.voltage).toBeCloseTo(LED_MODELS.yellow.forwardVoltage, 2);
    expect(LED_MODELS.yellow.forwardVoltage).toBeGreaterThan(LED_MODELS.red.forwardVoltage);
    expect(LED_MODELS.yellow.forwardVoltage).toBeLessThan(LED_MODELS.green.forwardVoltage);
  });
});
