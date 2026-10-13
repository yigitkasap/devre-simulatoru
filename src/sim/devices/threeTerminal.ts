// Üç uçlu doğrusal olmayan bileşenlerin (transistörler) Newton-Raphson katkısı.
//
// Bileşenin her ucuna dışarıdan GİREN akım, iki kontrol geriliminin (u, w) fonksiyonudur. Kontrol
// gerilimleri uç gerilimlerinin doğrusal birleşimidir ve kutuplu bileşenlerde (PNP, P kanallı)
// işaretle çarpılır:  u = s·(cu · v),  w = s·(cw · v),  s = +1 (NPN, N kanal) ya da −1.
// Model akımı I(u, w) "N tipi" bir bileşen için yazılır; gerçek akım s·I'dır.
//
// I(u, w), (u0, w0) çevresinde doğrusallaştırılır:
//   s·I ≈ s·I0 + a·(cu · v) + b·(cw · v) − s·(a·u0 + b·w0),   a = ∂I/∂u,  b = ∂I/∂w
// (s² = 1 olduğundan türevlerin işareti değişmez). Uca giren akım düğümden çıkan akım olduğundan:
//   A[uç][j] += a·cu[j] + b·cw[j],   z[uç] −= s·(I0 − a·u0 − b·w0)

import type { MnaSystem } from '../mna';

export interface TerminalLinearization {
  /** Uca giren model akımı (N tipi bileşen için). */
  readonly current: number;
  /** ∂I/∂u */
  readonly du: number;
  /** ∂I/∂w */
  readonly dw: number;
}

export function stampThreeTerminal(
  sys: MnaSystem,
  nodes: readonly number[],
  sign: 1 | -1,
  cu: readonly number[],
  cw: readonly number[],
  terminals: readonly TerminalLinearization[],
  u: number,
  w: number,
): void {
  terminals.forEach((t, k) => {
    const row = nodes[k]!;
    for (let j = 0; j < nodes.length; j++) {
      const g = t.du * cu[j]! + t.dw * cw[j]!;
      if (g !== 0) sys.add(row, nodes[j]!, g);
    }
    sys.addRhs(row, -sign * (t.current - t.du * u - t.dw * w));
  });
}

/** FET'lerde gerilim adımını yumuşakça sınırlar (karesel eğride aşırı sıçramayı önler). */
export function limitStep(vnew: number, vold: number, maxStep: number): { v: number; limited: boolean } {
  const delta = vnew - vold;
  if (Math.abs(delta) <= maxStep) return { v: vnew, limited: false };
  return { v: vold + Math.sign(delta) * maxStep, limited: true };
}
