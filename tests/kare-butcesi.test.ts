// Arayüzün kare bütçesi (advance'in maxSteps ve deadline parametreleri): süre sınırı kesindir; adım
// sayısı sınırına gelinmese de süre bitince kare kesilir ve kalan süre atlanır (truncated). Süre
// kaldıkça adım sayısı bütçesi en çok 4 katına kadar aşılabilir.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CircuitSimulator } from '../src/sim';
import { circuit } from './helpers';

// 50 Hz sinüs, 1 kΩ ve 1 µF: geçici çözüm, kare başına onlarca adım.
const rc = () =>
  new CircuitSimulator(
    circuit()
      .add('acsource', 'V', ['a', 'g'], { waveform: 'sine', amplitude: 5, frequency: 50, offset: 0, internalResistance: 0 })
      .ground('G', 'g')
      .resistor('R', 'a', 'c', 1000)
      .capacitor('C', 'c', 'g', 1e-6)
      .build(),
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Kare bütçesi: süre sınırı kesin', () => {
  it('süre sınırı geçmişse adım atılmaz, kare kesilir (adım bütçesi dolmamış olsa da)', () => {
    const s = rc();
    const r = s.advance(1 / 60, 1e6, performance.now() - 1);
    expect(r.ok).toBe(true);
    expect(r.truncated).toBe(true);
    expect(r.steps).toBe(0);
  });

  it('her adım 1 ms sürerse 10 ms\'lik sınırda ≈ 10 adımda kesilir; adım bütçesi (1000) dolmaz', () => {
    const s = rc();
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 1));
    const r = s.advance(0.1, 1000, 10);
    expect(r.truncated).toBe(true);
    expect(r.steps).toBeGreaterThan(0);
    expect(r.steps).toBeLessThanOrEqual(10);
    expect(s.time).toBeLessThan(0.1);
  });

  it('süre yetiyorsa kesilmez: istenen süre ilerler (bir adımdan kısa artık sonraki kareye kalır)', () => {
    const s = rc();
    const r = s.advance(1 / 60, 1e6, performance.now() + 60_000);
    expect(r.truncated).toBeUndefined();
    expect(r.steps).toBeGreaterThan(0);
    expect(s.time).toBeLessThanOrEqual(1 / 60 + 1e-12);
    expect(s.time).toBeGreaterThan(1 / 60 - s.maxTimeStep);
  });

  it('süre sınırı yoksa adım bütçesinde kesilir; varsa süre kaldıkça bütçenin 4 katına kadar sürer', () => {
    const a = rc();
    const ra = a.advance(1, 5);
    expect(ra.truncated).toBe(true);
    expect(ra.steps).toBe(5);
    const b = rc();
    const rb = b.advance(1, 5, performance.now() + 60_000);
    expect(rb.truncated).toBe(true);
    expect(rb.steps).toBe(20);
  });
});
