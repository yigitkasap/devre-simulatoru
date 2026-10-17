// Fizik 4: zaman adımı doğruluğu. Kondansatör ve eklem yükleri yamuk kuralıyla, yerel kesme hatası
// (LTE) denetimli uyarlanır adımla integre edilir; kare dalga kenarları kırılma noktasıdır (adım
// tam kenara denk gelir, ardından geri Euler adımı). Hedefler görev tanımının 4. aşamasındandır.

import { describe, expect, it } from 'vitest';
import { CircuitSimulator } from '../src/sim';
import { circuit } from './helpers';

const rel = (got: number, want: number) => Math.abs(got - want) / Math.abs(want);
const ac = (frequency: number, amplitude: number, waveform = 'sine') => ({ waveform, amplitude, frequency, offset: 0, internalResistance: 0 });

/**
 * Kilitlemeli (lock-in) ölçüm: bir periyot boyunca N eşit aralıklı örnekle sinüs ve kosinüs
 * bileşenleri. Dönen genlik ve faz (radyan; sin(ωt + φ) biçiminde).
 */
function lockIn(s: CircuitSimulator, start: number, f: number, read: () => number, n = 400): { amplitude: number; phase: number } {
  let si = 0;
  let co = 0;
  for (let k = 1; k <= n; k++) {
    const t = start + k / (f * n);
    s.runUntil(t);
    const w = 2 * Math.PI * f * t;
    const v = read();
    si += v * Math.sin(w);
    co += v * Math.cos(w);
  }
  return { amplitude: (2 / n) * Math.hypot(si, co), phase: Math.atan2(co, si) };
}
const degrees = (rad: number) => (rad * 180) / Math.PI;

describe('Fizik 4: küçük zaman sabiti', () => {
  // 10 V, 1 kΩ, 10 nF: τ = 10 µs, en büyük adımın (50 µs) beşte biri.
  const charging = () => new CircuitSimulator(circuit().battery('B', 'a', 'g', 10).ground('G', 'g').resistor('R', 'a', 'c', 1000).capacitor('C', 'c', 'g', 10e-9).build());

  it('v(10 µs) = 6,32 V ve v(50 µs) = 9,93 V, en fazla %1 hata', () => {
    const s = charging();
    s.runUntil(10e-6);
    expect(rel(s.measure('C')!.voltage, 10 * (1 - Math.exp(-1)))).toBeLessThan(0.01);
    s.runUntil(50e-6);
    expect(rel(s.measure('C')!.voltage, 10 * (1 - Math.exp(-5)))).toBeLessThan(0.01);
  });

  it('dolma boyunca her an %1 içinde; dolunca adım en büyük değere (50 µs) çıkar', () => {
    const s = charging();
    for (let k = 1; k <= 100; k++) {
      const t = k * 1e-6;
      s.runUntil(t);
      const want = 10 * (1 - Math.exp(-t / 10e-6));
      expect(Math.abs(s.measure('C')!.voltage - want)).toBeLessThan(0.01 * want + 1e-3);
    }
    s.runUntil(2e-3);
    expect(s.timeStep).toBe(50e-6);
  });

  it('başlangıçta adım küçüktür ve LTE ile büyür: 1 ms için 100 adımdan az', () => {
    const s = charging();
    const r = s.runUntil(1e-3);
    expect(r.ok).toBe(true);
    expect(r.steps).toBeLessThan(100);
  });
});

