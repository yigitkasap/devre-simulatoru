// Çözücü, sonucu bilinen devrelerle test edilir (görev tanımı, bölüm 8).

import { describe, expect, it } from 'vitest';
import { CircuitSimulator, LED_MODELS, type LedColor } from '../src/sim';
import { circuit } from './helpers';

/** Devreyi kurar ve bir kez çözer. */
function solve(builder: ReturnType<typeof circuit>): CircuitSimulator {
  const sim = new CircuitSimulator(builder.build());
  const result = sim.advance(0);
  expect(result.error).toBeUndefined();
  expect(result.ok).toBe(true);
  return sim;
}

describe('1. Gerilim bölücü', () => {
  it('10 V, 1 kΩ + 1 kΩ → orta nokta 5,000 V, akım 5,000 mA', () => {
    const sim = solve(
      circuit()
        .battery('B1', 'ust', 'gnd', 10)
        .ground('G1', 'gnd')
        .resistor('R1', 'ust', 'orta', 1000)
        .resistor('R2', 'orta', 'gnd', 1000),
    );
    expect(sim.voltageAt('orta')).toBeCloseTo(5, 4);
    expect(sim.measure('R1')!.current).toBeCloseTo(5e-3, 7);
    expect(sim.measure('R2')!.current).toBeCloseTo(5e-3, 7);
    // Pil güç verir: + ucundan giren akım negatiftir.
    expect(sim.measure('B1')!.current).toBeCloseTo(-5e-3, 7);
  });
});

describe('2. Voltmetrenin yükleme etkisi', () => {
  const build = (meter: number | 'ideal') =>
    circuit()
      .battery('B1', 'kaynak', 'gnd', 12)
      .ground('G1', 'gnd')
      .resistor('Ric', 'kaynak', 'cikis', 200e3)
      .voltmeter('V1', 'cikis', 'gnd', meter);

  it('1 MΩ voltmetre 10,00 V gösterir', () => {
    const sim = solve(build(1e6));
    expect(Math.abs(sim.measure('V1')!.voltage - 10)).toBeLessThan(0.01);
  });

  it('ideal voltmetre 12,00 V gösterir', () => {
    const sim = solve(build('ideal'));
    expect(Math.abs(sim.measure('V1')!.voltage - 12)).toBeLessThan(0.01);
    expect(sim.measure('V1')!.current).toBe(0);
  });
});

describe('3. Paralel yük ve voltmetre', () => {
  it('250 kΩ yük + 1 MΩ voltmetre → 6,00 V; voltmetreden 6,0 µA, yükten 24,0 µA', () => {
    const sim = solve(
      circuit()
        .battery('B1', 'kaynak', 'gnd', 12)
        .ground('G1', 'gnd')
        .resistor('Ric', 'kaynak', 'cikis', 200e3)
        .resistor('Ryuk', 'cikis', 'gnd', 250e3)
        .voltmeter('V1', 'cikis', 'gnd', 1e6),
    );
    expect(Math.abs(sim.measure('V1')!.voltage - 6)).toBeLessThan(0.01);
    expect(sim.measure('V1')!.current).toBeCloseTo(6e-6, 8);
    expect(sim.measure('Ryuk')!.current).toBeCloseTo(24e-6, 8);
  });
});

describe('4. Ampermetrenin etkisi', () => {
  const build = (meter: number | 'ideal') =>
    circuit()
      .battery('B1', 'kaynak', 'gnd', 12)
      .ground('G1', 'gnd')
      .resistor('R1', 'kaynak', 'a', 100)
      .ammeter('A1', 'a', 'gnd', meter);

  it('1 Ω ampermetre 118,8 mA gösterir', () => {
    const sim = solve(build(1));
    expect(Math.abs(sim.measure('A1')!.current - 0.1188)).toBeLessThan(0.1e-3);
  });

  it('ideal ampermetre 120,0 mA gösterir', () => {
    const sim = solve(build('ideal'));
    expect(Math.abs(sim.measure('A1')!.current - 0.12)).toBeLessThan(0.1e-3);
    expect(Math.abs(sim.measure('A1')!.voltage)).toBeLessThan(1e-9);
  });
});

