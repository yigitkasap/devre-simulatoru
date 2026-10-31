// Küçük sinyal AC çözümü (A5): çalışma noktasında doğrusallaştırılmış devrede (motorun linearize'ı)
// her frekansta (G + jω·C)·x = b. Karmaşık yoğun LU (kısmi pivotlama); devreler küçük (en çok birkaç
// yüz bilinmeyen), frekans başına bir ayrıştırma yeter.

import type { Linearized } from './engine';

export interface ComplexVector {
  readonly re: Float64Array;
  readonly im: Float64Array;
}

/**
 * (G + jωC)·x = b'nin çözümü (b gerçel: kaynağın genliği). Tekil matriste null.
 */
export function solveAc(lin: Linearized, omega: number, b: Float64Array): ComplexVector | null {
  const n = lin.size;
  const ar = Float64Array.from(lin.G);
  const ai = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) ai[i] = omega * lin.C[i]!;
  const xr = Float64Array.from(b);
  const xi = new Float64Array(n);
  let scale = 0;
  for (let i = 0; i < n * n; i++) scale = Math.max(scale, Math.hypot(ar[i]!, ai[i]!));
  const tiny = 1e-300 + scale * 1e-18;
  for (let k = 0; k < n; k++) {
    // Kısmi pivotlama: k. sütunda en büyük modüllü satır.
    let p = k;
    let best = Math.hypot(ar[k * n + k]!, ai[k * n + k]!);
    for (let r = k + 1; r < n; r++) {
      const m = Math.hypot(ar[r * n + k]!, ai[r * n + k]!);
      if (m > best) {
        best = m;
        p = r;
      }
    }
    if (best <= tiny) return null;
    if (p !== k) {
      for (let c = 0; c < n; c++) {
        swap(ar, k * n + c, p * n + c);
        swap(ai, k * n + c, p * n + c);
      }
      swap(xr, k, p);
      swap(xi, k, p);
    }
    const pr = ar[k * n + k]!;
    const pi = ai[k * n + k]!;
    const d = pr * pr + pi * pi;
    for (let r = k + 1; r < n; r++) {
      const er = ar[r * n + k]!;
      const ei = ai[r * n + k]!;
      if (er === 0 && ei === 0) continue;
      // f = A[r][k] / A[k][k]
      const fr = (er * pr + ei * pi) / d;
      const fi = (ei * pr - er * pi) / d;
      for (let c = k; c < n; c++) {
        const kr = ar[k * n + c]!;
        const ki = ai[k * n + c]!;
        ar[r * n + c]! -= fr * kr - fi * ki;
        ai[r * n + c]! -= fr * ki + fi * kr;
      }
      const br = xr[k]!;
      const bi = xi[k]!;
      xr[r]! -= fr * br - fi * bi;
      xi[r]! -= fr * bi + fi * br;
    }
  }
  for (let k = n - 1; k >= 0; k--) {
    let sr = xr[k]!;
    let si = xi[k]!;
    for (let c = k + 1; c < n; c++) {
      const mr = ar[k * n + c]!;
      const mi = ai[k * n + c]!;
      sr -= mr * xr[c]! - mi * xi[c]!;
      si -= mr * xi[c]! + mi * xr[c]!;
    }
    const pr = ar[k * n + k]!;
    const pi = ai[k * n + k]!;
    const d = pr * pr + pi * pi;
    xr[k] = (sr * pr + si * pi) / d;
    xi[k] = (si * pr - sr * pi) / d;
  }
  for (let i = 0; i < n; i++) if (!Number.isFinite(xr[i]!) || !Number.isFinite(xi[i]!)) return null;
  return { re: xr, im: xi };
}

function swap(a: Float64Array, i: number, j: number): void {
  const t = a[i]!;
  a[i] = a[j]!;
  a[j] = t;
}
