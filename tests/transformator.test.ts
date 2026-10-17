// Transformatör: karşılıklı indüktans ve Faraday'ın indüksiyon yasası. Beklenen değerler fazör
// (karmaşık sayı) çözümünden, enerji korunumundan ve akı bağının değişiminden (∫ε dt = ΔΦ).

import { describe, expect, it } from 'vitest';
import { exampleDoc } from '../src/examples';
import { buildConnectivity } from '../src/model/connectivity';
import { updatePart } from '../src/model/docOps';
import type { CircuitDoc } from '../src/model/types';
import { CircuitSimulator } from '../src/sim';
import { TRANSFORMER_DEFAULTS } from '../src/sim/devices/transformer';
import { circuit } from './helpers';

const rel = (got: number, want: number) => Math.abs(got - want) / Math.abs(want);

/** Karmaşık sayılar (yalnızca gereken işlemler). */
type C = readonly [number, number];
const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const abs = (a: C) => Math.hypot(a[0], a[1]);
const arg = (a: C) => Math.atan2(a[1], a[0]);

/** RS 504-464 varsayılanları; şebeke 230 V etkin (325,27 V tepe), 50 Hz. */
const T = TRANSFORMER_DEFAULTS;
const F = 50;
const W = 2 * Math.PI * F;
const VP = 230 * Math.SQRT2;
const L1 = T.primaryInductance;
const L2 = L1 / T.turnsRatio ** 2;
const M = T.coupling * Math.sqrt(L1 * L2);

/**
 * Fazör çözümü (sargı kapasiteleri 50 Hz'te ihmal edilir: C₂ = 25,6 nF ≈ 124 kΩ):
 *   V₁ = (R₁ + jωL₁)·I₁ + jωM·I₂,   0 = jωM·I₁ + (R₂ + R_L + jωL₂)·I₂
 * I₂ noktalı ikincil uca giren akım; yüke verilen akım −I₂, yükün gerilimi −R_L·I₂.
 */
function phasors(load: number) {
  const z2: C = [T.secondaryResistance + load, W * L2];
  const jwm: C = [0, W * M];
  const zin = add([T.primaryResistance, W * L1], div(mul(jwm, jwm), [-z2[0], -z2[1]]));
  const i1 = div([VP, 0], zin);
  const i2 = div(mul([-jwm[0], -jwm[1]], i1), z2);
  const vload: C = [-load * i2[0], -load * i2[1]];
  return { i1, i2, vload };
}

/** Bir periyot boyunca kilitlemeli (lock-in) ölçüm: genlik ve faz (sin(ωt + φ) biçiminde). */
function lockIn(s: CircuitSimulator, read: () => number, n = 400) {
  const start = s.time;
  let si = 0;
  let co = 0;
  for (let k = 1; k <= n; k++) {
    const t = start + k / (F * n);
    s.runUntil(t);
    const v = read();
    si += v * Math.sin(W * t);
    co += v * Math.cos(W * t);
  }
  return { amplitude: (2 / n) * Math.hypot(si, co), phase: Math.atan2(co, si) };
}

const mains = { waveform: 'sine', amplitude: VP, frequency: F, offset: 0, internalResistance: 0 };
/** Şebeke → birincil; ikincil → yük (ikincil kendi tarafında topraklı: iki taraf yalıtılmış). */
function loaded(load: number, props: Record<string, number> = {}) {
  return new CircuitSimulator(
    circuit()
      .acsource('S', 'p', 'g', mains)
      .ground('G', 'g')
      .add('transformer', 'T', ['p', 'g', 's', 'r'], props)
      .ground('G2', 'r')
      .resistor('RL', 's', 'r', load)
      .build(),
  );
}

