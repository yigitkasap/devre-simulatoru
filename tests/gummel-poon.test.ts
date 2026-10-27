// BC107'nin Gummel-Poon modeli (NXP BC547B kartı; ngspice bjtload.c denklemleri): Jacobian'ın
// sonlu farkla doğruluğu, β'nın akımla değişimi (düşük akımda ISE, yüksek akımda IKF) ve sınır
// durumda Ebers-Moll + Early modeline indirgenmesi.

import { describe, expect, it } from 'vitest';
import { CircuitSimulator } from '../src/sim';
import { BJT_PARAMS, evaluateBjt, evaluateGummelPoon, GUMMEL_POON } from '../src/sim/devices/bjt';
import { circuit } from './helpers';

const GP = GUMMEL_POON.BC107!;

describe('Gummel-Poon (BC107)', () => {
  it('Jacobian sonlu farkla tutar (ileri, ters, doyum, kesim)', () => {
    const h = 1e-7;
    for (const vbe of [-2, 0.3, 0.6, 0.7, 0.8, 0.9])
      for (const vbc of [-30, -5, -0.5, 0.3, 0.6, 0.75]) {
        const e = evaluateGummelPoon(vbe, vbc, 200, GP);
        const du = evaluateGummelPoon(vbe + h, vbc, 200, GP);
        const dl = evaluateGummelPoon(vbe - h, vbc, 200, GP);
        const wu = evaluateGummelPoon(vbe, vbc + h, 200, GP);
        const wl = evaluateGummelPoon(vbe, vbc - h, 200, GP);
        for (const k of ['collector', 'base'] as const) {
          const fdU = (du[k].current - dl[k].current) / (2 * h);
          const fdW = (wu[k].current - wl[k].current) / (2 * h);
          // Sonlu farkın yuvarlama gürültüsü ≈ 1e-16·|I|/h: çok küçük türevlerde mutlak alt sınır.
          const close = (a: number, b: number, i: number) => Math.abs(a - b) <= 1e-4 * Math.abs(b) + 1e-12 + (1e-15 * Math.abs(i)) / h;
          expect(close(e[k].du, fdU, e[k].current), `${k} du @ ${vbe}, ${vbc}: ${e[k].du} / ${fdU}`).toBe(true);
          expect(close(e[k].dw, fdW, e[k].current), `${k} dw @ ${vbe}, ${vbc}: ${e[k].dw} / ${fdW}`).toBe(true);
        }
      }
  });

  it('IKF, VAR sonsuz, ISE = ISC = 0, NF = NR = 1 iken Ebers-Moll + Early ile aynı', () => {
    const em = { ...GP, is: BJT_PARAMS.saturationCurrent, nf: 1, nr: 1, ise: 0, isc: 0, br: BJT_PARAMS.reverseBeta, ikf: Infinity, ikr: Infinity, vaf: BJT_PARAMS.earlyVoltage, var: Infinity };
    for (const [vbe, vbc] of [[0.65, -5], [0.7, 0.5], [-1, 0.6]] as const) {
      const a = evaluateGummelPoon(vbe, vbc, 200, em);
      const b = evaluateBjt(vbe, vbc, 200);
      expect(a.collector.current).toBeCloseTo(b.collector.current, 12);
      expect(a.base.current).toBeCloseTo(b.base.current, 12);
    }
  });

  /** V_CE = 5 V'ta verilen kollektör akımındaki h_FE (V_BE ikiye bölmeyle; I_B durumdan). */
  function hfeAt(ic: number, beta = 200): number {
    let lo = 0.3;
    let hi = 1.0;
    let last = { ic: 0, ib: 1 };
    for (let k = 0; k < 60; k++) {
      const vbe = (lo + hi) / 2;
      const sim = new CircuitSimulator(
        circuit().battery('BC', 'c', 'g', 5).ground('G', 'g').battery('BB', 'b', 'g', vbe).add('npn', 'Q', ['c', 'b', 'g'], { model: 'BC107', beta }).build(),
      );
      sim.runUntil(0);
      last = { ic: sim.measure('Q')!.current, ib: sim.status('Q').control!.current };
      if (last.ic < ic) lo = vbe;
      else hi = vbe;
      if (Math.abs(last.ic / ic - 1) < 1e-4) break;
    }
    return last.ic / last.ib;
  }

  it('β akımla değişir: 2 mA’de ≈ β, 100 mA’de yüksek enjeksiyonla ≈ %30 düşük, 10 µA’de sızıntıyla düşük', () => {
    const mid = hfeAt(2e-3);
    const high = hfeAt(100e-3);
    const low = hfeAt(10e-6);
    expect(mid / 200).toBeGreaterThan(0.93);
    expect(mid / 200).toBeLessThan(1.05);
    expect(high / mid).toBeGreaterThan(0.55);
    expect(high / mid).toBeLessThan(0.8);
    expect(low).toBeLessThan(mid);
  });
});
