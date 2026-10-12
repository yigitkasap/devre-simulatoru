import { describe, expect, it } from 'vitest';
import { luFactor, luSolve, SingularMatrixError, solveLinear } from '../src/sim/lu';

describe('LU ayrıştırması', () => {
  it('pivotlama gerektiren 3×3 sistemi çözer', () => {
    // İlk pivot 0: satır değişimi gerekir.
    const a = new Float64Array([0, 2, 1, 1, 1, 1, 2, 1, 3]);
    const expected = [1, -2, 3];
    const z = new Float64Array(3);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) z[i]! += a[i * 3 + j]! * expected[j]!;
    const x = solveLinear(a, z, 3);
    expected.forEach((v, i) => expect(x[i]).toBeCloseTo(v, 12));
  });

  it('ayrıştırma farklı sağ taraflar için yeniden kullanılabilir', () => {
    const a = new Float64Array([4, 1, 1, 3]);
    const f = luFactor(a, 2);
    const x = new Float64Array(2);
    luSolve(f, new Float64Array([1, 2]), x);
    expect(4 * x[0]! + x[1]!).toBeCloseTo(1, 12);
    expect(x[0]! + 3 * x[1]!).toBeCloseTo(2, 12);
    luSolve(f, new Float64Array([5, 0]), x);
    expect(4 * x[0]! + x[1]!).toBeCloseTo(5, 12);
  });

  it('tekil matriste sıfır pivot hatası verir', () => {
    const a = new Float64Array([1, 2, 2, 4]);
    expect(() => luFactor(a, 2)).toThrow(SingularMatrixError);
  });
});
