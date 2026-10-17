// Su haznesi (baraj seviye probları): kuru prob açık devre, ıslak problar arasında su direnci ve
// elektrot polarizasyonu (elektroliz); Doldur / Boşalt ile seviye simülasyon zamanıyla değişir.

import { describe, expect, it } from 'vitest';
import { CircuitSimulator, type PropValue } from '../src/sim';
import { LED_MODELS } from '../src/sim/devices/led';
import { ELECTRODE_EXCHANGE_CURRENT, ELECTRODE_SLOPE, electrodeBranch, probeWetness, TANK_PROBE_HEIGHTS } from '../src/sim/devices/tank';

/** Bir anot ile bir katodun i akımındaki toplam polarizasyonu: 2·b·asinh(i / 2i₀). */
const pairPolarization = (i: number) => 2 * ELECTRODE_SLOPE * Math.asinh(i / (2 * ELECTRODE_EXCHANGE_CURRENT));
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
  it('kuru problar açık devre; seviye bir probu geçince o prob ortak proba su direnci ve elektrotlarla bağlanır', () => {
    const dry = new CircuitSimulator(tank({ level: 0 }).build());
    dry.advance(0);
    expect(dry.voltageAt('p1')!).toBeCloseTo(9, 3);
    expect(dry.pinCurrents('H')!.every((i) => i === 0)).toBe(true);
    const half = new CircuitSimulator(tank({ level: 50 }).build());
    half.advance(0);
    // Seviye 1 ıslak: 9 V = I·(10 kΩ + 5 kΩ) + polarizasyon(I) → I ≈ 0,485 mA, p1 ≈ 4,15 V.
    // (Polarizasyon olmasaydı I = 0,6 mA, p1 = 3 V olurdu.) Seviye 2 ve 3 kuru.
    // Bu düzenekte Seviye 1 probu + (anot), ortak prob − (katot): akım S1'den suya, sudan ortak proba.
    const i = half.pinCurrents('H')![1]!;
    expect(i).toBeGreaterThan(0.47e-3);
    expect(i).toBeLessThan(0.5e-3);
    expect(half.voltageAt('p1')!).toBeCloseTo(9 - 10e3 * i, 6);
    expect(Math.abs(9 - 15e3 * i - pairPolarization(i))).toBeLessThan(1e-6);
    expect(half.status('H').polarization!).toBeCloseTo(pairPolarization(i), 6);
    expect(half.voltageAt('p2')!).toBeCloseTo(9, 3);
    expect(half.status('H').wetProbes).toEqual([true, true, false, false]);
    // Kirchhoff: Seviye 1 probundan suya giren akım ortak probdan çıkar.
    expect(half.pinCurrents('H')![0]!).toBeCloseTo(-i, 9);
    const full = new CircuitSimulator(tank({ level: 100 }).build());
    full.advance(0);
    expect(full.status('H').wetProbes).toEqual([true, true, true, true]);
  });

  it('elektrot polarizasyonu: bir anot–katot çiftinde 0,1 mA’de ≈ 1,55 V, 1 mA’de ≈ 1,8 V; 1 V’ta akım 1 µA’in altında', () => {
    expect(pairPolarization(0.1e-3)).toBeCloseTo(1.553, 2);
    expect(pairPolarization(0.4e-3)).toBeCloseTo(1.70, 1);
    expect(pairPolarization(1e-3)).toBeCloseTo(1.79, 2);
    // Dal (arayüz + direnç): simetrik, artan; büyük gerilimde direnç belirler.
    for (const v of [0.2, 0.9, 3, 9]) {
      const plus = electrodeBranch(v, 2500);
      const minus = electrodeBranch(-v, 2500);
      expect(minus.current).toBeCloseTo(-plus.current, 15);
      expect(plus.current).toBeCloseTo((v - plus.overpotential) / 2500, 12);
    }
    expect(electrodeBranch(3, 2500).current).toBeGreaterThan(electrodeBranch(0.9, 2500).current);
    // 1 V'luk bir çift (her elektrotta 0,5 V): akım yok denecek kadar az.
    const below = electrodeBranch(0.5, 1).current;
    expect(below).toBeGreaterThan(0);
    expect(below).toBeLessThan(1e-6);
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