describe('Transformatör: Faraday ve karşılıklı indüktans', () => {
  it('yüksüz: birincil akımı ≈ 15 mA etkin (mıknatıslanma), ikincil ≈ 14,2 V etkin; fazör çözümüyle %0,5 içinde', () => {
    const s = loaded(1e9);
    s.runUntil(0.4); // L₁/R₁ ≈ 42 ms: geçici durum söner
    const want = phasors(1e9);
    const i1 = lockIn(s, () => s.measure('T')!.current);
    const v2 = lockIn(s, () => s.voltageAt('s')! - s.voltageAt('r')!);
    expect(rel(i1.amplitude, abs(want.i1))).toBeLessThan(5e-3);
    expect(rel(v2.amplitude, abs(want.vload))).toBeLessThan(5e-3);
    expect(i1.amplitude / Math.SQRT2).toBeGreaterThan(14e-3);
    expect(i1.amplitude / Math.SQRT2).toBeLessThan(16e-3);
    expect(v2.amplitude / Math.SQRT2).toBeGreaterThan(14);
    expect(v2.amplitude / Math.SQRT2).toBeLessThan(14.4);
  });

  it('tam yükte (96 Ω, 125 mA): ikincil ≈ 12 V etkin; akımlar ve fazlar fazör çözümüyle %0,5 ve 1° içinde', () => {
    const s = loaded(96);
    s.runUntil(0.2);
    const want = phasors(96);
    const v2 = lockIn(s, () => s.voltageAt('s')! - s.voltageAt('r')!);
    const i1 = lockIn(s, () => s.measure('T')!.current);
    expect(rel(v2.amplitude, abs(want.vload))).toBeLessThan(5e-3);
    expect(rel(i1.amplitude, abs(want.i1))).toBeLessThan(5e-3);
    const deg = (r: number) => (r * 180) / Math.PI;
    const dphase = (a: number, b: number) => ((deg(a - b) + 540) % 360) - 180;
    expect(Math.abs(dphase(v2.phase, arg(want.vload)))).toBeLessThan(1);
    expect(Math.abs(dphase(i1.phase, arg(want.i1)))).toBeLessThan(1);
    expect(v2.amplitude / Math.SQRT2).toBeGreaterThan(11.5);
    expect(v2.amplitude / Math.SQRT2).toBeLessThan(12.5);
  });

  it('enerji korunumu: giriş gücü = yük gücü + sargı dirençlerinde kaybolan güç (%0,5 içinde)', () => {
    const s = loaded(96);
    s.runUntil(0.2);
    const n = 2000;
    let pin = 0;
    let pload = 0;
    let loss = 0;
    for (let k = 1; k <= n; k++) {
      s.runUntil(0.2 + k / (F * n));
      const m = s.measure('T')!;
      const windings = s.status('T').windings!;
      const vl = s.voltageAt('s')! - s.voltageAt('r')!;
      pin += m.power;
      pload += (vl * vl) / 96;
      loss += windings[0]!.current ** 2 * T.primaryResistance + windings[1]!.current ** 2 * T.secondaryResistance;
    }
    expect(rel(pload + loss, pin)).toBeLessThan(5e-3);
    // Verim (çekirdek kaybı modellenmez): ≈ %72 (veri sayfası, 3 VA'da çekirdek kaybıyla: > %67).
    expect(pload / pin).toBeGreaterThan(0.68);
    expect(pload / pin).toBeLessThan(0.76);
  });

  it('sarım oranı: neredeyse ideal transformatörde (k = 0,999, R = 0) V₂ / V₁ ≈ N₂ / N₁; 0,5 oranında gerilim yükselir', () => {
    for (const n of [2, 10, 0.5]) {
      const s = new CircuitSimulator(
        circuit()
          .acsource('S', 'p', 'g', { ...mains, amplitude: 10 })
          .ground('G', 'g')
          .add('transformer', 'T', ['p', 'g', 's', 'r'], { turnsRatio: n, primaryInductance: 100, coupling: 0.999, primaryResistance: 0, secondaryResistance: 0 })
          .ground('G2', 'r')
          .resistor('RL', 's', 'r', 1e6)
          .build(),
      );
      s.runUntil(0.1);
      const v2 = lockIn(s, () => s.voltageAt('s')! - s.voltageAt('r')!);
      expect(rel(v2.amplitude, (10 * 0.999) / n)).toBeLessThan(5e-3);
    }
  });

  it('doğru akımda ikincilde gerilim yok; yalnızca akım değişirken: ∫ε dt = ΔΦ (akı bağı M·ΔI₁)', () => {
    // 12 V, anahtar kapanınca birincil akımı 12 V / 1167 Ω'a çıkar (τ = L₁/R₁ ≈ 42 ms). İkincilde 10 kΩ.
    const build = (closed: boolean) =>
      circuit()
        .battery('B', 'v', 'g', 12)
        .ground('G', 'g')
        .switch('K', 'v', 'p', closed)
        .add('transformer', 'T', ['p', 'g', 's', 'r'])
        .ground('G2', 'r')
        .resistor('RL', 's', 'r', 10e3)
        .build();
    const s = new CircuitSimulator(build(false));
    s.runUntil(1e-3);
    s.update(build(true));
    let area = 0;
    let last = s.time;
    while (s.time < 0.6) {
      s.advance(20e-6);
      area += (s.voltageAt('s')! - s.voltageAt('r')!) * (s.time - last);
      last = s.time;
    }
    const i1 = 12 / T.primaryResistance;
    // ∫v dt·(1 + R₂/R_L) = M·ΔI₁ (ikincil akımı başta ve sonda 0).
    expect(rel(area * (1 + T.secondaryResistance / 10e3), M * i1)).toBeLessThan(0.01);
    // Kararlı durumda ikincilde gerilim yok, birincil yalnızca sargı direncidir.
    expect(Math.abs(s.voltageAt('s')! - s.voltageAt('r')!)).toBeLessThan(1e-4);
    expect(rel(s.measure('T')!.current, i1)).toBeLessThan(1e-3);
  });

  it('galvanik yalıtım: birincil ile ikincil arasındaki gerilim farkı akım geçirmez', () => {
    // İkincil, birincilin toprağına göre 100 V'luk bir pille yükseltilmiş; aradan hiç akım geçmemeli.
    const s = new CircuitSimulator(
      circuit()
        .acsource('S', 'p', 'g', mains)
        .ground('G', 'g')
        .add('transformer', 'T', ['p', 'g', 's', 'r'])
        .battery('B', 'r', 'g', 100)
        .resistor('RL', 's', 'r', 96)
        .build(),
    );
    s.runUntil(0.2);
    const n = 200;
    let mean = 0;
    for (let k = 1; k <= n; k++) {
      s.runUntil(0.2 + k / (F * n));
      mean += s.measure('B')!.current / n;
    }
    // Pilden yalnızca ikincil sargı kapasitesinin ve C₁'in yer değiştirme akımı (ortalaması 0).
    expect(Math.abs(mean)).toBeLessThan(1e-6);
  });
});

