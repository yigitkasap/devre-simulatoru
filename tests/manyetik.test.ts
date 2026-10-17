// "Manyetik alanı göster": kablonun çevresindeki alanın yönü (sağ el kuralı) ve yoğunluğu.

import { describe, expect, it } from 'vitest';
import { fieldStrength, wireMarks } from '../src/editor/MagneticField';

const outs = (m: ReturnType<typeof wireMarks>) => m.filter((k) => k.out);
const ins = (m: ReturnType<typeof wireMarks>) => m.filter((k) => !k.out);

describe('Manyetik alan: sağ el kuralı', () => {
  it('sağa akan akımın üstünde alan sayfadan dışarı (⊙), altında içeri (⊗); akım ters dönünce yer değiştirir', () => {
    const right = wireMarks({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.1);
    expect(outs(right).every((m) => m.y < 0)).toBe(true);
    expect(ins(right).every((m) => m.y > 0)).toBe(true);
    const left = wireMarks({ x: 0, y: 0 }, { x: 10, y: 0 }, -0.1);
    expect(outs(left).every((m) => m.y > 0)).toBe(true);
  });

  it('ekranda aşağı akan akımda ⊙ sağda (B = I·dl × r̂: −ŷ × x̂ = +ẑ)', () => {
    const down = wireMarks({ x: 0, y: 0 }, { x: 0, y: 10 }, 0.1);
    expect(outs(down).every((m) => m.x > 0)).toBe(true);
    expect(ins(down).every((m) => m.x < 0)).toBe(true);
  });

  it('yoğunluk akımla artar: 1 µA’in altında işaret yok, 1 A’de 1 mA’dekinden sık', () => {
    expect(wireMarks({ x: 0, y: 0 }, { x: 20, y: 0 }, 5e-9)).toEqual([]);
    expect(fieldStrength(1e-3)).toBeCloseTo(0.5, 6);
    expect(fieldStrength(1)).toBe(1);
    expect(wireMarks({ x: 0, y: 0 }, { x: 20, y: 0 }, 1).length).toBeGreaterThan(wireMarks({ x: 0, y: 0 }, { x: 20, y: 0 }, 1e-3).length);
  });
});