describe('Fizik 4: RC süzgeç ve kondansatörde faz', () => {
  // 1 kΩ, 159,15 nF: fc = 1/(2πRC) = 1 kHz.
  const filter = () =>
    new CircuitSimulator(
      circuit().acsource('S', 'a', 'g', ac(1000, 1)).ground('G', 'g').resistor('R', 'a', 'o', 1000).capacitor('C', 'o', 'g', 159.15e-9).voltmeter('VO', 'o', 'g', 'ideal', 'ac').build(),
    );

  it('|H| = 0,7071 (en fazla %0,5) ve faz −45° (en fazla 1°)', () => {
    const s = filter();
    s.runUntil(0.02);
    const out = lockIn(s, 0.02, 1000, () => s.voltageAt('o')!);
    const fc = 1 / (2 * Math.PI * 1000 * 159.15e-9);
    const want = 1 / Math.hypot(1, 1000 / fc);
    expect(rel(out.amplitude, want)).toBeLessThan(0.005);
    expect(Math.abs(degrees(out.phase) - degrees(-Math.atan(1000 / fc)))).toBeLessThan(1);
    // Voltmetrenin etkin değeri de aynı: 0,7071/√2.
    s.advance(0.002);
    expect(rel(s.status('VO').reading!, want / Math.SQRT2)).toBeLessThan(0.005);
  });

  it('kondansatörde akım gerilimden 90° önde (en fazla 1°)', () => {
    const s = filter();
    s.runUntil(0.02);
    const v = lockIn(s, 0.02, 1000, () => s.measure('C')!.voltage);
    const i = lockIn(s, 0.021, 1000, () => s.measure('C')!.current);
    let lead = degrees(i.phase - v.phase);
    if (lead < -180) lead += 360;
    if (lead > 180) lead -= 360;
    expect(Math.abs(lead - 90)).toBeLessThan(1);
    // Xc = 1/(ωC) = 1 kΩ: |I| = |V|/Xc
    expect(rel(i.amplitude, v.amplitude / 1000)).toBeLessThan(0.005);
  });
});

describe('Fizik 4: kare dalga kenarları', () => {
  // Fonksiyon üreteci 1 kHz kare dalga (10 V tepe-tepe: ±5 V), 1 kΩ ve 10 nF. Üretecin 50 Ω'luk
  // çıkış direnci de devrededir: τ = (1 kΩ + 50 Ω)·10 nF = 10,5 µs.
  const tau = (1000 + 50) * 10e-9;
  const squareRc = () =>
    new CircuitSimulator(
      circuit()
        .add('funcgen', 'FG', ['o', 't', 'c'], { waveform: 'square', frequency: 1000, amplitude: 10, offset: 0, earthed: true })
        .resistor('R', 'o', 'k', 1000)
        .capacitor('C', 'k', 'c', 10e-9)
        .build(),
    );

  it('her kenardan sonra v(τ) üstel değişimin 1 − 1/e kesrinde (en fazla %2 hata)', () => {
    const s = squareRc();
    for (let k = 2; k < 8; k++) {
      const edge = k * 0.5e-3;
      s.runUntil(edge);
      const before = s.measure('C')!.voltage;
      const final = k % 2 === 0 ? 5 : -5;
      // Kenardan önce kondansatör önceki seviyeye oturmuştu (50 τ).
      expect(Math.abs(before + final)).toBeLessThan(1e-3);
      s.runUntil(edge + tau);
      const v = s.measure('C')!.voltage;
      const want = final + (before - final) * Math.exp(-1);
      expect(Math.abs(v - want) / Math.abs(final - before)).toBeLessThan(0.02 * (1 - Math.exp(-1)));
    }
  });

  it('kenardan sonra salınım yok: gerilim tekdüze değişir', () => {
    const s = squareRc();
    s.runUntil(1e-3);
    let previous = s.measure('C')!.voltage;
    for (let k = 1; k <= 60; k++) {
      s.runUntil(1e-3 + k * 1e-6);
      const v = s.measure('C')!.voltage;
      expect(v).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = v;
    }
  });

  it('adım kenarı atlamaz: kenardan hemen önce eski, hemen sonra yeni seviye', () => {
    const s = squareRc();
    s.runUntil(2e-3 - 1e-9);
    const out = () => s.voltageAt('o')! - s.voltageAt('c')!;
    expect(out()).toBeLessThan(0);
    s.runUntil(2e-3 + 0.2e-6);
    expect(out()).toBeGreaterThan(0);
  });

  it('kullanılmayan TTL çıkışının kenarları adım sayısını artırmaz', () => {
    const sine = (ttl: boolean) => {
      const b = circuit()
        .add('funcgen', 'FG', ['o', 't', 'c'], { waveform: 'sine', frequency: 1000, amplitude: 2, offset: 0, earthed: true })
        .resistor('R', 'o', 'k', 1000)
        .capacitor('C', 'k', 'c', 100e-9);
      if (ttl) b.resistor('RT', 't', 'c', 1000);
      const s = new CircuitSimulator(b.build());
      return s.runUntil(0.01).steps;
    };
    expect(sine(false)).toBeLessThan(sine(true));
  });
});