describe('5. LED karakteristiği', () => {
  for (const color of ['red', 'green', 'blue'] as LedColor[]) {
    it(`${color}: 20 mA'de ileri gerilim veri sayfasına ±0,05 V içinde uyar`, () => {
      const vf = LED_MODELS[color].forwardVoltage;
      // 1 kΩ üzerinden yaklaşık 20 mA sürülür; ölçülen akım ve gerilim birlikte kontrol edilir.
      const sim = solve(
        circuit()
          .battery('B1', 'kaynak', 'gnd', vf + 20)
          .ground('G1', 'gnd')
          .resistor('R1', 'kaynak', 'a', 1000)
          .led('D1', 'a', 'gnd', color),
      );
      const m = sim.measure('D1')!;
      expect(Math.abs(m.current - 20e-3)).toBeLessThan(0.1e-3);
      expect(Math.abs(m.voltage - vf)).toBeLessThan(0.05);
      expect(sim.status('D1').burned).toBe(false);
    });
  }

  it('5 V, 330 Ω, kırmızı LED → akım 9-10 mA', () => {
    const sim = solve(
      circuit()
        .battery('B1', 'kaynak', 'gnd', 5)
        .ground('G1', 'gnd')
        .resistor('R1', 'kaynak', 'a', 330)
        .led('D1', 'a', 'gnd', 'red'),
    );
    const current = sim.measure('D1')!.current;
    expect(current).toBeGreaterThan(9e-3);
    expect(current).toBeLessThan(10e-3);
    expect(sim.status('D1').brightness).toBeGreaterThan(0.6);
  });
});

describe('6. LED yanması', () => {
  it('9 V, 10 Ω, kırmızı LED → LED yanar ve akım sıfıra düşer', () => {
    const sim = new CircuitSimulator(
      circuit()
        .battery('B1', 'kaynak', 'gnd', 9)
        .ground('G1', 'gnd')
        .resistor('R1', 'kaynak', 'a', 10)
        .led('D1', 'a', 'gnd', 'red')
        .build(),
    );
    const result = sim.advance(0.016);
    expect(result.ok).toBe(true);
    expect(result.burned).toEqual(['D1']);
    expect(sim.status('D1').burned).toBe(true);
    expect(sim.status('D1').burnCurrent).toBeGreaterThan(0.5);
    expect(Math.abs(sim.measure('D1')!.current)).toBeLessThan(1e-9);
    expect(Math.abs(sim.measure('R1')!.current)).toBeLessThan(1e-9);
    const burnMessage = sim.runtimeDiagnostics.find((d) => d.code === 'led-burned');
    expect(burnMessage?.elementIds).toEqual(['D1']);
    expect(burnMessage?.params?.maxCurrent).toBeCloseTo(0.03);

    // Onarılınca yeniden yanar (devre değişmedi).
    expect(sim.repair('D1')).toBe(true);
    expect(sim.advance(0.016).burned).toEqual(['D1']);
  });

  it('nominal ile mutlak en büyük arasında uyarı halkası, yanma yok', () => {
    // 25 mA civarı: kırmızı LED için 20 mA < I < 30 mA
    const sim = solve(
      circuit()
        .battery('B1', 'kaynak', 'gnd', 1.86 + 25)
        .ground('G1', 'gnd')
        .resistor('R1', 'kaynak', 'a', 1000)
        .led('D1', 'a', 'gnd', 'red'),
    );
    const status = sim.status('D1');
    expect(status.burned).toBe(false);
    expect(status.overCurrent).toBe(true);
    expect(status.brightness).toBe(1);
  });
});

describe('7. Diyot', () => {
  it('5 V, 1 kΩ, ileri yönde diyot gerilimi 0,60-0,75 V', () => {
    const sim = solve(
      circuit()
        .battery('B1', 'kaynak', 'gnd', 5)
        .ground('G1', 'gnd')
        .resistor('R1', 'kaynak', 'a', 1000)
        .diode('D1', 'a', 'gnd'),
    );
    const v = sim.measure('D1')!.voltage;
    expect(v).toBeGreaterThan(0.6);
    expect(v).toBeLessThan(0.75);
  });

  it('ters yönde akım 1 µA\'den küçük', () => {
    const sim = solve(
      circuit()
        .battery('B1', 'kaynak', 'gnd', 5)
        .ground('G1', 'gnd')
        .resistor('R1', 'kaynak', 'a', 1000)
        .diode('D1', 'gnd', 'a'),
    );
    expect(Math.abs(sim.measure('D1')!.current)).toBeLessThan(1e-6);
    expect(sim.voltageAt('a')).toBeGreaterThan(4.99);
  });
});

