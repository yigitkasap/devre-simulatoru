// Bode'un "Teori" eğrisi (A5, küçük sinyal AC): devre, kaynağın genliği sıfırken DC çalışma noktasına
// getirilir ve oturtulur (ölçülen Bode'daki gibi); motor çalışma noktasında doğrusallaştırılır (G, C) ve
// her frekansta karmaşık sistem çözülür. Kazanç = |V(çıkış) / V(giriş)|, faz = arg. Parça modelleri
// ölçümle aynı (motorun kendi katkıları). Ölçülen Bode teoriyi kendi oturttuğu simülatörden hesaplar
// (measureBode → onSettled): ek süre yok, iki eğri aynı çalışma noktasında.

import { CircuitSimulator } from '../../sim';
import { solveAc, type ComplexVector } from '../../sim/ac';
import type { Linearized } from '../../sim/engine';
import { atOperatingPoint, settleDc, withFrequency, type BodeRequest, type Probe } from './bode';

export interface TheoryPoint {
  readonly f: number;
  /** Kazanç (kat) ve faz (°, açılmış; ilk nokta (−270, 90] aralığında, ölçülenle aynı kural). */
  readonly gain: number;
  readonly phase: number;
}

export type TheoryResult =
  | { readonly ok: true; readonly points: readonly TheoryPoint[] }
  /** run: devre çalışmıyor ya da oturmadı; linear: doğrusallaştırılamadı; probe: giriş ya da çıkış bulunamadı. */
  | { readonly ok: false; readonly reason: 'run' | 'linear' | 'probe' };

const voltage = (x: ComplexVector, lin: Linearized, p: Probe): { re: number; im: number } | null => {
  const node = (key: string | null) => (key === null ? -1 : lin.nodeOf(key));
  const a = node(p.a);
  const b = node(p.b);
  if (a === null || b === null) return null;
  const at = (i: number) => (i < 0 ? { re: 0, im: 0 } : { re: x.re[i]!, im: x.im[i]! });
  const va = at(a);
  const vb = at(b);
  return { re: va.re - vb.re, im: va.im - vb.im };
};

/** Oturmuş simülatörden (çalışma noktası) teori eğrisi. */
export function theoryAt(sim: CircuitSimulator, req: BodeRequest, freqs: readonly number[], cancelled?: () => boolean): TheoryResult {
  const lin = sim.linearize();
  if (!lin) return { ok: false, reason: 'linear' };
  const row = lin.branchOf(req.source, 0);
  if (row === null) return { ok: false, reason: 'probe' };
  const b = new Float64Array(lin.size);
  b[row] = 1;
  const points: TheoryPoint[] = [];
  let last: number | null = null;
  for (const f of freqs) {
    if (cancelled?.()) break;
    const x = solveAc(lin, 2 * Math.PI * f, b);
    if (!x) return { ok: false, reason: 'linear' };
    const vin = voltage(x, lin, req.input);
    const vout = voltage(x, lin, req.output);
    if (!vin || !vout) return { ok: false, reason: 'probe' };
    const inMag = Math.hypot(vin.re, vin.im);
    if (!(inMag > 0)) return { ok: false, reason: 'probe' };
    const gain = Math.hypot(vout.re, vout.im) / inMag;
    const raw = ((Math.atan2(vout.im, vout.re) - Math.atan2(vin.im, vin.re)) * 180) / Math.PI;
    const wrapped = raw - 360 * Math.round(raw / 360);
    let phase: number = last === null ? (wrapped > 90 ? wrapped - 360 : wrapped) : wrapped;
    if (last !== null) phase += 360 * Math.round((last - phase) / 360);
    last = phase;
    points.push({ f, gain, phase });
  }
  return { ok: true, points };
}

/** Ölçüm yapmadan teori eğrisi `freqs` frekanslarında (çalışma noktası ve oturtma dahil). */
export function theoryBode(req: BodeRequest, freqs: readonly number[], cancelled?: () => boolean): TheoryResult {
  const sim = new CircuitSimulator(atOperatingPoint(withFrequency(req.netlist, req.source, 10, true), cancelled));
  if (!sim.canRun || !settleDc(sim, req, cancelled)) return { ok: false, reason: 'run' };
  return theoryAt(sim, req, freqs, cancelled);
}