describe('Transformatör örnekleri (metinlerdeki sayılar)', () => {
  const idOf = (doc: CircuitDoc, label: string) => doc.parts.find((p) => p.label === label)!.id;
  const between = (x: number, lo: number, hi: number) => {
    expect(x).toBeGreaterThan(lo);
    expect(x).toBeLessThan(hi);
  };

  it('şebekeden 12 V: birincil 230 V ve ≈ 16 mA, ikincil ≈ 11,8 V ve 123 mA; verim ≈ %73', () => {
    const doc = exampleDoc('transformator')!;
    const s = new CircuitSimulator(buildConnectivity(doc).netlist);
    s.runUntil(0.5);
    s.advance(0.04);
    between(s.status(idOf(doc, 'V1')).reading!, 229.5, 230.5);
    between(s.status(idOf(doc, 'A1')).reading!, 16e-3, 17e-3);
    between(s.status(idOf(doc, 'V2')).reading!, 11.7, 11.9);
    between(s.status(idOf(doc, 'A2')).reading!, 0.122, 0.124);
    let pin = 0;
    let pout = 0;
    for (let k = 0; k < 1000; k++) {
      s.advance(0.02 / 1000);
      pin += s.measure(idOf(doc, 'T1'))!.power / 1000;
      pout += s.measure(idOf(doc, 'RL'))!.power / 1000;
    }
    between(pout / pin, 0.71, 0.75);
  });

  it('adaptör: 470 Ω’da ≈ 15,8 V DC ve ≈ 0,47 V dalgalanma; yüksüz ≈ 19,1 V; ikincil yalıtılmış (bilgi mesajı)', () => {
    const doc = exampleDoc('adaptor')!;
    const s = new CircuitSimulator(buildConnectivity(doc).netlist);
    expect(s.topologyDiagnostics.map((d) => d.code)).toEqual(['floating-island']);
    expect(s.runUntil(1.5).ok).toBe(true);
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < 2000; k++) {
      s.advance(0.02 / 2000);
      const v = s.measure(idOf(doc, 'RL'))!.voltage;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    between(s.status(idOf(doc, 'V1')).reading!, 15.6, 16);
    between(hi - lo, 0.4, 0.55);
    const rl = doc.parts.find((p) => p.label === 'RL')!;
    const open = new CircuitSimulator(buildConnectivity(updatePart(doc, rl.id, { props: { ...rl.props, resistance: 1e9 } })).netlist);
    open.runUntil(1.5);
    between(open.status(idOf(doc, 'V1')).reading!, 18.9, 19.3);
  });

  it('doğru akım: kapanışta ikincilde ≈ 0,74 V’tan τ ≈ 42 ms ile sönen darbe; açılışta sıçrama ve Lenz uyarısı', () => {
    const doc = exampleDoc('transformator-dc')!;
    const sw = doc.parts.find((p) => p.label === 'S1')!;
    const closed = updatePart(doc, sw.id, { props: { closed: true } });
    const s = new CircuitSimulator(buildConnectivity(doc).netlist);
    s.runUntil(0.01);
    s.update(buildConnectivity(closed).netlist);
    const t0 = s.time;
    const v = () => s.measure(idOf(doc, 'RL'))!.voltage;
    s.runUntil(t0 + 1e-3);
    const v1 = v();
    between(v1, 0.7, 0.75);
    s.runUntil(t0 + 1e-3 + 0.0416);
    expect(rel(v() / v1, Math.exp(-1))).toBeLessThan(0.02);
    s.runUntil(t0 + 0.6);
    expect(Math.abs(v())).toBeLessThan(1e-4);
    s.update(buildConnectivity(doc).netlist);
    let spike = 0;
    const t1 = s.time;
    while (s.time < t1 + 0.02) {
      s.advance(1e-5);
      spike = Math.max(spike, Math.abs(v()));
    }
    between(spike, 200, 350);
    expect(s.runtimeDiagnostics.map((d) => d.code)).toContain('inductor-spike');
  });
});
