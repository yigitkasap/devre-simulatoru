/**
 * Kısmi pivotlamalı yoğun LU ayrıştırması: P·A = L·U.
 *
 * A·x = z sistemini önce A'yı bir kez ayrıştırıp sonra her sağ taraf için ileri/geri
 * yerine koyma yaparak çözeriz. Doğrusal devrelerde aynı zaman adımı için matris değişmediğinden
 * ayrıştırma yeniden kullanılır; yalnızca z değişir.
 *
 * Matrisler satır sıralı tek boyutlu Float64Array olarak tutulur: A[i][j] = a[i * n + j].
 */

/** Pivot bu değerden küçükse matris tekil sayılır. Her düğümde 1e-12 S gmin olduğundan
 * sağlıklı bir devrede pivotlar bu sınırın çok üstündedir. */
const PIVOT_EPSILON = 1e-20;

export class SingularMatrixError extends Error {
  /** Çözülemeyen bilinmeyenin (sütunun) indeksi. */
  readonly column: number;
  constructor(column: number) {
    super(`Tekil matris: ${column}. bilinmeyen belirlenemiyor`);
    this.name = 'SingularMatrixError';
    this.column = column;
  }
}

export interface LUFactorization {
  readonly n: number;
  /** L (birim alt üçgen, köşegen yazılmaz) ve U aynı dizide. */
  readonly lu: Float64Array;
  /** Satır permütasyonu: ayrıştırılmış i. satır, özgün perm[i]. satırdır. */
  readonly perm: Int32Array;
}

/**
 * A matrisini ayrıştırır. `a` değiştirilmez; sonuç `out` verilirse onun içine yazılır.
 * @throws SingularMatrixError sıfır pivot çıkarsa
 */
export function luFactor(a: Float64Array, n: number, out?: LUFactorization): LUFactorization {
  const result: LUFactorization =
    out && out.n === n ? out : { n, lu: new Float64Array(n * n), perm: new Int32Array(n) };
  const lu = result.lu;
  const perm = result.perm;
  lu.set(a);
  for (let i = 0; i < n; i++) perm[i] = i;

  for (let k = 0; k < n; k++) {
    // Kısmi pivotlama: k. sütunda mutlak değeri en büyük satırı bul.
    let pivotRow = k;
    let pivotAbs = Math.abs(lu[k * n + k]!);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(lu[i * n + k]!);
      if (v > pivotAbs) {
        pivotAbs = v;
        pivotRow = i;
      }
    }
    if (!(pivotAbs > PIVOT_EPSILON)) throw new SingularMatrixError(k);

    if (pivotRow !== k) {
      for (let j = 0; j < n; j++) {
        const t = lu[k * n + j]!;
        lu[k * n + j] = lu[pivotRow * n + j]!;
        lu[pivotRow * n + j] = t;
      }
      const t = perm[k]!;
      perm[k] = perm[pivotRow]!;
      perm[pivotRow] = t;
    }

    const pivot = lu[k * n + k]!;
    for (let i = k + 1; i < n; i++) {
      const factor = lu[i * n + k]! / pivot;
      lu[i * n + k] = factor;
      if (factor === 0) continue;
      for (let j = k + 1; j < n; j++) {
        lu[i * n + j] = lu[i * n + j]! - factor * lu[k * n + j]!;
      }
    }
  }
  return result;
}

/** L·U·x = P·z sistemini çözer; sonuç `x` içine yazılır. */
export function luSolve(f: LUFactorization, z: Float64Array, x: Float64Array): void {
  const { n, lu, perm } = f;
  // İleri yerine koyma: L·y = P·z (L'nin köşegeni 1)
  for (let i = 0; i < n; i++) {
    let sum = z[perm[i]!]!;
    for (let j = 0; j < i; j++) sum -= lu[i * n + j]! * x[j]!;
    x[i] = sum;
  }
  // Geri yerine koyma: U·x = y
  for (let i = n - 1; i >= 0; i--) {
    let sum = x[i]!;
    for (let j = i + 1; j < n; j++) sum -= lu[i * n + j]! * x[j]!;
    x[i] = sum / lu[i * n + i]!;
  }
}

/** Tek seferlik çözüm kolaylığı. */
export function solveLinear(a: Float64Array, z: Float64Array, n: number): Float64Array {
  const x = new Float64Array(n);
  luSolve(luFactor(a, n), z, x);
  return x;
}