describe('8. RC dolma', () => {
  it('10 V, 1 kΩ, 100 µF → t = 0,1 s\'de kondansatör gerilimi 6,32 V (±%1)', () => {
    const sim = new CircuitSimulator(
      circuit()
        .battery('B1', 'kaynak', 'gnd', 10)
        .ground('G1', 'gnd')
        .resistor('R1', 'kaynak', 'a', 1000)
        .capacitor('C1', 'a', 'gnd', 100e-6)
        .build(),
    );
    expect(sim.isTransient).toBe(true);
    const result = sim.runUntil(0.1);
    expect(result.ok).toBe(true);
    // En büyük adım 50 µs (2000 adım); başlangıçta adım 50 ns'den büyür (≈ 10 adım daha).
    expect(result.steps).toBeGreaterThanOrEqual(2000);
    expect(result.steps).toBeLessThanOrEqual(2015);
    expect(sim.time).toBeCloseTo(0.1, 9);
    const vc = sim.measure('C1')!.voltage;
    expect(Math.abs(vc - 6.32) / 6.32).toBeLessThan(0.01);
  });

  it('başlangıç gerilimi verilen kondansatör direnç üzerinden boşalır', () => {
    const sim = new CircuitSimulator(
      circuit()
        .ground('G1', 'gnd')
        .resistor('R1', 'a', 'gnd', 1000)
        .capacitor('C1', 'a', 'gnd', 100e-6, 5)
        .build(),
    );
    sim.runUntil(0.1);
    // v(τ) = 5·e⁻¹ ≈ 1,84 V
    expect(Math.abs(sim.measure('C1')!.voltage - 5 * Math.exp(-1))).toBeLessThan(0.02);
  });

  it('kare kare ilerletme toplam zamanı kaybetmez', () => {
    const sim = new CircuitSimulator(
      circuit()
        .battery('B1', 'kaynak', 'gnd', 10)
        .ground('G1', 'gnd')
        .resistor('R1', 'kaynak', 'a', 1000)
        .capacitor('C1', 'a', 'gnd', 100e-6)
        .build(),
    );
    for (let i = 0; i < 60; i++) sim.advance(1 / 60);
    expect(Math.abs(sim.time - 1)).toBeLessThan(60e-6);
  });
});

describe('9. Kısa devre', () => {
  it('9 V, iç direnç 1 Ω, uçlar kabloyla kısa devre → 9,0 A ve kısa devre uyarısı', () => {
    const sim = solve(circuit().battery('B1', 'arti', 'eksi', 9, 1).ground('G1', 'eksi').wire('arti', 'eksi'));
    expect(sim.measure('B1')!.current).toBeCloseTo(-9, 6);
    expect(sim.status('B1').shortCircuit).toBe(true);
    const warning = sim.runtimeDiagnostics.find((d) => d.code === 'short-circuit');
    expect(warning?.severity).toBe('warning');
    expect(warning?.elementIds).toEqual(['B1']);
    expect(warning?.params?.current).toBeCloseTo(9, 6);
  });

  it('dış yük iç dirençten büyükse uyarı yok', () => {
    const sim = solve(
      circuit().battery('B1', 'arti', 'gnd', 9, 1).ground('G1', 'gnd').resistor('R1', 'arti', 'gnd', 10),
    );
    expect(sim.status('B1').shortCircuit).toBe(false);
    // Kısa devre uyarısı yok. (10 Ω'a 6,7 W düştüğü için 1/4 W'lık dirençte güç uyarısı vardır: Fizik 5.)
    expect(sim.runtimeDiagnostics.map((d) => d.code)).toEqual(['resistor-overpower']);
  });
});

describe('Anahtar', () => {
  it('açıkken akım yok, kapanınca akar; değer değişikliğinde durum korunur', () => {
    const build = (closed: boolean) =>
      circuit()
        .battery('B1', 'kaynak', 'gnd', 10)
        .ground('G1', 'gnd')
        .switch('S1', 'kaynak', 'a', closed)
        .resistor('R1', 'a', 'b', 1000)
        .capacitor('C1', 'b', 'gnd', 100e-6)
        .build();
    const sim = new CircuitSimulator(build(false));
    sim.runUntil(0.05);
    expect(Math.abs(sim.measure('C1')!.voltage)).toBeLessThan(1e-6);
    sim.update(build(true));
    sim.runUntil(0.15);
    // Anahtar t = 0,05 s'de kapandı: 0,1 s sonra ≈ 6,32 V
    expect(Math.abs(sim.measure('C1')!.voltage - 6.32) / 6.32).toBeLessThan(0.01);
  });
});
